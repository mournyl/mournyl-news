(() => {
  const $ = (s) => document.querySelector(s);
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const safeUrl = (u) => (/^https?:\/\//i.test(u || "") ? esc(u) : "#");

  // ---------- dates ----------
  const now = new Date();
  const dayOfYear = Math.floor((now - new Date(now.getFullYear(), 0, 0)) / 864e5);
  $("#today").textContent = now.toLocaleDateString("en-US", { weekday: "short", day: "numeric", month: "short", year: "numeric" }).replace(/,/g, "").toUpperCase();
  $("#year").textContent = now.getFullYear();
  $("#mast-left").innerHTML = `EST. 2026<br>ISSUE NO. ${dayOfYear}`;
  $("#mast-right").innerHTML = now.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" }) + "<br><span id='mast-upd'>Daily edition</span>";

  const ago = (iso) => {
    if (!iso) return "";
    const m = Math.round((Date.now() - new Date(iso)) / 6e4);
    if (m < 1) return "just now";
    if (m < 60) return `${m}m ago`;
    const h = Math.round(m / 60);
    return h < 24 ? `${h}h ago` : `${Math.round(h / 24)}d ago`;
  };
  const meta = (i) => `${esc(i.source)}${i.date ? " · " + ago(i.date) : ""}`;

  // real article photos, rendered black & white by CSS; hidden if they fail to load
  const pic = (i, h) => i && i.image
    ? `<div class="pic"${h ? ` style="height:${h}px"` : ""}><img src="${safeUrl(i.image)}" alt="" loading="lazy" referrerpolicy="no-referrer" onerror="this.parentNode.remove()"></div>`
    : "";
  const withImg = (arr) => (arr || []).filter(i => i.image);

  // pull a big "offer" token out of a deal headline
  const offer = (t) => {
    if (/\bBOGO\b|buy one,? get one|\bB1G1\b/i.test(t)) return "BOGO";
    let m = t.match(/(\d{1,2})\s?% off/i); if (m) return `−${m[1]}%`;
    m = t.match(/\$\d[\d,]*(?:\.\d\d)?/); if (m) return m[0].replace(/\.00$/, "");
    if (/\bfree\b/i.test(t)) return "FREE";
    return "DEAL";
  };

  // ---------- render ----------
  function render(data) {
    const S = data.sections || {};
    const top = S.top || [];
    const used = new Set();
    const take = (arr, n, needImg) => {
      const out = [];
      for (const i of arr || []) {
        if (out.length >= n) break;
        if (used.has(i.link) || (needImg && !i.image)) continue;
        used.add(i.link); out.push(i);
      }
      return out;
    };

    const lead = take(top, 1, true)[0] || take(top, 1)[0];
    const newest = [...top].sort((a, b) => (b.date || "").localeCompare(a.date || "")).find(i => !used.has(i.link));
    if (newest) used.add(newest.link);
    const more = take(top, 5);
    const [drop] = take(S.drops, 1, true);
    const dropsMore = take(S.drops, 4);
    const deals = take(S.deals, 8);
    const col = (arr) => { const [a] = take(arr, 1, true); return [a, ...take(arr, 4)].filter(Boolean); };
    const tech = col(S.tech), pol = col(S.politics), sports = col(S.sports);
    const world = take(S.world, 4, true);
    const avi = take(S.aviation, 4, true);

    const column = (title, arr) => !arr.length ? "" : `
      <div class="colx">
        <div class="sech sm-h"><h5>${title}</h5></div>
        <a href="${safeUrl(arr[0].link)}" target="_blank" rel="noopener">${pic(arr[0], 190)}<h3>${esc(arr[0].title)}</h3></a>
        <div class="when">${meta(arr[0])}</div>
        <ul class="tl">${arr.slice(1).map(i => `<li><a href="${safeUrl(i.link)}" target="_blank" rel="noopener"><span>${esc(i.title)}</span><em>${meta(i)}</em></a></li>`).join("")}</ul>
      </div>`;

    const cards = (arr) => arr.map(i => `
      <a class="card" href="${safeUrl(i.link)}" target="_blank" rel="noopener">${pic(i)}
        <span class="k">${esc(i.source)}</span><h4>${esc(i.title)}</h4><div class="when">${i.date ? ago(i.date) : ""}</div></a>`).join("");

    $("#app").innerHTML = `
      ${newest ? `<a class="brk" href="${safeUrl(newest.link)}" target="_blank" rel="noopener"><span class="dot"></span><span class="t">Latest</span><span class="bt">${esc(newest.title)}</span><span class="bm mono">${meta(newest)}</span></a>` : ""}

      ${lead ? `<section class="lead">
        <div>
          <span class="pill inv">Top story</span>
          <a href="${safeUrl(lead.link)}" target="_blank" rel="noopener"><h2 class="hero">${esc(lead.title)}</h2></a>
          <p class="deck">${esc(lead.summary)}</p>
          <div class="when" style="margin-top:12px">${meta(lead)}</div>
          <ul class="facts">${more.map(i => `<li><a href="${safeUrl(i.link)}" target="_blank" rel="noopener"><b>${ago(i.date) || "•"}</b><span>${esc(i.title)}</span></a></li>`).join("")}</ul>
        </div>
        <figure>${pic(lead, 470)}<figcaption class="cap">Photo via ${esc(lead.source)}</figcaption></figure>
        <div class="drop">
          ${drop ? `<a href="${safeUrl(drop.link)}" target="_blank" rel="noopener">${pic(drop, 250)}<span class="pill" style="margin-top:14px">New &amp; limited</span><h3>${esc(drop.title)}</h3></a><div class="when">${meta(drop)}</div>` : ""}
          <ul class="tl">${dropsMore.map(i => `<li><a href="${safeUrl(i.link)}" target="_blank" rel="noopener"><span>${esc(i.title)}</span><em>${meta(i)}</em></a></li>`).join("")}</ul>
        </div>
      </section>` : ""}

      ${deals.length ? `<div class="sech"><h5>Deals &amp; Drops</h5><span>Live from the deal boards</span></div>
      <section class="deals">${deals.map(d => `
        <a class="deal${d.image ? "" : " noimg"}" href="${safeUrl(d.link)}" target="_blank" rel="noopener">${pic(d)}
          <div class="db"><div class="top"><span class="k">${esc(d.source)}</span><span class="when">${ago(d.date)}</span></div>
          <div class="big">${esc(offer(d.title))}</div><h4>${esc(d.title)}</h4></div></a>`).join("")}
      </section>` : ""}

      <div class="sech"><h5>The rest of it</h5><span>Tech · Politics · Sports</span></div>
      <section class="three">${column("Tech", tech)}${column("Politics", pol)}${column("Sports", sports)}</section>

      ${world.length ? `<div class="sech"><h5>World</h5><span>Around the globe</span></div><section class="grid4">${cards(world)}</section>` : ""}
      ${avi.length ? `<div class="sech"><h5>Aviation</h5><span>Flight deck</span></div><section class="grid4">${cards(avi)}</section>` : ""}
    `;

    const upd = new Date(data.updated);
    const t = upd.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
    $("#updated").textContent = `Updated ${t}`;
    const mu = document.getElementById("mast-upd"); if (mu) mu.textContent = `Updated ${t}`;
    $("#sources").textContent = data.sources && data.sources.length ? "Headlines via " + data.sources.join(", ") : "";
  }

  async function load() {
    try {
      const r = await fetch("/api/news", { cache: "no-store" });
      if (!r.ok) throw new Error(r.status);
      render(await r.json());
    } catch (e) {
      $("#app").innerHTML = `<div class="loading mono">Couldn't load the news feed. If you opened this file directly, run <b>npx wrangler pages dev .</b> to preview with the feed, or check the live site.</div>`;
    }
  }
  load();
  setInterval(load, 15 * 60_000);

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
  tick();
  setInterval(tick, 60_000);
})();
