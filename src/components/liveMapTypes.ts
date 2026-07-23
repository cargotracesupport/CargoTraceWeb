// Shared shape for the map component, implemented by both the MapLibre map (free
// default) and the Google Maps map (when a Google key is configured).

export interface MapMarker {
  id: string;
  lng: number;
  lat: number;
  label?: string;
  kind?: "truck" | "origin" | "dest";
  /** Optional letter/number shown on the marker (e.g. stop order A, B, C). */
  badge?: string;
}

export interface LiveMapProps {
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
  /** Camera tilt. 0 = flat/top-down (default); higher tilts into a 3D view. */
  pitch?: number;
}
