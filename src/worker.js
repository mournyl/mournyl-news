// mournyl news — Cloudflare Worker entry.
// /api/news   → biggest stories, meal deals, Red Bull watch, deals (src/news.js)
// /api/sports → today's games + 7-day calendar (src/sports.js)
// everything else → static site in /public
import { handleNews } from "./news.js";
import { handleSports } from "./sports.js";

const ROUTES = { "/api/news": handleNews, "/api/sports": handleSports };

export default {
  async fetch(request, env, ctx) {
    const route = ROUTES[new URL(request.url).pathname];
    if (route) {
      try {
        return await route(request, ctx);
      } catch (e) {
        return new Response(JSON.stringify({ error: String(e) }), { status: 500, headers: { "content-type": "application/json" } });
      }
    }
    return env.ASSETS.fetch(request);
  },
};
