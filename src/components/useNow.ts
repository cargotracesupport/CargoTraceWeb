import { useEffect, useState } from "react";

/**
 * A clock that ticks every `intervalMs`, so views that derive state from elapsed
 * time (e.g. "driver went offline") re-render even when no new data arrives.
 */
export function useNow(intervalMs = 30_000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(t);
  }, [intervalMs]);
  return now;
}
