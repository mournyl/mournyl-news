// News handler → GET /api/news (called from src/worker.js)
// Builds the page data from public RSS feeds. Cached at Cloudflare's edge for 15 minutes.
//
//  big      the 3 biggest stories of the day = the stories the most outlets are covering right now
//  meals    fast-food / restaurant deals from the last 30 days
//  redbull  Red Bull edition / flavor news from the last 30 days
//  deals    general deals from the last few days
//
// To change sources: edit the lists below, commit, push.

const gnews = (q) => `https://news.google.com/rss/search?q=${encodeURIComponent(q)}&hl=en-US&gl=US&ceid=US:en`;
const bing = (q) => `https://www.bing.com/news/search?q=${encodeURIComponent(q)}&format=rss&qft=sortbydate%3d%221%22`;

// Outlets used to find the day's biggest stories (more outlets covering it = bigger)
const TOP_FEEDS = [
  ["New York Times", "https://rss.nytimes.com/services/xml/rss/nyt/HomePage.xml"],
  ["BBC News", "https://feeds.bbci.co.uk/news/rss.xml"],
  ["NPR", "https://feeds.npr.org/1001/rss.xml"],
  ["CBS News", "https://www.cbsnews.com/latest/rss/main"],
  ["ABC News", "https://abcnews.go.com/abcnews/topstories"],
  ["NBC News", "https://feeds.nbcnews.com/nbcnews/public/news"],
  ["The Guardian", "https://www.theguardian.com/us-news/rss"],
  ["Fox News", "https://moxie.foxnews.com/google-publisher/latest.xml"],
  ["Washington Post", "https://feeds.washingtonpost.com/rss/national"],
];
const GOOGLE_TOP = "https://news.google.com/rss?hl=en-US&gl=US&ceid=US:en"; // editor-ranked, used as a tiebreaker

const FEEDS = {
  meals: [
    ["Fast Food Post", "https://www.fastfoodpost.com/feed/"],
    ["Chew Boom", "https://chewboom.substack.com/feed"],
    ["Bing News", bing("fast food deal")],
    ["Bing News", bing("restaurant BOGO free deal")],
    ["Google News", gnews("fast food deal OR BOGO OR \"free\" restaurant when:14d")],
  ],
  redbull: [
    ["Bing News", bing("\"Red Bull\" edition flavor")],
    ["Google News", gnews("\"Red Bull\" edition flavor when:30d")],
    ["Sporked", "https://sporked.com/tag/red-bull/feed/"],
    ["The Impulsive Buy", "https://www.theimpulsivebuy.com/wordpress/tag/red-bull/feed/"],
  ],
  deals: [
    ["Slickdeals", "https://slickdeals.net/newsearch.php?mode=frontpage&searcharea=deals&searchin=first&rss=1"],
    ["DealNews", "https://www.dealnews.com/?rss=1"],
  ],
};

const DAY = 864e5;
const MAX_AGE = { big: 1.5 * DAY, meals: 30 * DAY, redbull: 30 * DAY, deals: 4 * DAY };
const LIMIT = { meals: 8, redbull: 4, deals: 8 };
const FILTER = {
  meals: (i) => (/\$\d|\d+% off/i.test(i.title) || /\b(bogo|buy one|free|deals?|discount|offers?|promo|coupon|half[- ]off|value|combo|happy hour|returns?|is back|limited[- ]time|launch(es)?|debuts?)\b/i.test(i.title))
    && !/\b(stock|shares|earnings|lawsuit|recall|layoffs?|closing|closes|bankrupt|ceo|analyst|investors?)\b/i.test(i.title),
  redbull: (i) => /red ?bull/i.test(i.title + " " + i.summary)
    && /\b(edition|flavou?r|limited|new|launch|taste|review|winter|spring|summer|sugar ?free|zero|can)\b/i.test(i.title)
    && !/racing|f1|formula|verstappen|grand prix|motogp|salzburg|leipzig|red bulls\b|cliff div|ktm|athlete|stunt/i.test(i.title),
};

const CACHE_SECONDS = 900;
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36";

export async function handleNews(request, ctx) {
  const cache = caches.default;
  const key = new Request(new URL("/api/news?v=3", request.url).toString());
  const hit = await cache.match(key);
  if (hit) return hit;

  const now = Date.now();
  const fresh = (sec) => (i) => i.ts && now - i.ts <= MAX_AGE[sec] && i.ts - now < DAY;

  const [big, ...rest] = await Promise.all([
    biggestStories(fresh("big")),
    ...Object.entries(FEEDS).map(async ([sec, list]) => {
      const res = await Promise.allSettled(list.map(([n, u]) => getFeed(n, u)));
      let items = res.flatMap(r => (r.status === "fulfilled" ? r.value : [])).filter(fresh(sec));
      if (FILTER[sec]) items = items.filter(FILTER[sec]);
      items = dedupe(items).sort((a, b) => b.ts - a.ts).slice(0, LIMIT[sec] + 4);
      return [sec, items];
    }),
  ]);
  const sections = { big, ...Object.fromEntries(rest) };

  // fill in missing photos from each article's own page (og:image)
  const need = [...sections.big, ...sections.meals, ...sections.redbull].filter(i => !i.image && !/news\.google\.com/.test(i.link)).slice(0, 18);
  await Promise.allSettled(need.map(async i => { i.image = await ogImage(i.link); }));
  // prefer items with photos for the visual sections
  for (const sec of ["meals", "redbull"]) {
    sections[sec] = sections[sec].sort((a, b) => (!!b.image - !!a.image) || b.ts - a.ts).slice(0, LIMIT[sec]);
  }
  sections.deals = sections.deals.slice(0, LIMIT.deals);

  const body = JSON.stringify({ updated: new Date().toISOString(), sections });
  const res = new Response(body, { headers: { "content-type": "application/json; charset=utf-8", "cache-control": `public, max-age=${CACHE_SECONDS}` } });
  ctx.waitUntil(cache.put(key, res.clone()));
  return res;
}

// ---------------------------------------------------------------- the 3 biggest stories
async function biggestStories(isFresh) {
  const [feeds, gtop] = await Promise.all([
    Promise.allSettled(TOP_FEEDS.map(([n, u]) => getFeed(n, u))),
    getFeed("Google News", GOOGLE_TOP).catch(() => []),
  ]);
  const items = feeds.flatMap(r => (r.status === "fulfilled" ? r.value : [])).filter(isFresh)
    .filter(i => !/\b(live updates?|quiz|crossword|wordle|horoscope|opinion|podcast|newsletter|watch:|video:)\b/i.test(i.title));
  for (const i of items) i.tok = tokens(i.title);

  // greedy clustering on shared keywords
  const clusters = [];
  for (const i of items.sort((a, b) => b.ts - a.ts)) {
    let best = null, bestScore = 0;
    for (const c of clusters) {
      const s = overlap(i.tok, c.tok);
      if (s > bestScore) { best = c; bestScore = s; }
    }
    if (best && bestScore >= 2) { best.items.push(i); i.tok.forEach(t => best.tok.add(t)); }
    else clusters.push({ items: [i], tok: new Set(i.tok) });
  }

  // Google's editor ranking as a boost
  const gt = gtop.slice(0, 20).map((g, r) => ({ tok: tokens(g.title), r }));
  const PRIORITY = TOP_FEEDS.map(f => f[0]);
  const scored = clusters.map(c => {
    const outlets = new Set(c.items.map(i => i.source));
    let g = 0;
    for (const x of gt) if (overlap(x.tok, c.tok) >= 2) { g = Math.max(g, 20 - x.r); }
    const newest = Math.max(...c.items.map(i => i.ts));
    const score = outlets.size * 10 + g + (Date.now() - newest < 6 * 36e5 ? 5 : 0);
    // headline: a photo-bearing item from the most trusted outlet
    const lead = [...c.items].sort((a, b) => (!!b.image - !!a.image) || (PRIORITY.indexOf(a.source) - PRIORITY.indexOf(b.source)))[0];
    const related = [];
    const seen = new Set([lead.source]);
    for (const i of c.items) if (!seen.has(i.source)) { seen.add(i.source); related.push({ title: i.title, link: i.link, source: i.source }); }
    return { score, outlets: outlets.size, lead, related };
  }).sort((a, b) => b.score - a.score);

  return scored.slice(0, 3).map(s => ({
    title: s.lead.title, link: s.lead.link, source: s.lead.source, date: s.lead.date, ts: s.lead.ts,
    image: s.lead.image, summary: s.lead.summary, outlets: s.outlets, related: s.related.slice(0, 4),
  }));
}

const STOP = new Set("the a an and or but of to in on at for with from by as is are was were be been it its this that these those after before over under into about amid than then new says say said will would could can may might has have had not no yes who what when where why how more most up down out off his her their they them he she we you your our us u.s us. vs report reports update updates live video watch first last top day week year years two three one man woman people".split(" "));
function tokens(t) {
  return [...new Set(t.replace(/[’']s\b/g, "").replace(/[^A-Za-z0-9 ]+/g, " ").split(/\s+/)
    .filter(w => w.length > 2 && !STOP.has(w.toLowerCase()))
    .map(w => w.toLowerCase().replace(/(ies)$/, "y").replace(/(?<!s)s$/, "")))];
}
function overlap(a, b) { let n = 0; for (const t of a) if (b.has ? b.has(t) : b.includes(t)) n++; return n; }

// ---------------------------------------------------------------- fetching
async function getFeed(name, url) {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), 8000);
  try {
    const r = await fetch(url, {
      signal: ctl.signal,
      headers: { "user-agent": UA, accept: "application/rss+xml, application/atom+xml, application/xml, text/xml, */*" },
      cf: { cacheTtl: CACHE_SECONDS, cacheEverything: true },
    });
    if (!r.ok) return [];
    return parseFeed(await r.text(), name);
  } catch { return []; } finally { clearTimeout(t); }
}

async function ogImage(url) {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), 5000);
  try {
    const r = await fetch(url, { signal: ctl.signal, redirect: "follow", headers: { "user-agent": UA, accept: "text/html" }, cf: { cacheTtl: 21600, cacheEverything: true } });
    if (!r.ok || !/html/.test(r.headers.get("content-type") || "")) return null;
    const reader = r.body.getReader(); const dec = new TextDecoder(); let html = "", bytes = 0;
    while (bytes < 200000) { const { done, value } = await reader.read(); if (done) break; bytes += value.length; html += dec.decode(value, { stream: true }); if (/<\/head>/i.test(html)) break; }
    reader.cancel().catch(() => {});
    const m = html.match(/<meta[^>]+(?:property|name)=["'](?:og:image(?::secure_url)?|twitter:image(?::src)?)["'][^>]*content=["']([^"']+)["']/i)
      || html.match(/<meta[^>]+content=["']([^"']+)["'][^>]*(?:property|name)=["'](?:og:image|twitter:image)["']/i);
    return m ? new URL(decode(m[1]), r.url).toString().replace(/^http:/, "https:") : null;
  } catch { return null; } finally { clearTimeout(t); }
}

// ---------------------------------------------------------------- parsing
export function parseFeed(xml, source) {
  const blocks = [...xml.matchAll(/<item[\s>][\s\S]*?<\/item>/gi)].map(m => m[0]);
  const atom = blocks.length === 0;
  const list = atom ? [...xml.matchAll(/<entry[\s>][\s\S]*?<\/entry>/gi)].map(m => m[0]) : blocks;
  const out = [];
  for (const b of list) {
    let title = clean(tag(b, "title"));
    let link = atom ? (attr(b, /<link[^>]*rel=["']alternate["'][^>]*>/i, "href") || attr(b, /<link[^>]*>/i, "href")) : (clean(tag(b, "link")) || clean(tag(b, "guid")));
    if (!title || !link) continue;
    link = decode(link.trim());
    let src = source;
    // Google News: real publisher in <source>, strip " - Publisher" from title
    const pub = clean(tag(b, "source"));
    if (pub && /google news/i.test(source)) { src = pub; title = stripSuffix(title, pub); }
    // Bing News: real publisher + direct article link + thumbnail
    let image = null;
    if (/bing news/i.test(source)) {
      const bsrc = clean(tag(b, "News:Source")); if (bsrc) src = bsrc;
      const u = link.match(/[?&]url=([^&]+)/); if (u) link = decodeURIComponent(u[1]);
      const bi = clean(tag(b, "News:Image")); if (bi) image = bi.replace(/^http:/, "https:") + "&w=800&h=450&c=7";
    }
    const date = tag(b, "pubDate") || tag(b, "published") || tag(b, "updated") || tag(b, "dc:date");
    const ts = Date.parse(clean(date)) || 0;
    const html = tag(b, "content:encoded") || tag(b, "content") || tag(b, "description") || tag(b, "summary") || "";
    out.push({ title, link, source: src, ts, date: ts ? new Date(ts).toISOString() : null, image: image || findImage(b, html), summary: truncate(clean(html), 240) });
  }
  return out;
}
function stripSuffix(title, pub) {
  const i = title.lastIndexOf(" - ");
  return i > 20 && title.slice(i + 3).trim().toLowerCase() === pub.toLowerCase() ? title.slice(0, i) : title;
}
function tag(s, name) {
  const m = s.match(new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${name}>`, "i"));
  return m ? m[1].replace(/^\s*<!\[CDATA\[([\s\S]*?)\]\]>\s*$/, "$1") : "";
}
function attr(s, re, name) {
  const m = s.match(re); if (!m) return "";
  const a = m[0].match(new RegExp(`${name}=["']([^"']+)["']`, "i")); return a ? a[1] : "";
}
function findImage(block, html) {
  const c = [];
  for (const m of block.matchAll(/<media:(?:content|thumbnail)\b[^>]*>/gi)) {
    const url = (m[0].match(/url=["']([^"']+)["']/i) || [])[1];
    const w = +((m[0].match(/width=["'](\d+)/i) || [])[1] || 0);
    const type = (m[0].match(/(?:type|medium)=["']([^"']+)/i) || [])[1] || "image";
    if (url && /image/i.test(type)) c.push([w || 1, url]);
  }
  for (const m of block.matchAll(/<enclosure\b[^>]*>/gi)) {
    const url = (m[0].match(/url=["']([^"']+)["']/i) || [])[1];
    if (url && /image|\.(jpe?g|png|webp)/i.test(m[0])) c.push([1, url]);
  }
  if (c.length) { c.sort((a, b) => b[0] - a[0]); return upgrade(decode(c[0][1])); }
  const img = decode(html).match(/<img[^>]+src=["']([^"']+)["']/i);
  return img && !/feedburner|pixel|tracking|1x1|gravatar|emoji/i.test(img[1]) ? upgrade(img[1]) : null;
}
function upgrade(u) {
  return u.replace(/(ichef\.bbci\.co\.uk\/[^/]+\/[^/]+\/)\d+(\/)/, "$1976$2").replace(/([?&])w=\d+/, "$1w=900").replace(/^http:\/\//, "https://");
}
function clean(s) {
  return decode(String(s || "").replace(/<!\[CDATA\[|\]\]>/g, "")).replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").replace(/The post .* appeared first on .*$/i, "").trim();
}
function decode(s) {
  return String(s || "").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#0?39;|&apos;/g, "'").replace(/&nbsp;/g, " ")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(+n)).replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16))).replace(/&amp;/g, "&");
}
function truncate(s, n) { return s.length > n ? s.slice(0, s.lastIndexOf(" ", n)) + "…" : s; }
function dedupe(items) {
  const seen = new Set();
  return items.filter(i => { const k = i.title.toLowerCase().replace(/[^a-z0-9]+/g, " ").split(" ").slice(0, 8).join(" "); if (seen.has(k)) return false; seen.add(k); return true; });
}
