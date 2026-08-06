// Map marker artwork. Rendered as classic google.maps.Marker icons (SVG data
// URIs) so they show on ANY map — unlike AdvancedMarkerElement, which silently
// renders nothing unless the Map ID is a Vector map. Clean, Google-style pins:
// a blue pickup pin, a red drop-off (home) pin, and a coloured live-vehicle disc.

import type { MapMarker } from "@/components/liveMapTypes";

export interface MarkerIcon {
  svg: string;
  /** rendered size */
  w: number;
  h: number;
  /** anchor point (the spot that sits on the coordinate) */
  ax: number;
  ay: number;
}

const XMLNS = 'xmlns="http://www.w3.org/2000/svg"';

// A teardrop location pin with a white disc holding a glyph (or a letter badge).
function pin(gradId: string, from: string, to: string, glyphColor: string, glyph: string, badge?: string): string {
  const center = badge
    ? `<text x="20" y="21.5" text-anchor="middle" font-family="system-ui,sans-serif" font-weight="700" font-size="12" fill="${glyphColor}">${badge}</text>`
    : glyph;
  return (
    `<svg ${XMLNS} width="40" height="52" viewBox="0 0 40 52">` +
    `<defs><linearGradient id="${gradId}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${from}"/><stop offset="1" stop-color="${to}"/></linearGradient></defs>` +
    `<ellipse cx="20" cy="49.5" rx="5" ry="1.9" fill="rgba(0,0,0,0.28)"/>` +
    `<path d="M20 1.5C11.4 1.5 4.5 8.4 4.5 17 4.5 28 20 49 20 49 20 49 35.5 28 35.5 17 35.5 8.4 28.6 1.5 20 1.5Z" fill="url(#${gradId})" stroke="#fff" stroke-width="1.6"/>` +
    `<circle cx="20" cy="17.5" r="9" fill="#fff"/>` +
    center +
    `</svg>`
  );
}

// Live-vehicle disc, coloured by state (green moving / amber idle / grey offline).
function vehicleDisc(gradId: string, from: string, to: string): string {
  return (
    `<svg ${XMLNS} width="38" height="42" viewBox="0 0 38 42">` +
    `<defs><linearGradient id="${gradId}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${from}"/><stop offset="1" stop-color="${to}"/></linearGradient></defs>` +
    `<ellipse cx="19" cy="38" rx="8.5" ry="2.4" fill="rgba(0,0,0,0.25)"/>` +
    `<circle cx="19" cy="18" r="15.5" fill="url(#${gradId})" stroke="#fff" stroke-width="2.2"/>` +
    // white truck glyph
    `<g fill="#fff"><rect x="9.5" y="13" width="10.5" height="9" rx="1.2"/>` +
    `<path d="M20 15.4h4.2l3.6 3.6V22H20z"/>` +
    `<rect x="21" y="16.6" width="3.4" height="2.4" rx="0.5" fill="rgba(255,255,255,0.6)"/></g>` +
    `<circle cx="14" cy="23.2" r="2.3" fill="#1c2831"/><circle cx="24.3" cy="23.2" r="2.3" fill="#1c2831"/>` +
    `</svg>`
  );
}

const ORIGIN_GLYPH =
  '<g fill="#1f6f9e"><path d="M20 11.7 25.4 14 20 16.3 14.6 14Z"/><path d="M14.4 14.8 19.3 16.9v5.7L14.4 20.5Z"/><path d="M25.6 14.8 20.7 16.9v5.7l4.9-2.1Z" opacity="0.85"/></g>';

const DEST_GLYPH =
  '<g fill="#c33f22"><path d="M20 11.2 27.4 17.4H12.6Z"/><rect x="14.6" y="17.2" width="10.8" height="5.9" rx="0.6"/></g><rect x="18.1" y="19.1" width="3.8" height="4" fill="#fff"/>';

const VEHICLE_GRAD: Record<NonNullable<MapMarker["state"]> | "default", [string, string]> = {
  moving: ["#2fd36f", "#12a150"],
  idle: ["#f6b93b", "#e08d0b"],
  offline: ["#a3adb6", "#6b747c"],
  nosignal: ["#a3adb6", "#6b747c"],
  default: ["#2fd36f", "#12a150"],
};

/** Icon (SVG + size + anchor) for a marker, for use as a classic Marker icon. */
export function markerIcon(m: MapMarker): MarkerIcon {
  if (m.kind === "origin") {
    return { svg: pin("po", "#5ab7e8", "#2f7fb0", "#1f6f9e", ORIGIN_GLYPH, m.badge), w: 40, h: 52, ax: 20, ay: 49 };
  }
  if (m.kind === "dest") {
    return { svg: pin("pd", "#f2704a", "#d6431f", "#c33f22", DEST_GLYPH, m.badge), w: 40, h: 52, ax: 20, ay: 49 };
  }
  const [from, to] = VEHICLE_GRAD[m.state ?? "default"] ?? VEHICLE_GRAD.default;
  return { svg: vehicleDisc("vd", from, to), w: 38, h: 42, ax: 19, ay: 18 };
}

/** SVG string → data URI usable as a Marker icon url. */
export function svgToDataUri(svg: string): string {
  return "data:image/svg+xml;charset=UTF-8," + encodeURIComponent(svg);
}

/** A short key that changes only when the icon should change (kind/state/badge). */
export function iconKey(m: MapMarker): string {
  return `${m.kind ?? "truck"}|${m.state ?? ""}|${m.badge ?? ""}`;
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
