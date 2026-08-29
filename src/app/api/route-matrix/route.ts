import { NextResponse } from "next/server";
import { getSessionProfile } from "@/lib/auth";

export const dynamic = "force-dynamic";

// N×N driving-time matrix (seconds) among points, for same-route grouping.
// This intentionally stays on OSRM even when Google is configured: a matrix is
// N×N elements (grouping passes up to ~90 points → thousands of elements) and
// Google bills per element, while grouping doesn't need live traffic. Google is
// used for the user-facing routes/ETAs (see /api/route) where it's worth it.
//
// Response: { durations: number[][] } — durations[i][j] in seconds.

type LngLat = [number, number];

const MAX_POINTS = 90; // OSRM /table demo cap is ~100.
// OSRM snaps each point to the nearest road; a point snapped farther than this
// from its real location has fictitious durations and is dropped from grouping.
const SNAP_MAX_M = 5000;

const cache = new Map<string, number[][]>();
const keyOf = (pts: LngLat[]) =>
  pts.map((p) => `${p[0].toFixed(5)},${p[1].toFixed(5)}`).join(";");

function validPoints(v: unknown): v is LngLat[] {
  return (
    Array.isArray(v) &&
    v.length >= 2 &&
    v.length <= MAX_POINTS &&
    v.every(
      (p) =>
        Array.isArray(p) &&
        p.length === 2 &&
        Number.isFinite(p[0]) &&
        Number.isFinite(p[1]) &&
        Math.abs(p[1]) <= 90 &&
        Math.abs(p[0]) <= 180,
    )
  );
}

export async function POST(req: Request) {
  // Both callers (agent dispatch board, driver trip list) are behind a login,
  // so require a session — this endpoint hits OSRM and must not be an open proxy.
  if (!(await getSessionProfile())) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  let body: { points?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON" }, { status: 400 });
  }
  const pts = body.points;
  if (!validPoints(pts)) {
    return NextResponse.json({ error: "invalid points" }, { status: 400 });
  }

  const key = keyOf(pts);
  const cached = cache.get(key);
  if (cached) {
    return NextResponse.json(
      { durations: cached },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  }

  try {
    const coordStr = pts.map((p) => `${p[0]},${p[1]}`).join(";");
    const url = `https://router.project-osrm.org/table/v1/driving/${coordStr}?annotations=duration`;
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) {
      return NextResponse.json(
        { error: "routing unavailable" },
        { status: 502 },
      );
    }
    const json = (await res.json()) as {
      durations?: (number | null)[][];
      sources?: { distance?: number }[];
    };
    const d = json.durations;
    if (!Array.isArray(d) || d.length !== pts.length) {
      return NextResponse.json(
        { error: "routing unavailable" },
        { status: 502 },
      );
    }
    // Points OSRM snapped far from their real location produce fictitious
    // durations (a Kannur drop-off snapped onto a Kozhikode road looks "on the
    // way"). Mark them unreachable (-1) so grouping never folds them into another
    // driver's trip; they'll simply get their own route.
    const snapped = json.sources ?? [];
    const bad = pts.map((_p, i) => {
      const dist = snapped[i]?.distance;
      return typeof dist === "number" && dist > SNAP_MAX_M;
    });
    const clean = d.map((row, i) =>
      row.map((v, j) => (bad[i] || bad[j] || v == null ? -1 : v)),
    );
    if (cache.size > 200) cache.clear();
    cache.set(key, clean);
    return NextResponse.json(
      { durations: clean },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch {
    return NextResponse.json({ error: "routing unavailable" }, { status: 502 });
  }
}
