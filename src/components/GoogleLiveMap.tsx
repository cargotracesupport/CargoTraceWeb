"use client";

import { useEffect, useRef, useState } from "react";
import { loadGoogleMaps, GOOGLE_MAP_ID } from "@/lib/google";
import { roadRoute } from "@/lib/route";
import {
  markerIcon,
  svgToDataUri,
  iconKey,
  isValidLngLat,
} from "@/components/mapMarkers";
import type { LiveMapProps } from "@/components/liveMapTypes";

/* eslint-disable @typescript-eslint/no-explicit-any */

// Colours for the route line. The part already travelled (behind the vehicle)
// is drawn grey; the part still ahead stays blue.
const ROUTE_AHEAD = "#2f9bd1";
const ROUTE_PAST = "#6b7685";

// "You are here" blue dot (Google-style) for the current-location button.
const YOU_DOT =
  '<svg xmlns="http://www.w3.org/2000/svg" width="26" height="26" viewBox="0 0 26 26">' +
  '<circle cx="13" cy="13" r="12" fill="#4285F4" fill-opacity="0.18"/>' +
  '<circle cx="13" cy="13" r="6.5" fill="#4285F4" stroke="#fff" stroke-width="3"/>' +
  "</svg>";

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
  routeToken,
}: LiveMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<any>(null);
  const gRef = useRef<any>(null); // google.maps namespace
  const markerObjs = useRef<Map<string, any>>(new Map());
  const polylinesRef = useRef<any[]>([]); // [past(grey), ahead(blue)]
  const youMarkerRef = useRef<any>(null); // current-location dot
  // Once the user explicitly recenters on themselves, stop auto-fitting so the
  // next position poll doesn't yank the camera back to the whole-route bounds.
  const userMovedRef = useRef(false);
  const [ready, setReady] = useState(0); // bumped once the map exists
  const [locating, setLocating] = useState(false);

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
      for (const p of polylinesRef.current) p?.setMap?.(null);
      polylinesRef.current = [];
      youMarkerRef.current?.setMap?.(null);
      youMarkerRef.current = null;
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
      const spec = markerIcon(m);
      const icon = {
        url: svgToDataUri(spec.svg),
        scaledSize: new g.Size(spec.w, spec.h),
        anchor: new g.Point(spec.ax, spec.ay),
      };
      const key = iconKey(m);
      let obj = markerObjs.current.get(m.id);
      if (!obj) {
        // Classic Marker renders on any map (no Vector Map ID needed).
        obj = new g.Marker({ map, position: pos, icon, title: m.label });
        obj.__iconKey = key;
        markerObjs.current.set(m.id, obj);
      } else {
        obj.setPosition(pos);
        if (obj.__iconKey !== key) {
          obj.setIcon(icon);
          obj.__iconKey = key;
        }
      }
    }
    for (const [id, obj] of markerObjs.current) {
      if (!seen.has(id)) {
        detachMarker(obj);
        markerObjs.current.delete(id);
      }
    }

    if (fit && !focus && !userMovedRef.current && valid.length > 0) {
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

  // ── Route line ──────────────────────────────────────────
  // Resolve the path once (roadFrom/roadTo → fetch the by-road path; else the
  // given `route`). The split into past/ahead is done in the draw effect below,
  // so it re-splits as the vehicle moves without re-fetching the route.
  const routeKey = JSON.stringify({ route, roadFrom, roadTo });
  const [routeCoords, setRouteCoords] = useState<Array<[number, number]> | null>(
    null,
  );
  useEffect(() => {
    const g = gRef.current;
    if (!g) return;
    let cancelled = false;
    (async () => {
      let coords: Array<[number, number]> | undefined = route;
      if (
        roadFrom &&
        roadTo &&
        isValidLngLat(roadFrom[0], roadFrom[1]) &&
        isValidLngLat(roadTo[0], roadTo[1])
      ) {
        coords = await roadRoute(roadFrom, roadTo, routeToken);
      }
      if (!cancelled) setRouteCoords(coords ?? null);
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [routeKey, ready]);

  // Draw the route split at the vehicle: behind it grey, ahead of it blue. The
  // vehicle is the truck marker's position (if any); with no truck the whole
  // line is drawn blue.
  const truck = markers.find((m) => m.kind === "truck");
  const truckLat = truck && isValidLngLat(truck.lng, truck.lat) ? truck.lat : null;
  const truckLng = truck && isValidLngLat(truck.lng, truck.lat) ? truck.lng : null;
  const truckKey =
    truckLat != null ? `${truckLat.toFixed(5)},${truckLng!.toFixed(5)}` : "";
  useEffect(() => {
    const g = gRef.current;
    const map = mapRef.current;
    if (!g || !map) return;

    for (const p of polylinesRef.current) p?.setMap?.(null);
    polylinesRef.current = [];

    const valid = (routeCoords ?? []).filter(([lng, lat]) =>
      isValidLngLat(lng, lat),
    );
    if (valid.length < 2) return;

    const { past, ahead } =
      truckLat != null
        ? splitRoute(valid, truckLat, truckLng as number)
        : { past: [] as Array<[number, number]>, ahead: valid };

    const line = (
      pts: Array<[number, number]>,
      color: string,
      opacity: number,
      weight: number,
      zIndex: number,
    ) =>
      new g.Polyline({
        map,
        path: pts.map(([lng, lat]) => ({ lat, lng })),
        strokeColor: color,
        strokeOpacity: opacity,
        strokeWeight: weight,
        zIndex,
      });

    // Traveled (behind the vehicle) = solid grey; road ahead = bold blue on top.
    if (past.length >= 2)
      polylinesRef.current.push(line(past, ROUTE_PAST, 0.95, 6, 1));
    if (ahead.length >= 2)
      polylinesRef.current.push(line(ahead, ROUTE_AHEAD, 1, 6, 2));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [routeCoords, truckKey, ready]);

  // Recenter the map on the user's own device location.
  function locateMe() {
    if (typeof navigator === "undefined" || !navigator.geolocation) return;
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (p) => {
        setLocating(false);
        const g = gRef.current;
        const map = mapRef.current;
        if (!g || !map) return;
        const at = { lat: p.coords.latitude, lng: p.coords.longitude };
        userMovedRef.current = true; // stop auto-fit fighting the recenter
        map.panTo(at);
        map.setZoom(Math.max(map.getZoom?.() ?? 15, 15));
        if (!youMarkerRef.current) {
          youMarkerRef.current = new g.Marker({
            map,
            position: at,
            title: "Your location",
            zIndex: 9999,
            icon: {
              url: svgToDataUri(YOU_DOT),
              scaledSize: new g.Size(26, 26),
              anchor: new g.Point(13, 13),
            },
          });
        } else {
          youMarkerRef.current.setPosition(at);
          youMarkerRef.current.setMap(map);
        }
      },
      () => setLocating(false), // denied / unavailable — silently no-op
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 10000 },
    );
  }

  return (
    <div className={className} style={{ position: "relative", width: "100%", height: "100%" }}>
      <div ref={containerRef} style={{ width: "100%", height: "100%" }} />
      <button
        type="button"
        onClick={locateMe}
        disabled={locating}
        aria-label="Show my location"
        title="Show my location"
        className="absolute left-3 top-3 z-[2] inline-flex h-9 w-9 items-center justify-center rounded-lg border border-border2 bg-s1/95 text-muted2 shadow-sm backdrop-blur transition-colors hover:text-primary disabled:opacity-60"
      >
        {locating ? (
          <svg
            viewBox="0 0 24 24"
            width="18"
            height="18"
            className="animate-spin"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            aria-hidden
          >
            <path d="M21 12a9 9 0 1 1-6.22-8.56" strokeLinecap="round" />
          </svg>
        ) : (
          <svg
            viewBox="0 0 24 24"
            width="18"
            height="18"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden
          >
            <circle cx="12" cy="12" r="7" />
            <line x1="12" y1="1" x2="12" y2="4" />
            <line x1="12" y1="20" x2="12" y2="23" />
            <line x1="1" y1="12" x2="4" y2="12" />
            <line x1="20" y1="12" x2="23" y2="12" />
            <circle cx="12" cy="12" r="2.4" fill="currentColor" stroke="none" />
          </svg>
        )}
      </button>
    </div>
  );
}

// Split a route at the point nearest the vehicle: everything up to that point is
// "past" (behind the vehicle), the rest is "ahead". The split vertex is shared
// by both so the grey and blue lines join without a gap.
function splitRoute(
  coords: Array<[number, number]>,
  lat: number,
  lng: number,
): { past: Array<[number, number]>; ahead: Array<[number, number]> } {
  let bestI = 0;
  let bestD = Infinity;
  for (let i = 0; i < coords.length; i++) {
    const dLng = coords[i][0] - lng;
    const dLat = coords[i][1] - lat;
    const d = dLng * dLng + dLat * dLat;
    if (d < bestD) {
      bestD = d;
      bestI = i;
    }
  }
  return { past: coords.slice(0, bestI + 1), ahead: coords.slice(bestI) };
}

// Remove a marker from the map, whether it's an AdvancedMarkerElement (map=null)
// or a classic Marker (setMap(null)).
function detachMarker(obj: any) {
  if (obj && typeof obj.setMap === "function") obj.setMap(null);
  else if (obj) obj.map = null;
}
