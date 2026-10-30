// Weather handler → GET /api/weather
// Charleston, SC conditions from the National Weather Service (free, no key). Cached 20 minutes.

const LAT = 32.7765, LON = -79.9311; // downtown Charleston
const UA = "mournyl-news/1.0 (https://news.mournyl.com)";

export async function handleWeather(request, ctx) {
  const cache = caches.default;
  const key = new Request(new URL("/api/weather?v=1", request.url).toString());
  const hit = await cache.match(key);
  if (hit) return hit;

  let out = { place: "Charleston, SC" };
  try {
    const get = async (u, ttl) => {
      const r = await fetch(u, { headers: { "user-agent": UA, accept: "application/geo+json" }, cf: { cacheTtl: ttl, cacheEverything: true } });
      if (!r.ok) throw new Error(`NWS ${r.status}`);
      return r.json();
    };
    const pt = await get(`https://api.weather.gov/points/${LAT},${LON}`, 86400);
    const [hourly, daily] = await Promise.all([get(pt.properties.forecastHourly, 1200), get(pt.properties.forecast, 1800)]);
    const now = hourly.properties.periods[0];
    const today = daily.properties.periods.slice(0, 2);
    const hi = today.find(p => p.isDaytime), lo = today.find(p => !p.isDaytime);
    out = {
      ...out,
      temp: now.temperature, unit: now.temperatureUnit, short: now.shortForecast,
      high: hi ? hi.temperature : null, low: lo ? lo.temperature : null,
      rain: now.probabilityOfPrecipitation?.value ?? null,
      wind: now.windSpeed + " " + now.windDirection,
    };
  } catch (e) { out.error = String(e); }

  const res = new Response(JSON.stringify(out), { headers: { "content-type": "application/json", "cache-control": "public, max-age=1200" } });
  if (!out.error) ctx.waitUntil(cache.put(key, res.clone()));
  return res;
}
