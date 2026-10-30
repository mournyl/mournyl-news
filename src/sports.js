// Sports handler → GET /api/sports
// Today's games (live scores) + a 7-day calendar, from ESPN's public scoreboard JSON (no key needed).
// Cached 60 s at the edge so live scores stay current.

// Teams Charleston-area fans follow: always shown, pinned first, and on the calendar
const LOCAL = /\b(south carolina gamecocks|clemson tigers|charleston cougars|the citadel|citadel bulldogs|charleston southern|carolina panthers|charlotte hornets|carolina hurricanes|coastal carolina|furman paladins|wofford terriers|south carolina state)\b/i;

const LEAGUES = [
  // [label, sport, league, which games go on the weekly calendar, extra query]
  ["NFL", "football", "nfl", "all"],
  ["CFB", "football", "college-football", "ranked", "&groups=80"],          // all FBS games, keep Top 25 + local
  ["FCS", "football", "college-football", "local", "&groups=81"],           // FCS: The Citadel, Charleston Southern, Furman…
  ["NBA", "basketball", "nba", "national"],
  ["NHL", "hockey", "nhl", "national"],
  ["MLB", "baseball", "mlb", "all"],
  ["CBB", "basketball", "mens-college-basketball", "ranked", "&groups=50"], // all D-I games, keep Top 25 + local
  ["EPL", "soccer", "eng.1", "all"],
  ["UCL", "soccer", "uefa.champions", "all"],
  ["MLS", "soccer", "usa.1", "all"],
];
const NATIONAL = /\b(ESPN|ABC|TNT|TBS|truTV|NBC|Peacock|CBS|FOX|FS1|Prime|Apple|NFL Net|NBA TV|NHL Net|MLB Net|Max|Netflix)\b/i;
const TZ = "America/New_York";
const ymd = (d) => new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(d);

export async function handleSports(request, ctx) {
  const cache = caches.default;
  const key = new Request(new URL("/api/sports?v=2", request.url).toString());
  const hit = await cache.match(key);
  if (hit) return hit;

  const now = new Date();
  const today = ymd(now);
  const end = ymd(new Date(now.getTime() + 6 * 864e5));
  const range = `${today.replace(/-/g, "")}-${end.replace(/-/g, "")}`;

  const all = (await Promise.allSettled(LEAGUES.map(async ([label, sport, league, cal, extra = ""]) => {
    const r = await fetch(`https://site.api.espn.com/apis/site/v2/sports/${sport}/${league}/scoreboard?dates=${range}&limit=900${extra}`, {
      headers: { "user-agent": "Mozilla/5.0 mournyl-news" }, cf: { cacheTtl: 60, cacheEverything: true },
    });
    if (!r.ok) return [];
    const j = await r.json();
    const events = j.events || (j.leagues && j.leagues[0] && j.leagues[0].events) || [];
    return events.map(e => normalize(e, label === "FCS" ? "CFB" : label, cal)).filter(Boolean)
      // big college slates: only Top-25 or local games
      .filter(g => (cal !== "ranked" && cal !== "local") || g.local || (cal === "ranked" && (g.away.rank || g.home.rank)));
  }))).flatMap(r => (r.status === "fulfilled" ? r.value : []));

  const seenIds = new Set();
  const uniq = all.filter(g => !seenIds.has(g.id) && seenIds.add(g.id));
  const games = uniq.filter(g => g.day === today).sort(order);
  const week = {};
  for (const g of uniq.filter(g => g.day !== today && g.onCalendar).sort((a, b) => a.start.localeCompare(b.start))) (week[g.day] ||= []).push(g);

  const body = JSON.stringify({ updated: now.toISOString(), today, games, week });
  const res = new Response(body, { headers: { "content-type": "application/json; charset=utf-8", "cache-control": "public, max-age=60" } });
  ctx.waitUntil(cache.put(key, res.clone()));
  return res;
}

// local teams first, then live, then upcoming by time, then finals
function order(a, b) {
  const rank = { in: 0, pre: 1, post: 2 };
  return (b.local - a.local) || (rank[a.state] - rank[b.state]) || a.start.localeCompare(b.start);
}

function normalize(e, league, cal) {
  const c = (e.competitions || [])[0];
  if (!c || !c.competitors || c.competitors.length < 2) return null;
  const st = (c.status || e.status || {}).type || {};
  const team = (x) => ({
    name: x.team?.shortDisplayName || x.team?.displayName || "TBD",
    full: x.team?.displayName || "",
    abbr: x.team?.abbreviation || "",
    logo: x.team?.logo || (x.team?.logos && x.team.logos[0]?.href) || null,
    color: x.team?.color ? "#" + x.team.color : null,
    score: x.score ?? null,
    rank: x.curatedRank && x.curatedRank.current <= 25 ? x.curatedRank.current : null,
    record: (x.records && x.records[0] && x.records[0].summary) || "",
    winner: !!x.winner,
  });
  const home = c.competitors.find(x => x.homeAway === "home") || c.competitors[0];
  const away = c.competitors.find(x => x.homeAway === "away") || c.competitors[1];
  const tv = [...new Set((c.broadcasts || []).flatMap(b => b.names || []))].concat((c.geoBroadcasts || []).filter(g => g.market?.type === "National").map(g => g.media?.shortName)).filter(Boolean);
  const tvList = [...new Set(tv)].slice(0, 3);
  const link = (e.links || []).find(l => (l.rel || []).includes("summary"))?.href || null;
  const a = team(away), h = team(home);
  const local = LOCAL.test(a.full) || LOCAL.test(h.full);
  return {
    id: e.id, league, local,
    start: e.date, day: ymd(new Date(e.date)),
    state: st.state || "pre", detail: st.shortDetail || "", completed: !!st.completed,
    tv: tvList, venue: c.venue?.fullName || "", note: (c.notes && c.notes[0]?.headline) || "",
    away: a, home: h, link,
    onCalendar: local || cal === "all" || cal === "ranked" || tvList.some(t => NATIONAL.test(t)),
  };
}
