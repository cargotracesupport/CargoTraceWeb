"use client";

import { useEffect, useRef } from "react";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { mapStyleUrl } from "@/lib/maptiler";
import { roadRoute } from "@/lib/route";

export interface MapMarker {
  id: string;
  lng: number;
  lat: number;
  label?: string;
  kind?: "truck" | "origin" | "dest";
}

const COLORS: Record<NonNullable<MapMarker["kind"]>, string> = {
  truck: "#00e676",
  origin: "#40c4ff",
  dest: "#ffb74d",
};

const TRUCK_SVG =
  '<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="1.5" y="6.5" width="11" height="9" rx="1.5"/><path d="M12.5 9.5h4l3.5 3.5v2.5h-7.5z"/><circle cx="6" cy="18" r="1.9"/><circle cx="16.5" cy="18" r="1.9"/></svg>';

/** Build a marker element: a truck badge for the live vehicle, a dot for origin/dest. */
function makeMarkerEl(m: MapMarker): HTMLElement {
  const el = document.createElement("div");
  const kind = m.kind ?? "truck";
  const color = COLORS[kind];
  if (kind === "truck") {
    el.className = "ct-truck-marker";
    el.style.cssText = `width:30px;height:30px;border-radius:50%;display:flex;align-items:center;justify-content:center;background:${color};border:2.5px solid #fff;color:#0a2a14;cursor:pointer;`;
    el.innerHTML = TRUCK_SVG;
  } else {
    el.style.cssText = `width:16px;height:16px;border-radius:50%;border:2.5px solid #fff;background:${color};box-shadow:0 0 0 4px ${color}33;cursor:pointer;`;
  }
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
        "line-color": "#40c4ff",
        "line-width": 3,
        "line-dasharray": [2, 1.5],
        "line-opacity": 0.85,
      },
    });
  }
}

/**
 * Reusable live map. Renders markers (truck / origin / destination) and, when a
 * `route` is given, a dashed A→B direction line. Invalid coordinates are ignored
 * so bad data never crashes the map. Used by Admin, Driver and Customer.
 */
export default function LiveMap({
  markers,
  route,
  roadFrom,
  roadTo,
  className,
  fit = true,
}: {
  markers: MapMarker[];
  route?: Array<[number, number]>;
  /** When set, the map draws the by-road driving route from A→B (falls back to a line). */
  roadFrom?: [number, number];
  roadTo?: [number, number];
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
        marker = new maplibregl.Marker({ element: makeMarkerEl(m) })
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

    if (fit && valid.length > 0) {
      const bounds = new maplibregl.LngLatBounds();
      valid.forEach((m) => bounds.extend([m.lng, m.lat]));
      map.fitBounds(bounds, { padding: 60, maxZoom: 14, duration: 600 });
    }
  }, [markers, fit]);

  // Stable dependency key (a deps array must keep a constant size across renders).
  const routeKey = JSON.stringify({ route, roadFrom, roadTo });

  // Sync route line. When roadFrom/roadTo are given, fetch the actual by-road
  // driving path; otherwise draw the explicit `route`. Waits for the style.
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

    resolve().then((coords) => {
      if (cancelled || !mapRef.current) return;
      const apply = () => setRouteLine(map, coords);
      if (map.isStyleLoaded()) apply();
      else map.once("load", apply);
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
