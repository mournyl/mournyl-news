(() => {
  const $ = (s) => document.querySelector(s);
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const safeUrl = (u) => (/^https?:\/\//i.test(u || "") ? esc(u) : "#");
  const A = (u) => `href="${safeUrl(u)}" target="_blank" rel="noopener"`;

  // ---------- edition ----------
  // First issue of mournyl news. Issue No. 1 = this date, and it counts up by one each day (Eastern time).
  const LAUNCH_DATE = "2026-10-30";

  const now = new Date();
  const etDate = (d) => new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
  const issueNo = Math.max(1, Math.round((Date.parse(etDate(now)) - Date.parse(LAUNCH_DATE)) / 864e5) + 1);
  $("#today").textContent = now.toLocaleDateString("en-US", { weekday: "short", day: "numeric", month: "short", year: "numeric" }).replace(/,/g, "").toUpperCase();
  $("#year").textContent = now.getFullYear();
  $("#mast-left").innerHTML = `EST. ${LAUNCH_DATE.slice(0, 4)}<br>ISSUE NO. ${issueNo}`;
  $("#mast-right").innerHTML = now.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" }) + "<br><span id='mast-upd'>Daily edition</span>";

  const ago = (iso) => {
    if (!iso) return "";
    const m = Math.round((Date.now() - new Date(iso)) / 6e4);
    if (m < 1) return "just now";
    if (m < 60) return `${m}m ago`;
    const h = Math.round(m / 60);
    if (h < 24) return `${h}h ago`;
    const d = Math.round(h / 24);
    return d === 1 ? "yesterday" : `${d}d ago`;
  };
  const meta = (i) => `${esc(i.source)}${i.date ? " · " + ago(i.date) : ""}`;
  const pic = (i, h, cls = "") => i && i.image
    ? `<div class="pic ${cls}"${h ? ` style="height:${h}px"` : ""}><img src="${safeUrl(i.image)}" alt="" loading="lazy" referrerpolicy="no-referrer" onerror="this.parentNode.remove()"></div>`
    : "";
  const offer = (t) => {
    if (/\bBOGO\b|buy one,? get one|\bB1G1\b/i.test(t)) return "BOGO";
    let m = t.match(/(\d{1,2})\s?% off/i); if (m) return `−${m[1]}%`;
    m = t.match(/\$\d[\d,]*(?:\.\d\d)?/); if (m) return m[0].replace(/\.00$/, "");
    if (/\bfree\b/i.test(t)) return "FREE";
    if (/half[- ]off/i.test(t)) return "½ OFF";
    if (/\b(returns?|is back|brings back|back for)\b/i.test(t)) return "BACK";
    if (/\b(new|launch(es)?|debuts?)\b/i.test(t)) return "NEW";
    return "DEAL";
  };

  // ======================================================================= NEWS
  function renderNews(data) {
    const S = data.sections || {};
    const big = S.big || [];
    const rel = (b, n) => b.related && b.related.length
      ? `<ul class="rel">${b.related.slice(0, n).map(r => `<li><a ${A(r.link)}><b>${esc(r.source)}</b><span>${esc(r.title)}</span></a></li>`).join("")}</ul>` : "";
    const cov = (b) => `<span class="cov">${b.outlets > 1 ? `Covered by ${b.outlets} outlets` : esc(b.source)}</span>`;

    $("#big").innerHTML = big.length ? `
      <div class="sech"><h5>Today's biggest stories</h5><span>Ranked by how many newsrooms are on it</span></div>
      <section class="bigs">
        ${big[0] ? `<article class="b1">
          <a ${A(big[0].link)}>${pic(big[0], 460)}</a>
          <div class="kick"><span class="pill inv">01</span>${cov(big[0])}<span class="when">${ago(big[0].date)}</span></div>
          <a ${A(big[0].link)}><h2>${esc(big[0].title)}</h2></a>
          ${big[0].summary ? `<p class="deck">${esc(big[0].summary)}</p>` : ""}
          ${rel(big[0], 4)}
        </article>` : ""}
        <div class="b23">
          ${big.slice(1).map((b, k) => `<article class="b2">
            <a ${A(b.link)}>${pic(b, 200)}</a>
            <div class="kick"><span class="pill">0${k + 2}</span>${cov(b)}<span class="when">${ago(b.date)}</span></div>
            <a ${A(b.link)}><h3>${esc(b.title)}</h3></a>
            ${rel(b, 2)}
          </article>`).join("")}
        </div>
      </section>` : `<div class="loading mono">Couldn't find today's top stories right now.</div>`;

    // ---- meal deals (structured offers: brand, exact offer, conditions, dates)
    const meals = S.meals || [];
    const fmtDay = (s) => new Date(s + "T12:00:00").toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
    const todayISO = new Date().toLocaleDateString("en-CA");
    const runs = (d) => {
      if (d.start_date && d.start_date === d.end_date) return `${fmtDay(d.start_date)} only`;
      if (d.status === "soon") return `Starts ${fmtDay(d.start_date)}${d.end_date ? ` – ${fmtDay(d.end_date)}` : ""}`;
      if (d.end_date === todayISO) return "Ends today";
      if (d.end_date) return `Through ${fmtDay(d.end_date)}`;
      return "On now · end date not announced";
    };
    $("#meals").innerHTML = `
      <div class="sech"><h5>Meal Deals</h5><span>Updated daily 5 AM · on now or starting soon</span></div>
      ${meals.length ? `<section class="deals${meals.length > 8 ? " clip" : ""}" id="mealgrid">${meals.map(d => `
        <a class="deal meal${d.image ? "" : " noimg"}${d.status === "now" ? " hot" : ""}" ${A(d.link)}>${pic(d)}
          <div class="db">
            <div class="top"><span class="k">${esc(d.brand)}</span><span class="badge ${d.status}">${d.status === "now" ? "ON NOW" : "SOON"}</span></div>
            <div class="big">${esc(d.big)}</div>
            <h4>${esc(d.offer)}</h4>
            ${d.conditions ? `<div class="cond">${esc(d.conditions)}</div>` : ""}
            <div class="runs mono">${esc(runs(d))}</div>
            <div class="via mono">via ${esc(d.source)}</div>
          </div></a>`).join("")}</section>
        ${meals.length > 8 ? `<button class="showall mono" id="mealmore">Show all ${meals.length} deals ↓</button>` : ""}`
        : `<div class="empty mono">No meal deals on right now. Offers are checked daily at 5 AM.</div>`}`;
    const mm = document.getElementById("mealmore");
    if (mm) mm.onclick = () => { document.getElementById("mealgrid").classList.remove("clip"); mm.remove(); };

    // ---- Red Bull Edition Watch
    const rb = S.redbull || [];
    $("#redbull").innerHTML = `
      <div class="sech"><h5>Red Bull Edition Watch</h5><span>New &amp; limited flavors · last 30 days</span></div>
      ${rb.length ? `<section class="rbw">
        <a class="rb1" ${A(rb[0].link)}>${pic(rb[0], 300)}<div class="rbt"><span class="pill inv">Latest</span><h3>${esc(rb[0].title)}</h3><div class="when">${meta(rb[0])}</div></div></a>
        <div class="rbl">${rb.slice(1).map(i => `<a class="rbi" ${A(i.link)}>${pic(i, 90)}<div><h4>${esc(i.title)}</h4><div class="when">${meta(i)}</div></div></a>`).join("")}</div>
        <span class="lim">LIMITED</span>
      </section>` : `<div class="empty mono">No new Red Bull edition news in the last 30 days.</div>`}`;

    // ---- deals & steals
    const deals = S.deals || [];
    $("#deals").innerHTML = deals.length ? `
      <div class="sech"><h5>Deals &amp; Steals</h5><span>Live from the deal boards</span></div>
      <section class="deals">${deals.map(d => `
        <a class="deal${d.image ? "" : " noimg"}" ${A(d.link)}>${pic(d)}
          <div class="db"><div class="top"><span class="k">${esc(d.source)}</span><span class="when">${ago(d.date)}</span></div>
          <div class="big">${esc(offer(d.title))}</div><h4>${esc(d.title)}</h4></div></a>`).join("")}</section>` : "";

    const t = new Date(data.updated).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
    $("#updated").textContent = `Updated ${t}`;
    const mu = document.getElementById("mast-upd"); if (mu) mu.textContent = `Updated ${t}`;
  }

  // ======================================================================= SPORTS
  let sportsData = null, sportsTab = "All";
  const time = (iso) => new Date(iso).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
  const teamRow = (t, g) => `
    <div class="tr${g.state === "post" && t.winner ? " win" : ""}${g.state === "post" && !t.winner ? " lose" : ""}">
      ${t.logo ? `<img src="${safeUrl(t.logo)}" alt="" loading="lazy" onerror="this.style.visibility='hidden'">` : `<i class="nologo" style="background:${esc(t.color || "#333")}"></i>`}
      <span class="tn">${t.rank ? `<sup>${t.rank}</sup>` : ""}${esc(t.name)}</span>
      <span class="rec">${esc(t.record)}</span>
      <b class="sc">${g.state === "pre" ? "" : esc(t.score ?? "")}</b>
    </div>`;
  const status = (g) => g.state === "in" ? `<span class="live"><i></i>LIVE · ${esc(g.detail)}</span>`
    : g.state === "post" ? `<span class="fin">${esc(g.detail || "Final")}</span>` : `<span>${time(g.start)}</span>`;

  function renderSports() {
    const d = sportsData; if (!d) return;
    const leagues = ["All", ...new Set(d.games.map(g => g.league))];
    if (!leagues.includes(sportsTab)) sportsTab = "All";
    const games = d.games.filter(g => sportsTab === "All" || g.league === sportsTab);
    const live = d.games.filter(g => g.state === "in").length;

    const days = Object.keys(d.week).sort();
    $("#sports").innerHTML = `
      <div class="sech"><h5>Sports</h5><span>${d.games.length} games today${live ? ` · ${live} live` : ""}</span></div>
      <div class="tabs">${leagues.map(l => `<button data-tab="${esc(l)}" class="${l === sportsTab ? "on" : ""}">${esc(l)}${l !== "All" ? ` <em>${d.games.filter(g => g.league === l).length}</em>` : ""}</button>`).join("")}</div>
      ${games.length ? `<section class="games">${games.slice(0, 24).map(g => `
        <a class="game ${g.state}" ${A(g.link)} style="--a:${esc(g.away.color || "#444")};--h:${esc(g.home.color || "#444")}">
          <div class="gtop"><span class="lg">${esc(g.league)}</span>${status(g)}</div>
          ${teamRow(g.away, g)}${teamRow(g.home, g)}
          <div class="gbot">${esc(g.note || g.tv.join(" · ") || g.venue)}</div>
        </a>`).join("")}</section>` : `<div class="empty mono">No games today.</div>`}
      ${days.length ? `<div class="sech sub"><h5>This week</h5><span>Next 6 days · national TV &amp; big games</span></div>
      <section class="cal">${days.map(day => {
        const list = d.week[day];
        const label = new Date(day + "T12:00:00").toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
        return `<div class="cday"><div class="ch">${label}</div>${list.slice(0, 9).map(g => `
          <a class="ci" ${A(g.link)}><span class="ct">${time(g.start)}</span><span class="cl">${esc(g.league)}</span>
          ${g.away.logo ? `<img src="${safeUrl(g.away.logo)}" alt="">` : ""}<span>${esc(g.away.abbr)}</span><span class="at">@</span>
          ${g.home.logo ? `<img src="${safeUrl(g.home.logo)}" alt="">` : ""}<span>${esc(g.home.abbr)}</span></a>`).join("")}
          ${list.length > 9 ? `<div class="more mono">+${list.length - 9} more</div>` : ""}</div>`;
      }).join("")}</section>` : ""}`;
    document.querySelectorAll("#sports .tabs button").forEach(b => b.onclick = () => { sportsTab = b.dataset.tab; renderSports(); });
  }

  // ======================================================================= load
  async function loadNews() {
    try {
      const r = await fetch("/api/news", { cache: "no-store" });
      if (!r.ok) throw new Error(r.status);
      renderNews(await r.json());
    } catch (e) {
      $("#big").innerHTML = `<div class="loading mono">Couldn't load the news. If you're previewing locally, run <b>npx wrangler dev</b>.</div>`;
    }
  }
  async function loadSports() {
    try {
      const r = await fetch("/api/sports", { cache: "no-store" });
      if (!r.ok) throw new Error(r.status);
      sportsData = await r.json();
      renderSports();
      const live = sportsData.games.some(g => g.state === "in");
      setTimeout(loadSports, live ? 60_000 : 5 * 60_000);
    } catch (e) { setTimeout(loadSports, 5 * 60_000); }
  }
  loadNews(); setInterval(loadNews, 15 * 60_000);
  loadSports();

  // ---------- live crypto ticker (CoinGecko public API, no key) ----------
  const fmt = (n) => "$" + Math.round(n).toLocaleString("en-US");
  async function tick() {
    try {
      const r = await fetch("https://api.coingecko.com/api/v3/simple/price?ids=bitcoin,ethereum&vs_currencies=usd&include_24hr_change=true");
      if (!r.ok) return;
      const j = await r.json();
      for (const id of ["bitcoin", "ethereum"]) {
        if (!j[id]) continue;
        const ch = j[id].usd_24h_change ?? 0;
        document.querySelector(`[data-coin="${id}"]`).textContent = fmt(j[id].usd);
        document.querySelector(`[data-chg="${id}"]`).textContent = `${ch < 0 ? "▼" : "▲"}${Math.abs(ch).toFixed(1)}%`;
      }
    } catch (_) {}
  }
  tick(); setInterval(tick, 60_000);
})();
