// Marker artwork + a couple of guards for the Google map. makeMarkerEl returns a
// DOM element used as the marker content (Google AdvancedMarkerElement content).

import type { MapMarker } from "@/components/liveMapTypes";

// 3D-style map markers built from gradients + a ground shadow: a green delivery
// truck for the live vehicle, a blue warehouse for the pickup (origin), and an
// amber house for the customer (drop-off).
export const MARKER_SVG: Record<NonNullable<MapMarker["kind"]>, string> = {
  truck:
    '<svg width="52" height="42" viewBox="0 0 52 42" xmlns="http://www.w3.org/2000/svg">' +
    '<defs>' +
    '<linearGradient id="tkBody" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#4dea86"/><stop offset="1" stop-color="#00b24a"/></linearGradient>' +
    '<linearGradient id="tkCab" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#22cf6c"/><stop offset="1" stop-color="#00983f"/></linearGradient>' +
    '<linearGradient id="tkGlass" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#eaf9ff"/><stop offset="1" stop-color="#a9d8ee"/></linearGradient>' +
    '</defs>' +
    '<ellipse cx="26" cy="38" rx="19" ry="3" fill="rgba(0,0,0,0.22)"/>' +
    '<rect x="4" y="8" width="29" height="21" rx="3" fill="url(#tkBody)"/>' +
    '<rect x="4" y="8" width="29" height="6" rx="3" fill="#7cefa6" opacity="0.55"/>' +
    '<path d="M33 13h7l6.5 6.5V29H33z" fill="url(#tkCab)"/>' +
    '<path d="M34.5 15h5l4.8 4.8h-9.8z" fill="url(#tkGlass)"/>' +
    '<rect x="4" y="28.5" width="42.5" height="3" rx="1.5" fill="#006e2f"/>' +
    '<circle cx="15" cy="32" r="4.8" fill="#18232f"/><circle cx="15" cy="32" r="2" fill="#9fb3c4"/>' +
    '<circle cx="37" cy="32" r="4.8" fill="#18232f"/><circle cx="37" cy="32" r="2" fill="#9fb3c4"/>' +
    '</svg>',
  origin:
    '<svg width="48" height="44" viewBox="0 0 48 44" xmlns="http://www.w3.org/2000/svg">' +
    '<defs>' +
    '<linearGradient id="whWall" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#63cdff"/><stop offset="1" stop-color="#2f9bd1"/></linearGradient>' +
    '<linearGradient id="whRoof" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#3a97c9"/><stop offset="1" stop-color="#1f6f9e"/></linearGradient>' +
    '</defs>' +
    '<ellipse cx="24" cy="40.5" rx="16" ry="2.8" fill="rgba(0,0,0,0.22)"/>' +
    '<path d="M7 19 24 9 41 19 41 23 7 23Z" fill="url(#whRoof)"/>' +
    '<path d="M24 9 41 19 24 19Z" fill="#1b628c"/>' +
    '<rect x="8" y="23" width="32" height="16.5" rx="1.5" fill="url(#whWall)"/>' +
    '<rect x="17" y="26.5" width="14" height="13" rx="1" fill="#0e3a57"/>' +
    '<rect x="17" y="28.5" width="14" height="1.6" fill="#1a6294"/>' +
    '<rect x="17" y="31.5" width="14" height="1.6" fill="#1a6294"/>' +
    '<rect x="17" y="34.5" width="14" height="1.6" fill="#1a6294"/>' +
    '</svg>',
  dest:
    '<svg width="44" height="46" viewBox="0 0 44 46" xmlns="http://www.w3.org/2000/svg">' +
    '<defs>' +
    '<linearGradient id="hsWall" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffd889"/><stop offset="1" stop-color="#f0a92e"/></linearGradient>' +
    '<linearGradient id="hsRoof" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ff9366"/><stop offset="1" stop-color="#e5502e"/></linearGradient>' +
    '</defs>' +
    '<ellipse cx="22" cy="42.5" rx="14" ry="2.6" fill="rgba(0,0,0,0.22)"/>' +
    '<rect x="9" y="20" width="26" height="21" rx="1.5" fill="url(#hsWall)"/>' +
    '<path d="M22 6 39.5 21 4.5 21Z" fill="url(#hsRoof)"/>' +
    '<path d="M22 6 39.5 21 22 21Z" fill="#cf4526"/>' +
    '<rect x="18.5" y="28" width="7.5" height="13" rx="1" fill="#7a3d12"/>' +
    '<circle cx="24.5" cy="35" r="0.9" fill="#ffe1a3"/>' +
    '<rect x="11.5" y="24.5" width="6" height="6" rx="1" fill="#eaf9ff"/>' +
    '</svg>',
};

const DOT_COLOR: Record<NonNullable<MapMarker["state"]>, string> = {
  moving: "#22c55e",
  idle: "#f59e0b",
  offline: "#ef4444",
  nosignal: "#ef4444",
};

/** Build a dimensional 3D-style marker element for the given point. */
export function makeMarkerEl(m: MapMarker): HTMLElement {
  const el = document.createElement("div");
  const isTruck = m.kind === "truck";
  const dimmed = isTruck && (m.state === "offline" || m.state === "nosignal");
  el.style.cssText =
    "position:relative;display:inline-block;line-height:0;cursor:pointer;" +
    (dimmed
      ? "filter:grayscale(1) drop-shadow(0 1px 1px rgba(0,0,0,0.25));opacity:0.62;"
      : "filter:drop-shadow(0 1px 2px rgba(0,0,0,0.28));");

  const art = document.createElement("div");
  art.style.cssText = "line-height:0;";
  art.innerHTML = MARKER_SVG[m.kind ?? "truck"];
  el.appendChild(art);

  if (m.badge) {
    const b = document.createElement("div");
    b.textContent = m.badge;
    b.style.cssText =
      "position:absolute;top:-7px;left:50%;transform:translateX(-50%);" +
      "min-width:17px;height:17px;padding:0 3px;border-radius:9999px;" +
      "background:#0e3a57;color:#fff;font:700 11px/17px system-ui,sans-serif;" +
      "text-align:center;box-shadow:0 1px 2px rgba(0,0,0,0.35);";
    el.appendChild(b);
  }

  // Live status dot for the truck (moving = green, idle = amber, offline = red).
  if (isTruck && m.state) {
    const dot = document.createElement("div");
    dot.style.cssText =
      "position:absolute;top:-2px;right:-2px;width:11px;height:11px;" +
      `border-radius:9999px;background:${DOT_COLOR[m.state]};` +
      "border:2px solid #fff;box-shadow:0 1px 2px rgba(0,0,0,0.35);";
    el.appendChild(dot);
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
