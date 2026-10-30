// mournyl news — Cloudflare Worker entry.
// /api/news   → biggest stories, meal deals, Red Bull watch, deals (src/news.js)
// /api/sports → today's games + 7-day calendar (src/sports.js)
// cron        → refreshes the structured meal deals daily at 5 AM Eastern (src/mealdeals.js)
// everything else → static site in /public
import { handleNews } from "./news.js";
import { handleSports } from "./sports.js";
import { buildMealDeals, dealsStatus } from "./mealdeals.js";

const json = (o) => new Response(JSON.stringify(o, null, 2), { headers: { "content-type": "application/json", "cache-control": "no-store" } });
const ROUTES = {
  "/api/news": handleNews,
  "/api/sports": handleSports,
  "/api/deals/status": async (req, ctx, env) => json(await dealsStatus(env)),
};

export default {
  async fetch(request, env, ctx) {
    const route = ROUTES[new URL(request.url).pathname];
    if (route) {
      try {
        return await route(request, ctx, env);
      } catch (e) {
        return new Response(JSON.stringify({ error: String(e) }), { status: 500, headers: { "content-type": "application/json" } });
      }
    }
    return env.ASSETS.fetch(request);
  },

  async scheduled(event, env, ctx) {
    // two UTC crons cover daylight saving; only run the one that is 5 AM in New York
    const hourET = +new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", hour: "numeric", hourCycle: "h23" }).format(new Date(event.scheduledTime));
    if (hourET !== 5) return;
    ctx.waitUntil(buildMealDeals(env));
  },
};
