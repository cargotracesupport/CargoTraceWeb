// MapLibre style URL from a MapTiler key. Falls back to a free demo style if no key,
// so the app still renders during local dev (rate-limited; set a real key for production).

export function mapStyleUrl(): string {
  const key = process.env.NEXT_PUBLIC_MAPTILER_KEY;
  if (key) {
    return `https://api.maptiler.com/maps/streets-v2-dark/style.json?key=${key}`;
  }
  return "https://demotiles.maplibre.org/style.json";
}
