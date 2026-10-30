# mournyl news

A self-updating news homepage. Every visit pulls fresh headlines and photos from public RSS feeds, so there's nothing to edit day to day.

```
wrangler.jsonc       Cloudflare Worker config
src/worker.js        routes: /api/news, /api/sports, everything else → /public
src/news.js          3 biggest stories, meal deals, Red Bull watch, deals (RSS)
src/sports.js        today's games + 7-day calendar (ESPN public scoreboard)
public/              index.html, app.js, styles.css, img/
```

No API keys are needed. News comes from public RSS feeds, sports from ESPN's public scoreboard, and meal-deal extraction from Cloudflare Workers AI on your own account (the free daily allowance is plenty).

## What's on the page
- **Today's 3 biggest stories.** Headlines from NYT, BBC, NPR, CBS, ABC, NBC, The Guardian, Fox and the Washington Post are grouped by topic. The stories the most outlets are covering win, with Google News' top ranking as a tiebreaker. Each one shows the "Covered by N outlets" count and links to the other outlets' versions. Only the last 36 hours count.
- **Sports.** Today's games with live scores (refreshing every minute while games are live), team logos and colors, TV channels, and league filter tabs. A "This week" calendar covers the next 6 days: every NFL game, Top-25 college games, soccer, and national-TV NBA/NHL games.
- **Meal Deals.** These are real offers, not headlines. Once a day at 5 AM Eastern (cron), `src/mealdeals.js` collects fresh deal articles (Fast Food Post, Chew Boom, Bing News deal searches) and reads each **full article**. Workers AI then extracts only what the article states: brand, exact offer, conditions and start/end dates. Non-offers are dropped. Extractions are checked against the article: the brand and any price or percent must actually appear in it. Expired deals disappear automatically, and offers starting within 14 days show as **SOON**. Results are stored in KV (`DEALS`), so each article is processed once.
- **Red Bull Edition Watch.** Bing News, Google News, and Sporked and Impulsive Buy Red Bull tags. Flavor/edition news only (racing is filtered out), **max 30 days old**.
- **Deals & Steals.** Slickdeals and DealNews, last 4 days.
- Photos are full color. If a feed has no photo, the Worker pulls the article's own preview image.

To change a source or an age limit, edit `FEEDS` / `MAX_AGE` in `src/news.js` or `LEAGUES` in `src/sports.js`.

## Preview locally
```
npx wrangler dev
```
Then open http://localhost:8787

## Deploy (Cloudflare Workers, connected to GitHub)
- Push to GitHub. Cloudflare runs `npx wrangler deploy` automatically.
- `name` in `wrangler.jsonc` must match the Worker's name in the Cloudflare dashboard.
- Custom domain: **Worker → Settings → Domains & Routes → Add → Custom domain** → `news.mournyl.com`.

## First deploy notes
- `wrangler.jsonc` declares a KV namespace (`DEALS`) without an id. Wrangler creates it automatically on deploy. If your deploy errors about it, run `npx wrangler kv namespace create DEALS` and paste the printed `id` into the `kv_namespaces` entry.
- Meal Deals fill in a few minutes after the first visit, then refresh daily at 5 AM Eastern. Expired deals still drop off the moment their end date passes, because dates are re-checked on every page load.
