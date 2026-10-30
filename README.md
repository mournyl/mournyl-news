# mournyl news

A static news homepage for **news.mournyl.com**. It has no build step and no dependencies.

```
index.html     page shell (masthead, top bar, footer)
styles.css     all styling (black & white, responsive)
app.js         renders the page from content.js + live BTC/ETH ticker
content.js     ← edit this to change stories, deals, images
img/           illustrations (SVG), wordmark, favicon
```

## Edit content
Open `content.js`, change the text, save, commit, push. Cloudflare redeploys automatically.

- `breaking`: the developing-story strip. Set it to `null` to hide it.
- `countdown`: the top-bar countdown (label and date). Set it to `null` to hide it.
- `deals`: set `hot: true` to give a card the white border and the HOT tag.
- For an image, drop a file in `img/` and point `img:` / `image:` at it. SVG, PNG and JPG all work.

## Preview locally
Double-click `index.html`, or use VS Code's Live Server extension.

## Deploy (Cloudflare Pages)
1. Push this folder to a new GitHub repo, e.g. `mournyl-news`.
2. In Cloudflare, go to **Workers & Pages → Create → Pages → Connect to Git** and pick the repo.
   - Framework preset: **None**
   - Build command: *(leave empty)*
   - Build output directory: `/`
3. In the Pages project, go to **Custom domains → Set up a custom domain** and enter `news.mournyl.com`, or whatever subdomain you want. Cloudflare adds the DNS record automatically.
