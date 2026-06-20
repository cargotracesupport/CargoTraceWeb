"use client";

import { useEffect, useRef } from "react";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { mapStyleUrl } from "@/lib/maptiler";

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

const ROUTE_SOURCE = "route";
const ROUTE_LAYER = "route-line";

function setRouteLine(
  map: maplibregl.Map,
  coords: Array<[number, number]> | undefined,
) {
  const existing = map.getSource(ROUTE_SOURCE) as
    | maplibregl.GeoJSONSource
    | undefined;

  if (!coords || coords.length < 2) {
    if (map.getLayer(ROUTE_LAYER)) map.removeLayer(ROUTE_LAYER);
    if (existing) map.removeSource(ROUTE_SOURCE);
    return;
  }

  const data: GeoJSON.Feature<GeoJSON.LineString> = {
    type: "Feature",
    properties: {},
    geometry: { type: "LineString", coordinates: coords },
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
 * `route` is given, a dashed A→B direction line. Used by Admin, Driver and Customer.
 */
export default function LiveMap({
  markers,
  route,
  className,
  fit = true,
}: {
  markers: MapMarker[];
  route?: Array<[number, number]>;
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

    const seen = new Set<string>();
    for (const m of markers) {
      if (m.lng == null || m.lat == null) continue;
      seen.add(m.id);
      let marker = markersRef.current.get(m.id);
      if (!marker) {
        const el = document.createElement("div");
        el.style.cssText = `width:16px;height:16px;border-radius:50%;border:2.5px solid #fff;
          background:${COLORS[m.kind ?? "truck"]};box-shadow:0 0 0 4px ${COLORS[m.kind ?? "truck"]}33;cursor:pointer;`;
        if (m.label) el.title = m.label;
        marker = new maplibregl.Marker({ element: el })
          .setLngLat([m.lng, m.lat])
          .addTo(map);
        markersRef.current.set(m.id, marker);
      } else {
        marker.setLngLat([m.lng, m.lat]);
      }
    }
    // remove stale
    for (const [id, marker] of markersRef.current) {
      if (!seen.has(id)) {
        marker.remove();
        markersRef.current.delete(id);
      }
    }

    if (fit && markers.length > 0) {
      const bounds = new maplibregl.LngLatBounds();
      markers.forEach((m) => bounds.extend([m.lng, m.lat]));
      map.fitBounds(bounds, { padding: 60, maxZoom: 14, duration: 600 });
    }
  }, [markers, fit]);

  // sync route line (waits for the style to be ready before adding layers)
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const apply = () => setRouteLine(map, route);
    if (map.isStyleLoaded()) apply();
    else map.once("load", apply);
  }, [route]);

  return (
    <div
      ref={containerRef}
      className={className}
      style={{ width: "100%", height: "100%" }}
    />
  );
}
