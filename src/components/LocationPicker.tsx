"use client";

import { useEffect, useRef, useState } from "react";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { mapStyleUrl } from "@/lib/maptiler";

export type LatLng = { lat: number; lng: number };
type Which = "origin" | "dest";

const COLOR: Record<Which, string> = { origin: "#40c4ff", dest: "#ffb74d" };

interface GeoResult {
  id: string;
  place_name: string;
  lat: number;
  lng: number;
}

/**
 * Map-based location picker. Click the map to place the active pin (pickup A or
 * drop-off B), drag a pin to adjust, or search a place by name. Reports changes
 * up via onPick so the form's coordinate state stays the source of truth.
 */
export default function LocationPicker({
  origin,
  dest,
  onPick,
}: {
  origin: LatLng | null;
  dest: LatLng | null;
  onPick: (which: Which, p: { lat: number; lng: number; label?: string }) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const markersRef = useRef<Partial<Record<Which, maplibregl.Marker>>>({});
  const activeRef = useRef<Which>("origin");
  const onPickRef = useRef(onPick);
  onPickRef.current = onPick;

  const [active, setActive] = useState<Which>("origin");
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<GeoResult[]>([]);
  const [searching, setSearching] = useState(false);

  useEffect(() => {
    activeRef.current = active;
  }, [active]);

  // init map once
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    const map = new maplibregl.Map({
      container: containerRef.current,
      style: mapStyleUrl(),
      center: [120.9842, 14.5995],
      zoom: 10,
      attributionControl: false,
    });
    map.addControl(
      new maplibregl.NavigationControl({ showCompass: false }),
      "top-right",
    );
    map.on("click", (e) => {
      onPickRef.current(activeRef.current, {
        lat: e.lngLat.lat,
        lng: e.lngLat.lng,
      });
    });
    mapRef.current = map;
    return () => {
      map.remove();
      mapRef.current = null;
      markersRef.current = {};
    };
  }, []);

  // sync markers from props
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const points: Record<Which, LatLng | null> = { origin, dest };

    (["origin", "dest"] as Which[]).forEach((which) => {
      const p = points[which];
      const existing = markersRef.current[which];
      if (!p) {
        if (existing) {
          existing.remove();
          delete markersRef.current[which];
        }
        return;
      }
      if (existing) {
        existing.setLngLat([p.lng, p.lat]);
      } else {
        const el = document.createElement("div");
        el.style.cssText = `width:18px;height:18px;border-radius:50%;border:3px solid #fff;background:${COLOR[which]};box-shadow:0 0 0 4px ${COLOR[which]}33;cursor:grab;`;
        const m = new maplibregl.Marker({ element: el, draggable: true })
          .setLngLat([p.lng, p.lat])
          .addTo(map);
        m.on("dragend", () => {
          const ll = m.getLngLat();
          onPickRef.current(which, { lat: ll.lat, lng: ll.lng });
        });
        markersRef.current[which] = m;
      }
    });

    // keep both pins in view
    const present = [origin, dest].filter((p): p is LatLng => p != null);
    if (present.length === 1) {
      map.easeTo({ center: [present[0].lng, present[0].lat], duration: 400 });
    } else if (present.length === 2) {
      const b = new maplibregl.LngLatBounds();
      present.forEach((p) => b.extend([p.lng, p.lat]));
      map.fitBounds(b, { padding: 70, maxZoom: 14, duration: 400 });
    }
  }, [origin, dest]);

  async function runSearch() {
    const key = process.env.NEXT_PUBLIC_MAPTILER_KEY;
    const q = query.trim();
    if (!q) return;
    if (!key) {
      setResults([]);
      return;
    }
    setSearching(true);
    try {
      const res = await fetch(
        `https://api.maptiler.com/geocoding/${encodeURIComponent(q)}.json?key=${key}&limit=5`,
      );
      const json = await res.json();
      const feats = Array.isArray(json.features) ? json.features : [];
      setResults(
        feats.map((f: { id: string; place_name: string; center: [number, number] }) => ({
          id: f.id,
          place_name: f.place_name,
          lng: f.center[0],
          lat: f.center[1],
        })),
      );
    } catch {
      setResults([]);
    } finally {
      setSearching(false);
    }
  }

  function chooseResult(r: GeoResult) {
    onPickRef.current(active, { lat: r.lat, lng: r.lng, label: r.place_name });
    setResults([]);
    setQuery("");
    mapRef.current?.flyTo({ center: [r.lng, r.lat], zoom: 13 });
  }

  const activeLabel = active === "origin" ? "pickup (A)" : "drop-off (B)";

  return (
    <div className="flex flex-col gap-3">
      {/* which pin am I placing */}
      <div className="grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={() => setActive("origin")}
          className={`ct-btn px-3 py-2 text-xs ${active === "origin" ? "bg-blue/15 text-blue border border-blue/50" : "ct-btn-ghost"}`}
        >
          📍 Set pickup (A)
        </button>
        <button
          type="button"
          onClick={() => setActive("dest")}
          className={`ct-btn px-3 py-2 text-xs ${active === "dest" ? "bg-amber/15 text-amber border border-amber/50" : "ct-btn-ghost"}`}
        >
          🏁 Set drop-off (B)
        </button>
      </div>

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
            {searching ? "…" : "Search"}
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
