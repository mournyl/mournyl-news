// Meal Deals: real, structured restaurant offers.
//
// How it works (designed so no run can ever lose its work):
//   COLLECT  once a day (5 AM cron, or whenever the queue is empty and stale): read the deal feeds,
//            keep fresh deal-looking articles we haven't read yet, store them as a queue in KV.
//   PROCESS  each run takes articles off the queue ONE AT A TIME: reads the full article, has Workers AI
//            pull out only what it states (brand, exact offer, conditions, start/end dates), checks that
//            against the article text, and SAVES immediately before moving to the next one.
//   Runs happen: 5 AM cron (up to ~12 min), /api/deals/run (~50 s), and page loads while the queue
//   isn't empty (one article in the background). Expired deals drop off automatically.

import { getFeed, bing, decode, UA } from "./feeds.js";

const SOURCES = [
  ["Fast Food Post", "https://www.fastfoodpost.com/feed/"],
  ["Chew Boom", "https://chewboom.substack.com/feed"],
  ["Bing News", bing("fast food deal")],
  ["Bing News", bing("restaurant BOGO deal")],
  ["Bing News", bing("free food deal today")],
  ["Bing News", bing("national day free restaurant deal")],
  // roundups list many chains at once, so they're the richest source
  ["Bing News", bing("fast food deals this week")],
  ["Bing News", bing("restaurant deals this week")],
  ["Bing News", bing("free food deals")],
  ["Bing News", bing("food deals today")],
];
const MODEL = "@cf/meta/llama-3.3-70b-instruct-fp8-fast";
const FALLBACK_MODEL = "@cf/meta/llama-3.1-8b-instruct";
const AI_TIMEOUT_MS = 45000;
const MAX_ARTICLE_AGE_DAYS = 21;   // only read articles this new
const UPCOMING_DAYS = 14;          // show offers that start within this window
const QUEUE_MAX = 30;              // articles read per day (~6,000 AI neurons; free allowance is 10,000/day)
const SHOW = 24;                   // page shows 8, "Show all" reveals the rest
const TZ = "America/New_York";
const DAY = 864e5;

const todayStr = (d = new Date()) => new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
const addDays = (s, n) => todayStr(new Date(Date.parse(s + "T12:00:00Z") + n * DAY));
const getJSON = (env, k) => env.DEALS.get(k, "json");
const putJSON = (env, k, v, opts) => env.DEALS.put(k, JSON.stringify(v), opts);

// ---------------------------------------------------------------- read side (used by /api/news)
export async function getMealDeals(env, ctx) {
  if (!env || !env.DEALS) return { offers: [], complete: true };
  const [stored, state] = await Promise.all([getJSON(env, "mealdeals"), getJSON(env, "mealdeals:state")]);
  const pending = !state || state.queue.length > 0 || Date.now() - Date.parse(state.collected) > 30 * 36e5;
  // queue not finished (or never started / missed 5 AM) → read one more article in the background
  if (env.AI && pending) ctx.waitUntil(step(env, { budgetMs: 1, parallel: 1, source: "page" }).catch(() => {}));
  return { offers: live(stored ? stored.offers : []).slice(0, SHOW), complete: !pending };
}

// GET /api/deals/status
export async function dealsStatus(env) {
  if (!env.DEALS) return { error: "DEALS KV binding missing" };
  if (!env.AI) return { error: "AI binding missing" };
  const [stored, state, st] = await Promise.all([getJSON(env, "mealdeals"), getJSON(env, "mealdeals:state"), getJSON(env, "mealdeals:status")]);
  return {
    offers_live: stored ? live(stored.offers).length : 0,
    queue_left: state ? state.queue.length : null,
    articles_read_total: state ? state.done.length : 0,
    collected: state ? state.collected : null,
    ...(st || {}),
  };
}

// re-check dates at read time so a deal disappears the moment it ends
function live(offers) {
  const today = todayStr(), soon = addDays(today, UPCOMING_DAYS);
  return offers
    .filter(o => (!o.end_date || o.end_date >= today) && (!o.start_date || o.start_date <= soon))
    .map(o => ({ ...o, status: o.start_date && o.start_date > today ? "soon" : "now" }))
    .sort((a, b) => (a.status === b.status ? 0 : a.status === "now" ? -1 : 1)
      || (a.end_date || "9999").localeCompare(b.end_date || "9999")
      || (b.ts || 0) - (a.ts || 0));
}

// ---------------------------------------------------------------- build side
// cron at 5 AM: fresh collect + process for up to ~12 minutes
export async function buildMealDeals(env, { budgetMs = 12 * 60000, force = true } = {}) {
  return step(env, { budgetMs, parallel: 3, force, source: "cron" });
}

// one pass: (collect if needed) then process articles until the time budget is used.
// budgetMs = how long it may keep STARTING new articles; an article that has started always finishes and saves.
export async function step(env, { budgetMs = 50000, parallel = 3, force = false, source = "run" } = {}) {
  if (!env.DEALS || !env.AI) return;
  const t0 = Date.now();
  let state = await getJSON(env, "mealdeals:state");

  const needCollect = force || !state || (state.queue.length === 0 && Date.now() - Date.parse(state.collected) > 20 * 36e5);
  if (needCollect) {
    // only one collector at a time
    if (await env.DEALS.get("mealdeals:collecting")) return;
    await env.DEALS.put("mealdeals:collecting", "1", { expirationTtl: 60 });
    await status(env, { stage: "collecting feeds", source });
    state = await collect(env, state);
    await env.DEALS.delete("mealdeals:collecting");
  }

  let started = 0;
  const worker = async () => {
    while (true) {
      if (started > 0 && Date.now() - t0 > budgetMs) return;
      // claim the next article: take it off the (shared, in-memory) queue and save before working on it
      const item = state.queue.shift();
      if (!item) return;
      started++;
      await putJSON(env, "mealdeals:state", state);
      await status(env, { stage: `reading: ${item.title.slice(0, 80)}`, source, queue_left: state.queue.length });
      await processOne(env, item, state);
    }
  };
  await Promise.all(Array.from({ length: parallel }, worker));

  if (state.queue.length === 0) {
    // queue finished → rebuild the list from every stored result (fixes anything a parallel run overwrote)
    await rebuildOffers(env, state);
    await status(env, { stage: "done", source, finished: new Date().toISOString() });
  } else {
    await status(env, { stage: "paused (more articles queued)", source });
  }
}

async function collect(env, prev) {
  const now = Date.now();
  const res = await Promise.allSettled(SOURCES.map(([n, u]) => getFeed(n, u)));
  const doneKeys = new Set((prev ? prev.done : []).filter(d => now - d.at < 40 * DAY).map(d => d.key));
  const seen = new Set();
  const fresh = res.flatMap(r => (r.status === "fulfilled" ? r.value : []))
    .filter(i => i.ts && now - i.ts < MAX_ARTICLE_AGE_DAYS * DAY && !/news\.google\.com/.test(i.link))
    .filter(i => /deal|free|bogo|buy one|\$\d|% off|offer|discount|promo|coupon|for \$|half|national .* day|returns|value|happy hour/i.test(i.title))
    .filter(i => !/\b(stock|shares|earnings|lawsuit|recall|layoffs?|bankrupt|ceo|analyst|investors?|take-private|takeover|acquisition)\b/i.test(i.title))
    .filter(i => { const k = i.link.split("?")[0]; if (seen.has(k)) return false; seen.add(k); return true; })
    .sort((a, b) => b.ts - a.ts);
  const queue = [];
  for (const i of fresh) {
    const key = "x3:" + (await sha1(i.link.split("?")[0]));
    if (doneKeys.has(key)) continue;
    queue.push({ key, title: i.title, link: i.link, source: i.source, ts: i.ts, date: i.date, image: i.image });
    if (queue.length >= QUEUE_MAX) break;
  }
  const state = { collected: new Date().toISOString(), queue, done: (prev ? prev.done : []).filter(d => now - d.at < 40 * DAY) };
  await putJSON(env, "mealdeals:state", state);
  await status(env, { stage: "collected", feeds_ok: res.filter(r => r.status === "fulfilled" && r.value.length).length + "/" + SOURCES.length, queued: queue.length });
  return state;
}

async function processOne(env, item, state) {
  let result;
  try {
    result = await extract(env, item);
    if (result === null) result = { is_offer: false, failed: "could not read article" };
  } catch (e) {
    result = { is_offer: false, failed: "AI: " + String(e).slice(0, 160) };
  }
  await putJSON(env, item.key, { ...result, item }, { expirationTtl: 40 * 86400 });
  // record it as done, and merge its offers into the live list right away
  state.done = (state.done || []).filter(d => d.key !== item.key).concat({ key: item.key, at: Date.now(), offers: result.is_offer ? result.offers.length : 0, failed: result.failed || null });
  await putJSON(env, "mealdeals:state", state);
  if (result.is_offer) {
    const stored = (await getJSON(env, "mealdeals")) || { offers: [] };
    const offers = [...stored.offers]; addOffers(offers, result, item);
    await putJSON(env, "mealdeals", { built: new Date().toISOString(), offers: live(dedupeOffers(offers)).slice(0, 60) });
  }
  const st = (await getJSON(env, "mealdeals:status")) || {};
  await status(env, { articles_with_offers: (st.articles_with_offers || 0) + (result.is_offer ? 1 : 0), errors: (st.errors || 0) + (result.failed ? 1 : 0), last_error: result.failed || st.last_error || null });
}

async function rebuildOffers(env, state) {
  const offers = [];
  const keys = (state.done || []).filter(d => d.offers > 0).map(d => d.key);
  for (let i = 0; i < keys.length; i += 20) {
    const rows = await Promise.all(keys.slice(i, i + 20).map(k => getJSON(env, k)));
    for (const r of rows) if (r && r.is_offer) addOffers(offers, r, r.item);
  }
  await putJSON(env, "mealdeals", { built: new Date().toISOString(), offers: live(dedupeOffers(offers)).slice(0, 60) });
}

async function status(env, patch) {
  const st = (await getJSON(env, "mealdeals:status")) || {};
  await putJSON(env, "mealdeals:status", { ...st, ...patch, updated: new Date().toISOString() });
}

function addOffers(list, result, item) {
  if (!result || !result.is_offer || !item) return;
  for (const o of [].concat(result.offers || [])) list.push({ ...o, link: item.link, source: item.source, ts: item.ts, image: o.image || result.image || item.image || null });
}
// same brand + same headline offer → keep the newest article
function dedupeOffers(offers) {
  const byKey = new Map();
  for (const o of offers.sort((a, b) => (b.ts || 0) - (a.ts || 0))) {
    const k = (o.brand + "|" + o.big).toLowerCase().replace(/[^a-z0-9|$%]/g, "");
    if (!byKey.has(k)) byKey.set(k, o);
  }
  return [...byKey.values()];
}

// ---------------------------------------------------------------- AI extraction
const SCHEMA = {
  type: "object",
  properties: {
    is_offer: { type: "boolean" },
    offers: {
      type: "array",
      items: {
        type: "object",
        properties: {
          brand: { type: "string" },
          big: { type: "string" },
          offer: { type: "string" },
          conditions: { type: ["string", "null"] },
          start_date: { type: ["string", "null"] },
          end_date: { type: ["string", "null"] },
        },
        required: ["brand", "big", "offer"],
      },
    },
  },
  required: ["is_offer", "offers"],
};

async function extract(env, item) {
  const page = await getArticle(item.link);
  if (!page || page.text.length < 200) return null;
  const today = todayStr();
  const published = item.date ? item.date.slice(0, 10) : "unknown";

  const messages = [
    { role: "system", content:
`You extract restaurant and fast-food promotions from news articles for a deals board.
Rules:
- Use ONLY facts stated in the article. Never guess or invent prices, dates, or conditions.
- is_offer = true only if the article describes at least one specific, redeemable promotion at a restaurant/food chain (a discount, BOGO, freebie, price deal, or limited-time value bundle with a price). New menu items without a deal, earnings, lawsuits, openings and reviews are NOT offers.
- List EVERY distinct offer in the article (roundups often cover 10+ chains; up to 15):
  brand: the chain name exactly as written (e.g. "Wendy's").
  big: a very short label of the deal, max 10 characters, e.g. "BOGO", "FREE", "$6", "$1", "50% OFF", "2 FOR $6". Any number in it must appear in the article.
  offer: one short sentence saying exactly what you get, e.g. "Buy one Whopper, get one free".
  conditions: requirements like "App only", "Rewards members", "Wear a costume", "After 3 PM", "Participating locations" joined with " · ", or null.
  start_date / end_date: YYYY-MM-DD if the article states them (resolve weekdays/relative dates using the article's publish date), else null.
- Article published: ${published}. Today: ${today}.
Respond with JSON only.` },
    { role: "user", content: `TITLE: ${item.title}\n\nARTICLE:\n${page.text.slice(0, 9000)}` },
  ];

  let out, lastErr;
  const attempts = [[MODEL, true], [MODEL, false], [FALLBACK_MODEL, false]];   // with JSON schema, then plain JSON, then smaller model
  for (const [model, schema] of attempts) {
    try {
      const opts = { messages, max_tokens: 1400, temperature: 0 };
      if (schema) opts.response_format = { type: "json_schema", json_schema: SCHEMA };
      const r = await Promise.race([env.AI.run(model, opts), new Promise((_, rej) => setTimeout(() => rej(new Error("AI timed out")), AI_TIMEOUT_MS))]);
      const raw = r && (r.response ?? r.result?.response ?? r);
      out = typeof raw === "string" ? JSON.parse(raw.slice(raw.indexOf("{"), raw.lastIndexOf("}") + 1)) : raw;
      if (out && typeof out === "object" && "is_offer" in out) break;
      out = null;
    } catch (e) { lastErr = e; }
  }
  if (!out) throw lastErr || new Error("AI returned no usable JSON");
  if (!out.is_offer || !Array.isArray(out.offers)) return { is_offer: false };

  // verify against the article text so nothing is made up
  const hay = (item.title + " " + page.text).toLowerCase();
  const offers = out.offers.filter(o => {
    if (!o || !o.brand || !o.big || !o.offer) return false;
    const brandWord = o.brand.toLowerCase().replace(/[’']/g, "'").split(/\s+/)[0].replace(/[^a-z0-9']/g, "");
    if (brandWord.length < 2 || !hay.replace(/[’]/g, "'").includes(brandWord)) return false;
    const nums = (o.big + " " + o.offer).match(/\d+(?:\.\d+)?/g) || [];
    if (!nums.every(n => hay.includes(n))) return false;
    o.big = o.big.toUpperCase().slice(0, 12);
    o.start_date = validDate(o.start_date);
    o.end_date = validDate(o.end_date);
    if (o.end_date && o.end_date < today) return false;
    if (!o.end_date && item.ts && Date.now() - item.ts > 14 * DAY) return false; // undated + old article → assume over
    o.image = imageFor(page, o.brand) || null;   // the photo next to this chain in the article
    return true;
  }).slice(0, 15);
  return { is_offer: offers.length > 0, offers, image: page.image };
}

// nearest inline photo to where the article talks about this chain (prefers the image just before/after)
function imageFor(page, brand) {
  if (!page.imgs || !page.imgs.length) return null;
  const word = brand.toLowerCase().replace(/[’]/g, "'").split(/\s+/)[0];
  const at = page.lower.replace(/[’]/g, "'").indexOf(word);
  if (at < 0 || page.imgs.length < 2) return null;            // single-photo article → use its main image
  let best = null, dist = Infinity;
  for (const im of page.imgs) {
    const d = im.pos <= at ? at - im.pos : (im.pos - at) * 1.5; // slight preference for the photo above the text
    if (d < dist) { dist = d; best = im; }
  }
  return dist < 6000 ? best.src : null;
}

function validDate(s) { return typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s) && !isNaN(Date.parse(s)) ? s : null; }

async function getArticle(url) {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), 8000);
  try {
    const r = await fetch(url, { signal: ctl.signal, redirect: "follow", headers: { "user-agent": UA, accept: "text/html" }, cf: { cacheTtl: 21600, cacheEverything: true } });
    if (!r.ok || !/html/.test(r.headers.get("content-type") || "")) return null;
    let html = (await r.text()).slice(0, 600000);
    const og = html.match(/<meta[^>]+(?:property|name)=["'](?:og:image|twitter:image)["'][^>]*content=["']([^"']+)["']/i)
      || html.match(/<meta[^>]+content=["']([^"']+)["'][^>]*(?:property|name)=["'](?:og:image|twitter:image)["']/i);
    const art = html.match(/<article[\s\S]*?<\/article>/i) || html.match(/<main[\s\S]*?<\/main>/i);
    if (art) html = art[0];
    // inline photos with their position, so each chain in a roundup gets its own picture
    const base = r.url || url;
    const imgs = [];
    for (const m of html.matchAll(/<img\b[^>]*>/gi)) {
      const tagStr = m[0];
      if (/\b(width|height)=["']?(\d{1,2})["'\s>]/i.test(tagStr) || /(logo|avatar|icon|emoji|pixel|spinner|badge|author)/i.test(tagStr)) continue;
      const src = (tagStr.match(/\b(?:data-src|data-lazy-src|src)=["']([^"']+)["']/i) || [])[1]
        || ((tagStr.match(/\bsrcset=["']([^"']+)["']/i) || [])[1] || "").split(",").pop().trim().split(" ")[0];
      if (!src || src.startsWith("data:")) continue;
      try { imgs.push({ pos: m.index, src: new URL(decode(src), base).toString().replace(/^http:/, "https:") }); } catch {}
    }
    const lower = html.toLowerCase();
    const text = decode(html
      .replace(/<(script|style|noscript|svg|nav|footer|header|aside|form|figure)[\s\S]*?<\/\1>/gi, " ")
      .replace(/<\/(p|h\d|li|div|br)>/gi, "\n").replace(/<[^>]+>/g, " "))
      .replace(/[ \t]+/g, " ").replace(/\n\s*\n+/g, "\n").trim();
    let image = null;
    try { if (og) image = new URL(decode(og[1]), r.url || url).toString().replace(/^http:/, "https:"); } catch {}
    return { text, image, imgs, lower };
  } catch { return null; } finally { clearTimeout(t); }
}

async function sha1(s) {
  const b = await crypto.subtle.digest("SHA-1", new TextEncoder().encode(s));
  return [...new Uint8Array(b)].map(x => x.toString(16).padStart(2, "0")).join("");
}
