# mournyl news

A self-updating news homepage. Every visit pulls fresh headlines and photos from public RSS feeds, so there's nothing to edit day to day.

```
index.html               page shell
styles.css               black & white styling (article photos shown in grayscale)
app.js                   renders the page from /api/news + live BTC/ETH ticker
functions/api/news.js    Cloudflare Pages Function: fetches + merges the RSS feeds → JSON
img/                     wordmark + favicon
```

## How it updates
- `/api/news` runs on Cloudflare, fetches the feeds listed in `functions/api/news.js`, and caches the result for 15 minutes.
- The page reloads the feed every 15 minutes while it's open.
- Photos come from each article's feed, and every story links to the original article.
- If a feed goes down, that source is skipped and everything else still loads.

## Sections and sources
| Section | Sources |
|---|---|
| Top story + Latest | BBC News, NPR, The Guardian |
| New & limited (drops) | The Impulsive Buy, Sporked, Chew Boom |
| Deals | Slickdeals front page, DealNews |
| Tech | The Verge, Ars Technica, TechCrunch |
| Politics | NPR Politics, The Guardian |
| Sports | ESPN, BBC Sport, CBS Sports |
| World | BBC World, The Guardian, Al Jazeera |
| Aviation | AVweb, Simple Flying, The Aviationist |

To add or swap a source, edit the `FEEDS` list at the top of `functions/api/news.js`, then commit and push.

## Preview locally
The feed function only runs on Cloudflare, or locally through Wrangler:
```
npx wrangler pages dev .
```
Then open http://localhost:8788

## Deploy (Cloudflare Pages)
1. Push this folder to a GitHub repo.
2. In Cloudflare, go to **Workers & Pages → Create → Pages → Connect to Git** and pick the repo.
   - Framework preset: **None**
   - Build command: *(empty)*
   - Build output directory: `/`
   - The `functions/` folder is picked up automatically.
3. In the Pages project, go to **Custom domains** and add `news.mournyl.com`.
