"use client";

import { useEffect, useRef } from "react";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { mapStyleUrl } from "@/lib/maptiler";
import { roadRoute } from "@/lib/route";

// Camera tilt (degrees) for the 3D "moving" navigation view — the billboard
// markers (warehouse, truck) stand upright on the tilted ground plane. Kept on
// every camera move (init / fit / fly) so the 3D feel is consistent.
const PITCH = 50;

export interface MapMarker {
  id: string;
  lng: number;
  lat: number;
  label?: string;
  kind?: "truck" | "origin" | "dest";
}

// Dimensional "3D-style" map markers: a green truck for the live vehicle, a blue
// warehouse for the pickup (origin), an amber person pin for the customer (dest).
// Two-tone shading + a ground-shadow ellipse give each a placed-on-the-map feel.
const MARKER_SVG: Record<NonNullable<MapMarker["kind"]>, string> = {
  truck:
    '<svg width="46" height="38" viewBox="0 0 46 38" xmlns="http://www.w3.org/2000/svg"><ellipse cx="23" cy="34.5" rx="16" ry="2.8" fill="rgba(0,0,0,0.22)"/><rect x="3" y="9" width="24" height="16" rx="2" fill="#00c853"/><rect x="3" y="9" width="24" height="4.5" rx="2" fill="#1aff90"/><path d="M27 13h6.5l5.5 5.5V25H27z" fill="#00a14e"/><path d="M27 13h6.5l5.5 5.5H27z" fill="#0bbf63"/><rect x="30" y="15" width="6.5" height="4.8" rx="1" fill="#cdeffd"/><rect x="3" y="24.5" width="36" height="2.2" fill="#00733a"/><circle cx="12.5" cy="28" r="4.2" fill="#16212c"/><circle cx="12.5" cy="28" r="1.6" fill="#9fb1c0"/><circle cx="32" cy="28" r="4.2" fill="#16212c"/><circle cx="32" cy="28" r="1.6" fill="#9fb1c0"/></svg>',
  origin:
    '<svg width="44" height="42" viewBox="0 0 44 42" xmlns="http://www.w3.org/2000/svg"><ellipse cx="22" cy="38.5" rx="16" ry="2.8" fill="rgba(0,0,0,0.22)"/><path d="M4 18 22 7 40 18Z" fill="#2a86b8"/><path d="M22 7 40 18 22 18Z" fill="#1f6f9e"/><rect x="7" y="18" width="30" height="18" fill="#40c4ff"/><rect x="30" y="18" width="7" height="18" fill="#2f9bd1"/><rect x="14.5" y="23" width="12" height="13" rx="1" fill="#0e3a57"/><rect x="14.5" y="25" width="12" height="1.5" fill="#15527d"/><rect x="14.5" y="28.5" width="12" height="1.5" fill="#15527d"/><rect x="14.5" y="32" width="12" height="1.5" fill="#15527d"/></svg>',
  dest:
    '<svg width="32" height="42" viewBox="0 0 32 42" xmlns="http://www.w3.org/2000/svg"><ellipse cx="16" cy="39" rx="6.5" ry="2.4" fill="rgba(0,0,0,0.22)"/><path d="M16 1.5C8 1.5 2.5 7.4 2.5 14.2 2.5 23 16 36 16 36S29.5 23 29.5 14.2C29.5 7.4 24 1.5 16 1.5Z" fill="#ffb74d"/><path d="M26.6 7C28.4 9 29.5 11.5 29.5 14.2 29.5 23 16 36 16 36 18.4 28 24 21 26 16.5 27.6 12.8 27.2 9.4 26.6 7Z" fill="#ef9f2c"/><circle cx="16" cy="11.5" r="3.6" fill="#fff"/><path d="M9.5 21.5a6.5 6 0 0 1 13 0Z" fill="#fff"/></svg>',
};

/** Build a dimensional 3D-style marker element for the given point. */
function makeMarkerEl(m: MapMarker): HTMLElement {
  const el = document.createElement("div");
  el.style.cssText =
    "cursor:pointer;line-height:0;filter:drop-shadow(0 1px 1px rgba(0,0,0,0.25));";
  el.innerHTML = MARKER_SVG[m.kind ?? "truck"];
  if (m.label) el.title = m.label;
  return el;
}

// Guard against bad data: MapLibre throws on out-of-range coordinates, which
// would crash the whole page. Anything invalid is simply skipped.
function isValidLngLat(lng: number, lat: number): boolean {
  return (
    Number.isFinite(lng) &&
    Number.isFinite(lat) &&
    lat >= -90 &&
    lat <= 90 &&
    lng >= -180 &&
    lng <= 180
  );
}

const ROUTE_SOURCE = "route";
const ROUTE_LAYER = "route-line";

function setRouteLine(
  map: maplibregl.Map,
  coords: Array<[number, number]> | undefined,
) {
  const existing = map.getSource(ROUTE_SOURCE) as
    | maplibregl.GeoJSONSource
    | undefined;

  const valid = (coords ?? []).filter(([lng, lat]) => isValidLngLat(lng, lat));

  if (valid.length < 2) {
    if (map.getLayer(ROUTE_LAYER)) map.removeLayer(ROUTE_LAYER);
    if (existing) map.removeSource(ROUTE_SOURCE);
    return;
  }

  const data: GeoJSON.Feature<GeoJSON.LineString> = {
    type: "Feature",
    properties: {},
    geometry: { type: "LineString", coordinates: valid },
  };

  if (existing) {
    existing.setData(data);
  } else {
    map.addSource(ROUTE_SOURCE, { type: "geojson", data });
    map.addLayer({
      id: ROUTE_LAYER,
      type: "line",
      source: ROUTE_SOURCE,
      layout: { "line-cap": "round", "line-join": "round" },
      paint: {
        "line-color": "#2f9bd1",
        "line-width": 4,
        "line-opacity": 0.9,
      },
    });
  }
}

/**
 * Reusable live map. Renders markers (truck / origin / destination) and, when a
 * direction is given, a solid by-road route line A→B. Invalid coordinates are
 * ignored so bad data never crashes the map. Used by Admin, Driver and Customer.
 */
export default function LiveMap({
  markers,
  route,
  roadFrom,
  roadTo,
  focus,
  focusKey,
  className,
  fit = true,
}: {
  markers: MapMarker[];
  route?: Array<[number, number]>;
  /** When set, the map draws the by-road driving route from A→B (falls back to a line). */
  roadFrom?: [number, number];
  roadTo?: [number, number];
  /** Fly the camera to this point (e.g. a selected driver) instead of fitting all markers. */
  focus?: { lng: number; lat: number; zoom?: number };
  /** Re-fly only when this key changes (e.g. the selected delivery id), not on every position tick. */
  focusKey?: string;
  className?: string;
  fit?: boolean;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const markersRef = useRef<Map<string, maplibregl.Marker>>(new Map());

  // init once
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    const map = new maplibregl.Map({
      container: containerRef.current,
      style: mapStyleUrl(),
      center: [120.9842, 14.5995],
      zoom: 11,
      pitch: PITCH,
      attributionControl: false,
    });
    map.addControl(
      new maplibregl.NavigationControl({ showCompass: false }),
      "top-right",
    );
    mapRef.current = map;
    return () => {
      map.remove();
      mapRef.current = null;
      markersRef.current.clear();
    };
  }, []);

  // sync markers
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const valid = markers.filter((m) => isValidLngLat(m.lng, m.lat));

    const seen = new Set<string>();
    for (const m of valid) {
      seen.add(m.id);
      let marker = markersRef.current.get(m.id);
      if (!marker) {
        marker = new maplibregl.Marker({
          element: makeMarkerEl(m),
          anchor: "bottom",
        })
          .setLngLat([m.lng, m.lat])
          .addTo(map);
        markersRef.current.set(m.id, marker);
      } else {
        marker.setLngLat([m.lng, m.lat]);
      }
    }
    // remove stale (incl. markers that became invalid)
    for (const [id, marker] of markersRef.current) {
      if (!seen.has(id)) {
        marker.remove();
        markersRef.current.delete(id);
      }
    }

    // When a specific point is focused (a selected driver), the focus effect
    // drives the camera — don't also fit to the whole route.
    if (fit && !focus && valid.length > 0) {
      const bounds = new maplibregl.LngLatBounds();
      valid.forEach((m) => bounds.extend([m.lng, m.lat]));
      // Fit flat (no pitch here — fitting bounds *at* a tilt over-zooms); the
      // camera keeps the 3D pitch set at init / re-applied below.
      map.fitBounds(bounds, { padding: 60, maxZoom: 14, duration: 600 });
      if (Math.round(map.getPitch()) !== PITCH) map.setPitch(PITCH);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [markers, fit]);

  // Fly to a focused point (e.g. the selected driver) at a close zoom, only when
  // focusKey changes — so picking a delivery navigates accurately to its driver.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !focus) return;
    // flyTo only moves the camera (no style/tiles needed), so call it directly.
    // Gating on isStyleLoaded()/once("load") can silently miss because the map's
    // "load" event has already fired by the time a delivery is selected.
    map.flyTo({
      center: [focus.lng, focus.lat],
      zoom: focus.zoom ?? 13,
      pitch: PITCH,
      duration: 1100,
      essential: true,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusKey]);

  // Stable dependency key (a deps array must keep a constant size across renders).
  const routeKey = JSON.stringify({ route, roadFrom, roadTo });

  // Sync the route line. When roadFrom/roadTo are given, fetch the by-road
  // driving path (falls back to a straight line); otherwise draw `route`.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    let cancelled = false;

    async function resolve(): Promise<Array<[number, number]> | undefined> {
      if (
        roadFrom &&
        roadTo &&
        isValidLngLat(roadFrom[0], roadFrom[1]) &&
        isValidLngLat(roadTo[0], roadTo[1])
      ) {
        return roadRoute(roadFrom, roadTo);
      }
      return route;
    }

    // addSource/addLayer need a loaded style. Gating on once("load") can miss
    // when the style already loaded, so poll via styledata until ready.
    function whenStyleReady(cb: () => void) {
      if (!map) return;
      if (map.isStyleLoaded()) {
        cb();
        return;
      }
      const onData = () => {
        if (map.isStyleLoaded()) {
          map.off("styledata", onData);
          cb();
        }
      };
      map.on("styledata", onData);
    }

    resolve().then((coords) => {
      if (cancelled || !mapRef.current) return;
      whenStyleReady(() => {
        if (!cancelled && mapRef.current) setRouteLine(map, coords);
      });
    });

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [routeKey]);

  return (
    <div
      ref={containerRef}
      className={className}
      style={{ width: "100%", height: "100%" }}
    />
  );
}
