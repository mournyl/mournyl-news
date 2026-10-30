// mournyl news — Cloudflare Worker entry.
// /api/news  → live headlines from RSS (see src/news.js)
// everything else → static site in /public
import { handleNews } from "./news.js";

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (url.pathname === "/api/news") {
      try {
        return await handleNews(request, ctx);
      } catch (e) {
        return new Response(JSON.stringify({ error: String(e) }), { status: 500, headers: { "content-type": "application/json" } });
      }
    }
    return env.ASSETS.fetch(request);
  },
};
