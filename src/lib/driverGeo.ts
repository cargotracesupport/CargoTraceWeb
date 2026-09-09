// Driver live-location watcher with two runtime backends:
//
//  • Normal browser  → the standard Geolocation API (watchPosition). Foreground
//    only — pauses when the tab is backgrounded or the screen locks. This is the
//    web behaviour and is unchanged.
//  • Capacitor Android shell → the native @capacitor-community/background-geolocation
//    plugin (a foreground service) which keeps streaming GPS even when the driver
//    switches to Google Maps or locks the screen.
//
// The native plugin is reached through the global Capacitor bridge
// (window.Capacitor) rather than an npm import, so the web app has NO build-time
// dependency on Capacitor — it stays a plain web app that simply upgrades itself
// to background tracking when it happens to run inside the Android shell.

export interface DriverFix {
  lat: number;
  lng: number;
  /** Ground speed in km/h, or null when unknown. */
  speed: number | null;
  /** Heading in degrees, or null when unknown. */
  heading: number | null;
  /** ISO timestamp of the fix. */
  at: string;
}

export interface DriverWatch {
  stop: () => void;
}

export interface DriverGeoError {
  /** The user blocked/denied location permission. */
  denied: boolean;
  message?: string;
}

/* eslint-disable @typescript-eslint/no-explicit-any */

function cap(): any {
  return typeof window !== "undefined" ? (window as any).Capacitor : undefined;
}

/** True when running inside the native Capacitor shell (Android/iOS). */
export function isNativeTracking(): boolean {
  return !!cap()?.isNativePlatform?.();
}

// Web backend — the exact behaviour the driver screen has always had.
function watchWeb(
  onFix: (f: DriverFix) => void,
  onError: (e: DriverGeoError) => void,
): DriverWatch {
  if (typeof navigator === "undefined" || !("geolocation" in navigator)) {
    onError({ denied: false, message: "Location is not available on this device." });
    return { stop: () => {} };
  }
  const id = navigator.geolocation.watchPosition(
    (p) =>
      onFix({
        lat: p.coords.latitude,
        lng: p.coords.longitude,
        speed: p.coords.speed != null ? p.coords.speed * 3.6 : null,
        heading: p.coords.heading,
        at: new Date(p.timestamp).toISOString(),
      }),
    (err) =>
      onError({
        denied: err.code === err.PERMISSION_DENIED,
        message: err.message,
      }),
    { enableHighAccuracy: true, maximumAge: 5000, timeout: 20000 },
  );
  return { stop: () => navigator.geolocation.clearWatch(id) };
}

// Native backend — background-geolocation foreground service via the bridge.
function watchNative(
  onFix: (f: DriverFix) => void,
  onError: (e: DriverGeoError) => void,
): DriverWatch {
  const BG = cap()?.Plugins?.BackgroundGeolocation;
  if (!BG?.addWatcher) return watchWeb(onFix, onError); // safety net

  let watcherId: string | null = null;
  let stopped = false;

  const p = BG.addWatcher(
    {
      // Text shown in the persistent notification while tracking in background.
      backgroundTitle: "Goodswala is tracking your delivery",
      backgroundMessage: "Sharing your live location with the customer.",
      requestPermissions: true,
      stale: false,
      distanceFilter: 20, // metres between updates
    },
    (location: any, error: any) => {
      if (error) {
        onError({
          denied: error.code === "NOT_AUTHORIZED",
          message: error.message,
        });
        return;
      }
      if (!location) return;
      onFix({
        lat: location.latitude,
        lng: location.longitude,
        speed: location.speed != null ? location.speed * 3.6 : null,
        heading: location.bearing ?? null,
        at:
          location.time != null
            ? new Date(location.time).toISOString()
            : new Date().toISOString(),
      });
    },
  );

  Promise.resolve(p)
    .then((id: string) => {
      watcherId = id;
      // stop() may have been called before the id resolved — honour it now.
      if (stopped && id) BG.removeWatcher({ id });
    })
    .catch(() => {});

  return {
    stop: () => {
      stopped = true;
      if (watcherId) BG.removeWatcher({ id: watcherId });
    },
  };
}

/**
 * Start watching the driver's location. Uses the native background service when
 * available, else the browser Geolocation API. Returns a handle whose stop()
 * ends the watch.
 */
export function watchDriver(
  onFix: (f: DriverFix) => void,
  onError: (e: DriverGeoError) => void,
): DriverWatch {
  return isNativeTracking() ? watchNative(onFix, onError) : watchWeb(onFix, onError);
}
