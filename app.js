(() => {
  const C = window.MOURNYL;
  const $ = (s) => document.querySelector(s);
  const pic = (src, h, alt = "") =>
    `<div class="pic"${h ? ` style="height:${h}px"` : ""}><img src="${src}" alt="${alt}" loading="lazy"></div>`;

  // ---------- dates ----------
  const now = new Date();
  const longDate = now.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" });
  const shortDate = now.toLocaleDateString("en-US", { weekday: "short", day: "numeric", month: "short", year: "numeric" }).replace(/,/g, "");
  $("#today").textContent = shortDate.toUpperCase();
  $("#loc").textContent = C.edition.location;
  $("#year").textContent = now.getFullYear();
  $("#mast-left").innerHTML = `${C.edition.est}<br>${C.edition.location}`;
  $("#mast-right").innerHTML = `${longDate}<br>${[C.edition.note, C.edition.volume].filter(Boolean).join(" · ")}`;

  if (C.countdown) {
    const target = new Date(C.countdown.date + "T00:00:00");
    const days = Math.ceil((target - new Date(now.toDateString())) / 864e5);
    if (days >= 0) $("#countdown").innerHTML = `${C.countdown.label} <b>${days === 0 ? "TODAY" : days + (days === 1 ? " DAY" : " DAYS")}</b>`;
  }

  // ---------- page ----------
  const L = C.lead, D = C.drop, R = C.rest;
  $("#app").innerHTML = `
    ${C.breaking ? `<div class="brk"><span class="dot"></span><span class="t">${C.breaking.label}</span><span>${C.breaking.html}</span></div>` : ""}

    <section class="lead">
      <div>
        <span class="pill inv">${L.kicker}</span>
        <h2 class="hero">${L.title}</h2>
        <p class="deck">${L.deck}</p>
        <div class="score">${L.score.map(s => `<div class="${s.win ? "win" : ""}"><span class="k">${s.k}</span><b>${s.v}</b></div>`).join("")}</div>
        <ul class="facts">${L.facts.map(([a, b]) => `<li><b>${a}</b>${b}</li>`).join("")}</ul>
      </div>
      <figure>
        ${pic(L.image, 470, L.title)}
        <figcaption class="cap">${L.caption}</figcaption>
      </figure>
      <div class="drop">
        ${pic(D.image, 270, D.title)}
        <div>
          <span class="pill" style="margin-top:14px">${D.kicker}</span>
          <h3>${D.title}</h3>
          <p class="sm">${D.body}</p>
        </div>
      </div>
    </section>

    <div class="sech"><h5>Deals &amp; Drops</h5><span>This weekend</span></div>
    <section class="deals">
      ${C.deals.map(d => `
        <a class="deal${d.hot ? " hot" : ""}" href="#">
          ${pic(d.img, 0, d.brand)}
          <div class="db">
            <div class="top"><span class="k">${d.brand}</span>${d.hot ? '<span class="hot-t">HOT</span>' : ""}</div>
            <div class="big">${d.big}</div>
            <h4>${d.text}</h4>
            <div class="when">${d.when}</div>
          </div>
        </a>`).join("")}
    </section>

    <div class="sech"><h5>The rest of it</h5><span>Crypto · Tech · Politics</span></div>
    <section class="three">
      <div class="crypto">${pic(R.crypto.img, 230)}<h3>${R.crypto.title}</h3><p class="sm">${R.crypto.body}</p></div>
      <div>${pic(R.tech.img, 170)}<ul class="tl">${R.tech.items.map(([a, b]) => `<li><b>${a}</b>${b}</li>`).join("")}</ul></div>
      <div class="pol">${pic(R.politics.img, 170)}<h3>${R.politics.title}</h3><p class="sm">${R.politics.body}</p></div>
    </section>

    <div class="sech"><h5>World</h5><span>Around the globe</span></div>
    <section class="world">
      ${C.world.map(w => `<a href="#">${pic(w.img, 0, w.kicker)}<span class="k">${w.kicker}</span><h4>${w.title}</h4></a>`).join("")}
    </section>
  `;

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
    } catch (_) { /* offline or rate-limited: leave last values */ }
  }
  tick();
  setInterval(tick, 60_000);
})();
