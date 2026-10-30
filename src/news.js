// News feed handler → GET /api/news (called from src/worker.js)
// Pulls public RSS/Atom feeds, merges them per section, and returns JSON.
// Cached at Cloudflare's edge for 15 minutes, so the site updates itself all day with no maintenance.
//
// To change sources: edit FEEDS below, commit, push.

const FEEDS = {
  top: [
    ["BBC News", "https://feeds.bbci.co.uk/news/rss.xml"],
    ["NPR", "https://feeds.npr.org/1001/rss.xml"],
    ["The Guardian", "https://www.theguardian.com/us-news/rss"],
  ],
  world: [
    ["BBC World", "https://feeds.bbci.co.uk/news/world/rss.xml"],
    ["The Guardian", "https://www.theguardian.com/world/rss"],
    ["Al Jazeera", "https://www.aljazeera.com/xml/rss/all.xml"],
  ],
  politics: [
    ["NPR Politics", "https://feeds.npr.org/1014/rss.xml"],
    ["The Guardian", "https://www.theguardian.com/us-news/us-politics/rss"],
  ],
  sports: [
    ["ESPN", "https://www.espn.com/espn/rss/news"],
    ["BBC Sport", "https://feeds.bbci.co.uk/sport/rss.xml"],
    ["CBS Sports", "https://www.cbssports.com/rss/headlines/"],
  ],
  tech: [
    ["The Verge", "https://www.theverge.com/rss/index.xml"],
    ["Ars Technica", "https://feeds.arstechnica.com/arstechnica/index"],
    ["TechCrunch", "https://techcrunch.com/feed/"],
  ],
  drops: [ // new & limited-edition food, drinks, snacks
    ["The Impulsive Buy", "https://www.theimpulsivebuy.com/wordpress/feed/"],
    ["Sporked", "https://sporked.com/feed/"],
    ["Chew Boom", "https://chewboom.substack.com/feed"],
  ],
  deals: [ // BOGOs, sales, price drops
    ["Slickdeals", "https://slickdeals.net/newsearch.php?mode=frontpage&searcharea=deals&searchin=first&rss=1"],
    ["DealNews", "https://www.dealnews.com/?rss=1"],
  ],
  aviation: [
    ["AVweb", "https://avweb.com/feed/"],
    ["Simple Flying", "https://simpleflying.com/feed/"],
    ["The Aviationist", "https://theaviationist.com/feed/"],
  ],
};

const LIMIT = { top: 10, world: 8, politics: 6, sports: 8, tech: 8, drops: 8, deals: 12, aviation: 6 };
const CACHE_SECONDS = 900;
const UA = "Mozilla/5.0 (compatible; mournyl-news/1.0; +https://mournyl.com)";

export async function handleNews(request, ctx) {
  const cache = caches.default;
  const key = new Request(new URL("/api/news?v=1", request.url).toString());
  const hit = await cache.match(key);
  if (hit) return hit;

  const sections = {};
  const sources = new Set();
  await Promise.all(Object.entries(FEEDS).map(async ([sec, list]) => {
    const results = await Promise.allSettled(list.map(([name, url]) => getFeed(name, url)));
    let items = results.flatMap(r => (r.status === "fulfilled" ? r.value : []));
    items.forEach(i => sources.add(i.source));
    items = dedupe(items).sort((a, b) => (b.ts || 0) - (a.ts || 0));
    // put stories with photos first within the newest ones, so cards look good
    sections[sec] = interleave(items).slice(0, LIMIT[sec] || 8);
  }));

  const body = JSON.stringify({ updated: new Date().toISOString(), sources: [...sources].sort(), sections });
  const res = new Response(body, {
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": `public, max-age=${CACHE_SECONDS}`,
    },
  });
  ctx.waitUntil(cache.put(key, res.clone()));
  return res;
}

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
  } catch {
    return [];
  } finally {
    clearTimeout(t);
  }
}

// ---------------------------------------------------------------- parsing (no DOM in Workers → careful regex)
export function parseFeed(xml, source) {
  const blocks = [...xml.matchAll(/<item[\s>][\s\S]*?<\/item>/gi)].map(m => m[0]);
  const atom = blocks.length === 0;
  const list = atom ? [...xml.matchAll(/<entry[\s>][\s\S]*?<\/entry>/gi)].map(m => m[0]) : blocks;
  const out = [];
  for (const b of list) {
    const title = clean(tag(b, "title"));
    let link = atom
      ? (attr(b, /<link[^>]*rel=["']alternate["'][^>]*>/i, "href") || attr(b, /<link[^>]*>/i, "href"))
      : (clean(tag(b, "link")) || clean(tag(b, "guid")));
    if (!title || !link) continue;
    const date = tag(b, "pubDate") || tag(b, "published") || tag(b, "updated") || tag(b, "dc:date");
    const ts = Date.parse(clean(date)) || 0;
    const html = tag(b, "content:encoded") || tag(b, "content") || tag(b, "description") || tag(b, "summary") || "";
    out.push({
      title,
      link: decode(link.trim()),
      source,
      ts,
      date: ts ? new Date(ts).toISOString() : null,
      image: findImage(b, html),
      summary: truncate(clean(html), 220),
    });
  }
  return out;
}

function tag(s, name) {
  const re = new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${name}>`, "i");
  const m = s.match(re);
  if (!m) return "";
  return m[1].replace(/^\s*<!\[CDATA\[([\s\S]*?)\]\]>\s*$/, "$1");
}
function attr(s, re, name) {
  const m = s.match(re);
  if (!m) return "";
  const a = m[0].match(new RegExp(`${name}=["']([^"']+)["']`, "i"));
  return a ? a[1] : "";
}

function findImage(block, html) {
  const cands = [];
  // media:content / media:thumbnail (may be several sizes → take widest)
  for (const m of block.matchAll(/<media:(?:content|thumbnail)\b[^>]*>/gi)) {
    const url = (m[0].match(/url=["']([^"']+)["']/i) || [])[1];
    const w = +((m[0].match(/width=["'](\d+)/i) || [])[1] || 0);
    const type = (m[0].match(/(?:type|medium)=["']([^"']+)/i) || [])[1] || "image";
    if (url && /image/i.test(type)) cands.push([w || 1, url]);
  }
  for (const m of block.matchAll(/<enclosure\b[^>]*>/gi)) {
    const url = (m[0].match(/url=["']([^"']+)["']/i) || [])[1];
    if (url && /image|\.(jpe?g|png|webp)/i.test(m[0])) cands.push([1, url]);
  }
  if (cands.length) {
    cands.sort((a, b) => b[0] - a[0]);
    return upgrade(decode(cands[0][1]));
  }
  const raw = decode(html);
  const img = raw.match(/<img[^>]+src=["']([^"']+)["']/i);
  if (img && !/feedburner|pixel|tracking|1x1|gravatar|emoji/i.test(img[1])) return upgrade(img[1]);
  return null;
}

// ask CDNs for bigger versions of tiny thumbnails
function upgrade(u) {
  return u
    .replace(/(ichef\.bbci\.co\.uk\/[^/]+\/[^/]+\/)\d+(\/)/, "$1976$2")
    .replace(/([?&])w=\d+/, "$1w=900")
    .replace(/^http:\/\//, "https://");
}

function clean(s) {
  return decode(String(s || "").replace(/<!\[CDATA\[|\]\]>/g, ""))
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .replace(/The post .* appeared first on .*$/i, "")
    .trim();
}
function decode(s) {
  return String(s || "")
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#0?39;|&apos;/g, "'")
    .replace(/&nbsp;/g, " ").replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(+n))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&amp;/g, "&");
}
function truncate(s, n) { return s.length > n ? s.slice(0, s.lastIndexOf(" ", n)) + "…" : s; }

function dedupe(items) {
  const seen = new Set();
  return items.filter(i => {
    const k = i.title.toLowerCase().replace(/[^a-z0-9]+/g, " ").split(" ").slice(0, 8).join(" ");
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}
// keep it newest-first, but within the first dozen prefer items that have a photo
function interleave(items) {
  const head = items.slice(0, 16), tail = items.slice(16);
  head.sort((a, b) => (!!b.image - !!a.image) || ((b.ts || 0) - (a.ts || 0)));
  return head.concat(tail);
}
