// Marker artwork + a couple of guards for the Google map. makeMarkerEl returns a
// DOM element used as the marker content (Google AdvancedMarkerElement content).

import type { MapMarker } from "@/components/liveMapTypes";

// Dimensional "3D-style" map markers: a green truck for the live vehicle, a blue
// warehouse for the pickup (origin), an amber person pin for the customer (dest).
export const MARKER_SVG: Record<NonNullable<MapMarker["kind"]>, string> = {
  truck:
    '<svg width="46" height="38" viewBox="0 0 46 38" xmlns="http://www.w3.org/2000/svg"><ellipse cx="23" cy="34.5" rx="16" ry="2.8" fill="rgba(0,0,0,0.22)"/><rect x="3" y="9" width="24" height="16" rx="2" fill="#00c853"/><rect x="3" y="9" width="24" height="4.5" rx="2" fill="#1aff90"/><path d="M27 13h6.5l5.5 5.5V25H27z" fill="#00a14e"/><path d="M27 13h6.5l5.5 5.5H27z" fill="#0bbf63"/><rect x="30" y="15" width="6.5" height="4.8" rx="1" fill="#cdeffd"/><rect x="3" y="24.5" width="36" height="2.2" fill="#00733a"/><circle cx="12.5" cy="28" r="4.2" fill="#16212c"/><circle cx="12.5" cy="28" r="1.6" fill="#9fb1c0"/><circle cx="32" cy="28" r="4.2" fill="#16212c"/><circle cx="32" cy="28" r="1.6" fill="#9fb1c0"/></svg>',
  origin:
    '<svg width="44" height="42" viewBox="0 0 44 42" xmlns="http://www.w3.org/2000/svg"><ellipse cx="22" cy="38.5" rx="16" ry="2.8" fill="rgba(0,0,0,0.22)"/><path d="M4 18 22 7 40 18Z" fill="#2a86b8"/><path d="M22 7 40 18 22 18Z" fill="#1f6f9e"/><rect x="7" y="18" width="30" height="18" fill="#40c4ff"/><rect x="30" y="18" width="7" height="18" fill="#2f9bd1"/><rect x="14.5" y="23" width="12" height="13" rx="1" fill="#0e3a57"/><rect x="14.5" y="25" width="12" height="1.5" fill="#15527d"/><rect x="14.5" y="28.5" width="12" height="1.5" fill="#15527d"/><rect x="14.5" y="32" width="12" height="1.5" fill="#15527d"/></svg>',
  dest:
    '<svg width="32" height="42" viewBox="0 0 32 42" xmlns="http://www.w3.org/2000/svg"><ellipse cx="16" cy="39" rx="6.5" ry="2.4" fill="rgba(0,0,0,0.22)"/><path d="M16 1.5C8 1.5 2.5 7.4 2.5 14.2 2.5 23 16 36 16 36S29.5 23 29.5 14.2C29.5 7.4 24 1.5 16 1.5Z" fill="#ffb74d"/><path d="M26.6 7C28.4 9 29.5 11.5 29.5 14.2 29.5 23 16 36 16 36 18.4 28 24 21 26 16.5 27.6 12.8 27.2 9.4 26.6 7Z" fill="#ef9f2c"/><circle cx="16" cy="11.5" r="3.6" fill="#fff"/><path d="M9.5 21.5a6.5 6 0 0 1 13 0Z" fill="#fff"/></svg>',
};

/** Build a dimensional 3D-style marker element for the given point. */
export function makeMarkerEl(m: MapMarker): HTMLElement {
  const el = document.createElement("div");
  // Do NOT set `position` on the root — the map anchors the marker itself;
  // overriding it makes the marker a full-width block.
  el.style.cssText =
    "cursor:pointer;line-height:0;filter:drop-shadow(0 1px 1px rgba(0,0,0,0.25));";
  if (m.badge) {
    const wrap = document.createElement("div");
    wrap.style.cssText = "position:relative;display:inline-block;line-height:0;";
    wrap.innerHTML = MARKER_SVG[m.kind ?? "truck"];
    const b = document.createElement("div");
    b.textContent = m.badge;
    b.style.cssText =
      "position:absolute;top:-7px;left:50%;transform:translateX(-50%);" +
      "min-width:17px;height:17px;padding:0 3px;border-radius:9999px;" +
      "background:#0e3a57;color:#fff;font:700 11px/17px system-ui,sans-serif;" +
      "text-align:center;box-shadow:0 1px 2px rgba(0,0,0,0.35);";
    wrap.appendChild(b);
    el.appendChild(wrap);
  } else {
    el.innerHTML = MARKER_SVG[m.kind ?? "truck"];
  }
  if (m.label) el.title = m.label;
  return el;
}

// Guard against bad data: map libraries throw on out-of-range coordinates, which
// would crash the page. Anything invalid is simply skipped.
export function isValidLngLat(lng: number, lat: number): boolean {
  return (
    Number.isFinite(lng) &&
    Number.isFinite(lat) &&
    lat >= -90 &&
    lat <= 90 &&
    lng >= -180 &&
    lng <= 180
  );
}
