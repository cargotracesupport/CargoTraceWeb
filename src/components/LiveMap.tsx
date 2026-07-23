"use client";

import { useEffect, useRef } from "react";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { mapStyleUrl } from "@/lib/maptiler";
import { roadRoute } from "@/lib/route";
import { hasGoogleMaps } from "@/lib/google";
import GoogleLiveMap from "@/components/GoogleLiveMap";
import { makeMarkerEl, isValidLngLat } from "@/components/mapMarkers";
import type { LiveMapProps } from "@/components/liveMapTypes";

export type { MapMarker } from "@/components/liveMapTypes";

// Default camera tilt: flat / top-down.
const PITCH = 0;

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
 * direction is given, a solid by-road route line. Uses Google Maps when a Google
 * key is configured, else the free MapLibre map. Same props either way.
 */
export default function LiveMap(props: LiveMapProps) {
  if (hasGoogleMaps()) return <GoogleLiveMap {...props} />;
  return <MapLibreLiveMap {...props} />;
}

/** MapLibre + MapTiler map — the free default (used when no Google key is set). */
function MapLibreLiveMap({
  markers,
  route,
  roadFrom,
  roadTo,
  focus,
  focusKey,
  className,
  fit = true,
  pitch = PITCH,
}: LiveMapProps) {
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
      pitch,
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
    for (const [id, marker] of markersRef.current) {
      if (!seen.has(id)) {
        marker.remove();
        markersRef.current.delete(id);
      }
    }

    if (fit && !focus && valid.length > 0) {
      const bounds = new maplibregl.LngLatBounds();
      valid.forEach((m) => bounds.extend([m.lng, m.lat]));
      map.fitBounds(bounds, { padding: 60, maxZoom: 14, duration: 600 });
      if (Math.round(map.getPitch()) !== pitch) map.setPitch(pitch);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [markers, fit]);

  // Fly to a focused point, only when focusKey changes.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !focus) return;
    map.flyTo({
      center: [focus.lng, focus.lat],
      zoom: focus.zoom ?? 13,
      pitch,
      duration: 1100,
      essential: true,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusKey]);

  const routeKey = JSON.stringify({ route, roadFrom, roadTo });

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
