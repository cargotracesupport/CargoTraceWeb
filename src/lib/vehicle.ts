// Vehicle dimension/capacity formatting, shared across every place a vehicle is
// shown (fleet, assignment, delivery detail, driver view).

type Dims = {
  length_m?: number | null;
  width_m?: number | null;
  capacity_kg?: number | null;
};

function num(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(1);
}

/**
 * Compact specs string, e.g. "4.2 × 1.8 m · 1,200 kg". Missing parts are
 * omitted; returns null when nothing is set (so callers can skip rendering).
 */
export function formatVehicleSpecs(v: Dims | null | undefined): string | null {
  if (!v) return null;
  const parts: string[] = [];
  if (v.length_m != null && v.width_m != null) {
    parts.push(`${num(v.length_m)} × ${num(v.width_m)} m`);
  } else if (v.length_m != null) {
    parts.push(`L ${num(v.length_m)} m`);
  } else if (v.width_m != null) {
    parts.push(`W ${num(v.width_m)} m`);
  }
  if (v.capacity_kg != null) {
    parts.push(`${Math.round(v.capacity_kg).toLocaleString()} kg`);
  }
  return parts.length ? parts.join(" · ") : null;
}
