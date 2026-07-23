// Google Maps configuration + a tiny client-side loader. Everything here is
// OPTIONAL: with no keys the app falls back to MapLibre (display) and OSRM
// (routing), so it keeps working until the keys are added to the environment.
//
// Keys (set in .env.local locally AND in Vercel → Project → Environment Variables):
//   NEXT_PUBLIC_GOOGLE_MAPS_KEY  browser key, HTTP-referrer restricted (Maps JS)
//   NEXT_PUBLIC_GOOGLE_MAP_ID    Map ID for the vector map + advanced markers
//   GOOGLE_ROUTES_KEY            server key for the Routes API (never shipped)

export const GOOGLE_MAPS_KEY = process.env.NEXT_PUBLIC_GOOGLE_MAPS_KEY ?? "";
export const GOOGLE_MAP_ID = process.env.NEXT_PUBLIC_GOOGLE_MAP_ID ?? "";

/** Is the browser Maps key configured? Drives the MapLibre→Google switch. */
export function hasGoogleMaps(): boolean {
  return GOOGLE_MAPS_KEY.length > 0;
}

// Single in-flight load shared across every map instance on the page.
let loadPromise: Promise<unknown> | null = null;

/**
 * Load the Google Maps JS SDK (with the marker library) once, resolving to the
 * `google.maps` namespace. Rejects if there's no key or the script fails.
 */
export function loadGoogleMaps(): Promise<unknown> {
  if (typeof window === "undefined")
    return Promise.reject(new Error("no window"));
  const w = window as unknown as {
    google?: { maps?: unknown };
    [k: string]: unknown;
  };
  if (!GOOGLE_MAPS_KEY) return Promise.reject(new Error("no google maps key"));
  if (w.google?.maps) return Promise.resolve(w.google.maps);
  if (loadPromise) return loadPromise;

  loadPromise = new Promise((resolve, reject) => {
    const cbName = "__ct_gmaps_cb";
    w[cbName] = () => resolve((w.google as { maps: unknown }).maps);
    const s = document.createElement("script");
    s.src =
      "https://maps.googleapis.com/maps/api/js?" +
      `key=${encodeURIComponent(GOOGLE_MAPS_KEY)}` +
      "&libraries=marker&v=weekly&loading=async" +
      `&callback=${cbName}`;
    s.async = true;
    s.onerror = () => reject(new Error("google maps failed to load"));
    document.head.appendChild(s);
  });
  return loadPromise;
}
