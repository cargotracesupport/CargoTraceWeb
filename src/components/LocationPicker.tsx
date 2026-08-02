"use client";

import { useEffect, useRef, useState } from "react";
import { loadGoogleMaps, GOOGLE_MAP_ID } from "@/lib/google";
import { MapPin, Flag, Search } from "@/components/icons";

/* eslint-disable @typescript-eslint/no-explicit-any */

export type LatLng = { lat: number; lng: number };
type Which = "origin" | "dest";

const COLOR: Record<Which, string> = { origin: "#40c4ff", dest: "#ffb74d" };

interface GeoResult {
  id: string;
  place_name: string;
  lat: number;
  lng: number;
}

/** A draggable colored dot used as the pin content. */
function dotEl(color: string): HTMLElement {
  const el = document.createElement("div");
  el.style.cssText = `width:18px;height:18px;border-radius:50%;border:3px solid #fff;background:${color};box-shadow:0 0 0 4px ${color}33;cursor:grab;`;
  return el;
}

function detach(obj: any) {
  if (!obj) return;
  if (typeof obj.setMap === "function") obj.setMap(null);
  else obj.map = null;
}

/**
 * Map-based location picker (Google Maps). Click the map to place the active pin
 * (pickup A or drop-off B), drag a pin to adjust, or search a place by name.
 * Reports changes up via onPick so the form's coordinate state stays the source
 * of truth. Address search uses the Google Geocoding API.
 */
export default function LocationPicker({
  origin,
  dest,
  onPick,
  mode = "both",
}: {
  origin: LatLng | null;
  dest: LatLng | null;
  onPick: (which: Which, p: { lat: number; lng: number; label?: string }) => void;
  // "both" = pickup + drop-off; "origin"/"dest" = a single pin.
  mode?: "both" | "origin" | "dest";
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<any>(null);
  const gRef = useRef<any>(null); // google.maps namespace
  const geocoderRef = useRef<any>(null);
  const markersRef = useRef<Partial<Record<Which, any>>>({});
  const [ready, setReady] = useState(0); // bumped once the map exists

  const initial: Which = mode === "dest" ? "dest" : "origin";
  const activeRef = useRef<Which>(initial);
  const onPickRef = useRef(onPick);
  onPickRef.current = onPick;

  const [active, setActive] = useState<Which>(initial);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<GeoResult[]>([]);
  const [searching, setSearching] = useState(false);

  useEffect(() => {
    activeRef.current = active;
  }, [active]);

  // init map once (async — the Google SDK loads on demand)
  useEffect(() => {
    let cancelled = false;
    loadGoogleMaps()
      .then((maps: any) => {
        if (cancelled || !containerRef.current || mapRef.current) return;
        gRef.current = maps;
        geocoderRef.current = new maps.Geocoder();
        const map = new maps.Map(containerRef.current, {
          center: { lat: 14.5995, lng: 120.9842 },
          zoom: 10,
          mapId: GOOGLE_MAP_ID || undefined,
          disableDefaultUI: false,
          clickableIcons: false,
          zoomControl: true,
          fullscreenControl: false,
          streetViewControl: false,
          mapTypeControl: false,
        });
        map.addListener("click", (e: any) => {
          if (!e.latLng) return;
          onPickRef.current(activeRef.current, {
            lat: e.latLng.lat(),
            lng: e.latLng.lng(),
          });
        });
        mapRef.current = map;
        setReady((n) => n + 1);
      })
      .catch(() => {
        /* SDK failed to load — the map stays blank */
      });
    return () => {
      cancelled = true;
      (["origin", "dest"] as Which[]).forEach((w) => detach(markersRef.current[w]));
      markersRef.current = {};
      mapRef.current = null;
    };
  }, []);

  // sync markers from props
  useEffect(() => {
    const g = gRef.current;
    const map = mapRef.current;
    if (!g || !map) return;
    const points: Record<Which, LatLng | null> = { origin, dest };

    (["origin", "dest"] as Which[]).forEach((which) => {
      const p = points[which];
      const existing = markersRef.current[which];
      if (!p) {
        if (existing) {
          detach(existing);
          delete markersRef.current[which];
        }
        return;
      }
      const pos = { lat: p.lat, lng: p.lng };
      if (existing) {
        if (typeof existing.setPosition === "function") existing.setPosition(pos);
        else existing.position = pos;
        return;
      }
      const Advanced = g.marker?.AdvancedMarkerElement;
      let m: any;
      if (Advanced && GOOGLE_MAP_ID) {
        m = new Advanced({
          map,
          position: pos,
          content: dotEl(COLOR[which]),
          gmpDraggable: true,
        });
        m.addListener("dragend", () => {
          const q = m.position;
          if (!q) return;
          const lat = typeof q.lat === "function" ? q.lat() : q.lat;
          const lng = typeof q.lng === "function" ? q.lng() : q.lng;
          onPickRef.current(which, { lat, lng });
        });
      } else {
        m = new g.Marker({ map, position: pos, draggable: true });
        m.addListener("dragend", (e: any) => {
          if (!e.latLng) return;
          onPickRef.current(which, { lat: e.latLng.lat(), lng: e.latLng.lng() });
        });
      }
      markersRef.current[which] = m;
    });

    // keep pins in view
    const present = [origin, dest].filter((p): p is LatLng => p != null);
    if (present.length === 1) {
      map.panTo({ lat: present[0].lat, lng: present[0].lng });
    } else if (present.length === 2) {
      const b = new g.LatLngBounds();
      present.forEach((p) => b.extend({ lat: p.lat, lng: p.lng }));
      map.fitBounds(b, 70);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [origin, dest, ready]);

  async function runSearch() {
    const q = query.trim();
    const geocoder = geocoderRef.current;
    if (!q || !geocoder) return;
    setSearching(true);
    try {
      const { results: res } = await geocoder.geocode({ address: q });
      setResults(
        (res ?? []).slice(0, 5).map((r: any, i: number) => ({
          id: r.place_id ?? String(i),
          place_name: r.formatted_address,
          lat: r.geometry.location.lat(),
          lng: r.geometry.location.lng(),
        })),
      );
    } catch {
      // ZERO_RESULTS / request denied → clear the list
      setResults([]);
    } finally {
      setSearching(false);
    }
  }

  function chooseResult(r: GeoResult) {
    onPickRef.current(active, { lat: r.lat, lng: r.lng, label: r.place_name });
    setResults([]);
    setQuery("");
    const map = mapRef.current;
    if (map) {
      map.panTo({ lat: r.lat, lng: r.lng });
      map.setZoom(13);
    }
  }

  const activeLabel = active === "origin" ? "pickup (A)" : "drop-off (B)";

  return (
    <div className="flex flex-col gap-3">
      {/* which pin am I placing */}
      {mode === "both" ? (
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => setActive("origin")}
            className={`ct-btn px-3 py-2 text-xs ${active === "origin" ? "bg-blue/15 text-blue border border-blue/50" : "ct-btn-ghost"}`}
          >
            <MapPin className="h-3.5 w-3.5" /> Set pickup (A)
          </button>
          <button
            type="button"
            onClick={() => setActive("dest")}
            className={`ct-btn px-3 py-2 text-xs ${active === "dest" ? "bg-amber/15 text-amber border border-amber/50" : "ct-btn-ghost"}`}
          >
            <Flag className="h-3.5 w-3.5" /> Set drop-off (B)
          </button>
        </div>
      ) : null}

      {/* place search */}
      <div className="relative">
        <div className="flex gap-2">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                runSearch();
              }
            }}
            placeholder={`Search a place for ${activeLabel}…`}
            className="ct-input"
          />
          <button
            type="button"
            onClick={runSearch}
            disabled={searching}
            className="ct-btn-ghost shrink-0"
          >
            {searching ? (
              "…"
            ) : (
              <>
                <Search className="h-4 w-4" /> Search
              </>
            )}
          </button>
        </div>
        {results.length > 0 && (
          <ul className="absolute z-20 mt-1 w-full overflow-hidden rounded-md border border-border2 bg-s2 shadow-xl">
            {results.map((r) => (
              <li key={r.id}>
                <button
                  type="button"
                  onClick={() => chooseResult(r)}
                  className="block w-full truncate px-3 py-2 text-left text-sm hover:bg-s3"
                >
                  {r.place_name}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* the map */}
      <div className="h-[320px] overflow-hidden rounded-lg border border-border">
        <div ref={containerRef} style={{ width: "100%", height: "100%" }} />
      </div>

      <p className="text-xs text-muted">
        Click the map to drop the{" "}
        <span style={{ color: COLOR[active] }}>{activeLabel}</span> pin, drag a pin
        to fine-tune, or search a place above.
      </p>
    </div>
  );
}
