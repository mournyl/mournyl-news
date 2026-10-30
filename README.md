# mournyl news

A self-updating news homepage. Every visit pulls fresh headlines and photos from public RSS feeds, so there's nothing to edit day to day.

```
wrangler.jsonc       Cloudflare Worker config
src/worker.js        entry: /api/news → feed, everything else → /public
src/news.js          fetches + merges the RSS feeds → JSON (edit FEEDS here)
public/index.html    page shell
public/styles.css    black & white styling (article photos shown grayscale)
public/app.js        renders the page from /api/news + live BTC/ETH ticker
public/img/          wordmark + favicon
```

## How it updates
- `/api/news` runs on Cloudflare, fetches the feeds listed in `src/news.js`, and caches the result for 15 minutes.
- The page reloads the feed every 15 minutes while it's open.
- Photos come from each article's feed, and every story links to the original article.
- If a feed goes down, that source is skipped and everything else still loads.

## Sections and sources
| Section | Sources |
|---|---|
| Top story + Latest | BBC News, NPR, The Guardian |
| Red Bull Edition Watch | Sporked + The Impulsive Buy Red Bull tags, Google News ("Red Bull" edition flavor, last 60 days; racing/F1 filtered out) |
| New & limited (drops) | The Impulsive Buy, Sporked, Chew Boom |
| Meal Deals | Fast Food Post, Chew Boom, Brand Eating, Google News (fast-food deals, last 7 days), keeping only BOGO / free / $ / % off / returns-style headlines |
| Deals & Steals | Slickdeals front page, DealNews |
| Tech | The Verge, Ars Technica, TechCrunch |
| Politics | NPR Politics, The Guardian |
| Sports | ESPN, BBC Sport, CBS Sports |
| World | BBC World, The Guardian, Al Jazeera |
| Aviation | AVweb, Simple Flying, The Aviationist |

To add or swap a source, edit the `FEEDS` list at the top of `src/news.js`, then commit and push.

## Preview locally
```
npx wrangler dev
```
Then open http://localhost:8787

## Deploy (Cloudflare Workers, connected to GitHub)
- Push to GitHub. Cloudflare runs `npx wrangler deploy` automatically.
- `name` in `wrangler.jsonc` must match the Worker's name in the Cloudflare dashboard.
- Custom domain: **Worker → Settings → Domains & Routes → Add → Custom domain** → `news.mournyl.com`.
