// Shared RSS/Atom helpers used by news.js and mealdeals.js (kept separate so the two never import each other).

export const FEED_CACHE_SECONDS = 900;
export const gnews = (q) => `https://news.google.com/rss/search?q=${encodeURIComponent(q)}&hl=en-US&gl=US&ceid=US:en`;
export const bing = (q) => `https://www.bing.com/news/search?q=${encodeURIComponent(q)}&format=rss&qft=sortbydate%3d%221%22`;
export const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36";

export async function getFeed(name, url) {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), 8000);
  try {
    const r = await fetch(url, {
      signal: ctl.signal,
      headers: { "user-agent": UA, accept: "application/rss+xml, application/atom+xml, application/xml, text/xml, */*" },
      cf: { cacheTtl: FEED_CACHE_SECONDS, cacheEverything: true },
    });
    if (!r.ok) return [];
    return parseFeed(await r.text(), name);
  } catch { return []; } finally { clearTimeout(t); }
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
export function stripSuffix(title, pub) {
  const i = title.lastIndexOf(" - ");
  return i > 20 && title.slice(i + 3).trim().toLowerCase() === pub.toLowerCase() ? title.slice(0, i) : title;
}
export function tag(s, name) {
  const m = s.match(new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${name}>`, "i"));
  return m ? m[1].replace(/^\s*<!\[CDATA\[([\s\S]*?)\]\]>\s*$/, "$1") : "";
}
export function attr(s, re, name) {
  const m = s.match(re); if (!m) return "";
  const a = m[0].match(new RegExp(`${name}=["']([^"']+)["']`, "i")); return a ? a[1] : "";
}
export function findImage(block, html) {
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
export function upgrade(u) {
  return u.replace(/(ichef\.bbci\.co\.uk\/[^/]+\/[^/]+\/)\d+(\/)/, "$1976$2").replace(/([?&])w=\d+/, "$1w=900").replace(/^http:\/\//, "https://");
}
export function clean(s) {
  return decode(String(s || "").replace(/<!\[CDATA\[|\]\]>/g, "")).replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").replace(/The post .* appeared first on .*$/i, "").trim();
}
export function decode(s) {
  return String(s || "").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#0?39;|&apos;/g, "'").replace(/&nbsp;/g, " ")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(+n)).replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16))).replace(/&amp;/g, "&");
}
export function truncate(s, n) { return s.length > n ? s.slice(0, s.lastIndexOf(" ", n)) + "…" : s; }
export function dedupe(items) {
  const seen = new Set();
  return items.filter(i => { const k = i.title.toLowerCase().replace(/[^a-z0-9]+/g, " ").split(" ").slice(0, 8).join(" "); if (seen.has(k)) return false; seen.add(k); return true; });
}
