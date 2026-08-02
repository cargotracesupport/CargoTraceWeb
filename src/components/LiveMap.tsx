"use client";

import GoogleLiveMap from "@/components/GoogleLiveMap";
import type { LiveMapProps } from "@/components/liveMapTypes";

export type { MapMarker } from "@/components/liveMapTypes";

/**
 * Reusable live map. Renders markers (truck / origin / destination) and, when a
 * direction is given, a solid by-road route line — via Google Maps. The Google
 * keys (NEXT_PUBLIC_GOOGLE_MAPS_KEY + NEXT_PUBLIC_GOOGLE_MAP_ID) are required.
 */
export default function LiveMap(props: LiveMapProps) {
  return <GoogleLiveMap {...props} />;
}
