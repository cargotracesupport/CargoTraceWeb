// Parse a pasted location: raw "lat, lng", or a Google Maps URL with coordinates
// in it. Short share links (maps.app.goo.gl) are redirects with no coordinates,
// so those are resolved server-side by /api/resolve-location using these helpers.

export interface Point {
  lat: number;
  lng: number;
}

function inRange(lat: number, lng: number): boolean {
  return (
    Number.isFinite(lat) &&
    Number.isFinite(lng) &&
    lat >= -90 &&
    lat <= 90 &&
    lng >= -180 &&
    lng <= 180
  );
}

/** "11.2588, 75.7804" (comma- or space-separated) → point; null otherwise. */
export function parseCoords(s: string): Point | null {
  const m = s
    .trim()
    .match(/^(-?\d{1,3}(?:\.\d+)?)\s*[, ]\s*(-?\d{1,3}(?:\.\d+)?)$/);
  if (!m) return null;
  const lat = Number(m[1]);
  const lng = Number(m[2]);
  return inRange(lat, lng) ? { lat, lng } : null;
}

/** The first http(s) URL in the text, or null. */
export function extractUrl(s: string): string | null {
  const m = s.match(/https?:\/\/[^\s]+/i);
  return m ? m[0] : null;
}

/** True if the input contains a URL we should try to resolve as a link. */
export function looksLikeUrl(s: string): boolean {
  return /https?:\/\//i.test(s);
}

/** Coordinates embedded in a Google Maps URL or page HTML. */
export function coordsFromMapsText(text: string): Point | null {
  const patterns = [
    /@(-?\d+\.\d+),(-?\d+\.\d+)/, //           /@lat,lng,zoom
    /!3d(-?\d+\.\d+)!4d(-?\d+\.\d+)/, //        place data
    /[?&](?:q|ll|sll|center|destination|daddr)=(-?\d+\.\d+),\s*(-?\d+\.\d+)/,
    /\/(-?\d+\.\d+),(-?\d+\.\d+)/, //           /lat,lng path (last resort)
  ];
  for (const re of patterns) {
    const m = text.match(re);
    if (m) {
      const lat = Number(m[1]);
      const lng = Number(m[2]);
      if (inRange(lat, lng)) return { lat, lng };
    }
  }
  return null;
}

// Google's share-link shorteners.
const SHORTENER_HOSTS = new Set(["maps.app.goo.gl", "goo.gl", "g.co"]);
// google.com / google.co.in / google.com.au, optionally www. or maps. —
// anchored at both ends so "google.attacker.com" can't pass.
const GOOGLE_HOST_RE = /^(?:www\.|maps\.)?google\.(?:com|co\.[a-z]{2}|com\.[a-z]{2})$/;

/**
 * SSRF guard: only fetch https URLs on Google Maps hosts, on the default
 * port, with no credentials. The server route re-checks this on every
 * redirect hop, so a link can't bounce the fetch somewhere else.
 */
export function isAllowedMapsHost(url: string): boolean {
  try {
    const u = new URL(url);
    if (u.protocol !== "https:" || u.port !== "" || u.username || u.password) {
      return false;
    }
    const h = u.hostname.toLowerCase();
    return SHORTENER_HOSTS.has(h) || GOOGLE_HOST_RE.test(h);
  } catch {
    return false;
  }
}
