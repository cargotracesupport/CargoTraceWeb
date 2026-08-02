"use client";

import { useEffect, useRef, useState } from "react";
import { loadGoogleMaps, GOOGLE_MAP_ID } from "@/lib/google";
import { roadRoute } from "@/lib/route";
import { makeMarkerEl, isValidLngLat } from "@/components/mapMarkers";
import type { LiveMapProps } from "@/components/liveMapTypes";

/* eslint-disable @typescript-eslint/no-explicit-any */

// Google Maps implementation of the shared LiveMap interface. Renders the
// truck / warehouse / lettered-stop markers, route polyline and camera
// behaviour for the live map. Requires the Google Maps key + Map ID.
export default function GoogleLiveMap({
  markers,
  route,
  roadFrom,
  roadTo,
  focus,
  focusKey,
  className,
  fit = true,
  pitch = 0,
}: LiveMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<any>(null);
  const gRef = useRef<any>(null); // google.maps namespace
  const markerObjs = useRef<Map<string, any>>(new Map());
  const polylineRef = useRef<any>(null);
  const [ready, setReady] = useState(0); // bumped once the map exists

  // Init the map once the SDK has loaded.
  useEffect(() => {
    let cancelled = false;
    loadGoogleMaps()
      .then((maps: any) => {
        if (cancelled || !containerRef.current || mapRef.current) return;
        gRef.current = maps;
        mapRef.current = new maps.Map(containerRef.current, {
          center: { lat: 14.5995, lng: 120.9842 },
          zoom: 11,
          mapId: GOOGLE_MAP_ID || undefined,
          tilt: pitch,
          disableDefaultUI: false,
          clickableIcons: false,
          zoomControl: true,
          fullscreenControl: false,
          streetViewControl: false,
          mapTypeControl: false,
        });
        setReady((n) => n + 1);
      })
      .catch(() => {
        /* SDK failed to load — the map stays blank; caller shows nothing */
      });
    return () => {
      cancelled = true;
      for (const [, obj] of markerObjs.current) detachMarker(obj);
      markerObjs.current.clear();
      polylineRef.current?.setMap?.(null);
      polylineRef.current = null;
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Sync markers + fit.
  useEffect(() => {
    const g = gRef.current;
    const map = mapRef.current;
    if (!g || !map) return;

    const valid = markers.filter((m) => isValidLngLat(m.lng, m.lat));
    const seen = new Set<string>();

    for (const m of valid) {
      seen.add(m.id);
      const pos = { lat: m.lat, lng: m.lng };
      let obj = markerObjs.current.get(m.id);
      if (!obj) {
        const Advanced = g.marker?.AdvancedMarkerElement;
        if (Advanced && GOOGLE_MAP_ID) {
          obj = new Advanced({ map, position: pos, content: makeMarkerEl(m) });
        } else {
          // No Map ID → classic marker; the letter goes in the marker label.
          obj = new g.Marker({
            map,
            position: pos,
            title: m.label,
            label: m.badge
              ? { text: m.badge, color: "#fff", fontWeight: "700" }
              : undefined,
          });
        }
        markerObjs.current.set(m.id, obj);
      } else if (typeof obj.setPosition === "function") {
        obj.setPosition(pos);
      } else {
        obj.position = pos;
      }
    }
    for (const [id, obj] of markerObjs.current) {
      if (!seen.has(id)) {
        detachMarker(obj);
        markerObjs.current.delete(id);
      }
    }

    if (fit && !focus && valid.length > 0) {
      const bounds = new g.LatLngBounds();
      valid.forEach((m) => bounds.extend({ lat: m.lat, lng: m.lng }));
      if (valid.length === 1) {
        map.setCenter({ lat: valid[0].lat, lng: valid[0].lng });
        map.setZoom(14);
      } else {
        map.fitBounds(bounds, 60);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [markers, fit, ready]);

  // Camera fly-to a focused point (e.g. a selected driver), only when the key changes.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !focus) return;
    map.panTo({ lat: focus.lat, lng: focus.lng });
    map.setZoom(focus.zoom ?? 13);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusKey, ready]);

  // Route line. roadFrom/roadTo → fetch the by-road path; else draw `route`.
  const routeKey = JSON.stringify({ route, roadFrom, roadTo });
  useEffect(() => {
    const g = gRef.current;
    const map = mapRef.current;
    if (!g || !map) return;
    let cancelled = false;

    (async () => {
      let coords: Array<[number, number]> | undefined = route;
      if (
        roadFrom &&
        roadTo &&
        isValidLngLat(roadFrom[0], roadFrom[1]) &&
        isValidLngLat(roadTo[0], roadTo[1])
      ) {
        coords = await roadRoute(roadFrom, roadTo);
      }
      if (cancelled) return;
      polylineRef.current?.setMap?.(null);
      polylineRef.current = null;
      const valid = (coords ?? []).filter(([lng, lat]) =>
        isValidLngLat(lng, lat),
      );
      if (valid.length < 2) return;
      polylineRef.current = new g.Polyline({
        map,
        path: valid.map(([lng, lat]) => ({ lat, lng })),
        strokeColor: "#2f9bd1",
        strokeOpacity: 0.9,
        strokeWeight: 4,
      });
    })();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [routeKey, ready]);

  return (
    <div
      ref={containerRef}
      className={className}
      style={{ width: "100%", height: "100%" }}
    />
  );
}

// Remove a marker from the map, whether it's an AdvancedMarkerElement (map=null)
// or a classic Marker (setMap(null)).
function detachMarker(obj: any) {
  if (obj && typeof obj.setMap === "function") obj.setMap(null);
  else if (obj) obj.map = null;
}
