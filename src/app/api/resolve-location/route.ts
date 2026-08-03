import { NextResponse } from "next/server";
import {
  parseCoords,
  extractUrl,
  coordsFromMapsText,
  isAllowedMapsHost,
} from "@/lib/location";

export const dynamic = "force-dynamic";

/**
 * Resolve a pasted location to coordinates:
 *  - raw "lat, lng"
 *  - a Google Maps URL that already contains coordinates
 *  - a short share link (maps.app.goo.gl / goo.gl) → followed server-side to the
 *    real URL, then coordinates extracted from it (or its page).
 *
 * POST { input } → { ok, lat, lng } | { error }. Only Google/Maps hosts are
 * fetched (SSRF guard); no auth needed (also used by the public drop-off page).
 */
export async function POST(req: Request) {
  let body: { input?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON" }, { status: 400 });
  }
  const input = typeof body.input === "string" ? body.input.trim() : "";
  if (!input) return NextResponse.json({ error: "empty" }, { status: 400 });

  // 1. raw coordinates
  const coords = parseCoords(input);
  if (coords) return NextResponse.json({ ok: true, ...coords });

  // 2. a URL
  const url = extractUrl(input);
  if (!url) {
    return NextResponse.json(
      { error: "no link or coordinates found" },
      { status: 422 },
    );
  }

  // coordinates already present in the pasted URL?
  const direct = coordsFromMapsText(url);
  if (direct) return NextResponse.json({ ok: true, ...direct });

  // 3. follow the (short) link — Google/Maps hosts only.
  if (!isAllowedMapsHost(url)) {
    return NextResponse.json(
      { error: "only Google Maps links are supported" },
      { status: 422 },
    );
  }
  try {
    const res = await fetch(url, {
      redirect: "follow",
      headers: { "User-Agent": "Mozilla/5.0 (compatible; CargoTrace/1.0)" },
      cache: "no-store",
    });
    // coordinates in the final URL after the redirect(s)?
    const fromFinal = coordsFromMapsText(res.url);
    if (fromFinal) return NextResponse.json({ ok: true, ...fromFinal });
    // else scan the returned page.
    const text = await res.text();
    const fromBody = coordsFromMapsText(text);
    if (fromBody) return NextResponse.json({ ok: true, ...fromBody });
  } catch {
    /* fetch failed / blocked */
  }
  return NextResponse.json(
    { error: "couldn't read that link" },
    { status: 422 },
  );
}
