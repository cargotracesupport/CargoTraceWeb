// MapLibre style URL from a MapTiler key. Falls back to a free demo style if no key,
// so the app still renders during local dev (rate-limited; set a real key for production).

export function mapStyleUrl(): string {
  const key = process.env.NEXT_PUBLIC_MAPTILER_KEY;
  const dark =
    typeof document !== "undefined" &&
    document.documentElement.classList.contains("dark");
  if (key) {
    const style = dark ? "streets-v2-dark" : "streets-v2";
    return `https://api.maptiler.com/maps/${style}/style.json?key=${key}`;
  }
  return "https://demotiles.maplibre.org/style.json";
}
