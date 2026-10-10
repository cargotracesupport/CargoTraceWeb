import { NextResponse } from "next/server";
import {
  parseCoords,
  extractUrl,
  coordsFromMapsText,
  isAllowedMapsHost,
} from "@/lib/location";
import { createAdminClient } from "@/lib/supabase/admin";
import { clientIpFrom } from "@/lib/tracking";

export const dynamic = "force-dynamic";

// Public endpoint; cap abuse to 30 hits per client IP per minute so it can't
// be looped to churn our function slots (each call may fetch a remote page).
const RL_LIMIT = 30;
const RL_WINDOW_S = 60;

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

  // Per client IP (IPv6 by /64). Fails closed if the limiter errors.
  const ip = clientIpFrom(req.headers);
  const admin = createAdminClient();
  const { data: allowed, error: rlErr } = await admin.rpc("rate_limit_hit", {
    p_key: `resolveloc:${ip}`,
    p_limit: RL_LIMIT,
    p_window_seconds: RL_WINDOW_S,
  });
  if (rlErr || allowed !== true) {
    return NextResponse.json(
      { error: "rate limited" },
      { status: 429, headers: { "Retry-After": String(RL_WINDOW_S) } },
    );
  }

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
  // Hard limits on the outbound fetch: an attacker-influenced URL (Google
  // Maps short link chain) must not hang the function slot or stream MB of
  // HTML. 8 s cap on the whole request, 512 KB cap on the read body.
  // Redirects are followed by hand so every hop is re-checked against the
  // host allow-list; with redirect: "follow" an allowed first hop could
  // bounce the fetch to any internal or third-party address.
  const FETCH_TIMEOUT_MS = 8000;
  const MAX_BYTES = 512 * 1024;
  const MAX_HOPS = 5;
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), FETCH_TIMEOUT_MS);
  try {
    let current = url;
    let res: Response | null = null;
    for (let hop = 0; hop <= MAX_HOPS; hop++) {
      if (!isAllowedMapsHost(current)) break;
      // coordinates in this hop's URL?
      const fromUrl = coordsFromMapsText(current);
      if (fromUrl) return NextResponse.json({ ok: true, ...fromUrl });
      const r = await fetch(current, {
        redirect: "manual",
        headers: { "User-Agent": "Mozilla/5.0 (compatible; Goodswala/1.0)" },
        cache: "no-store",
        signal: ac.signal,
      });
      const next =
        r.status >= 300 && r.status < 400 ? r.headers.get("location") : null;
      if (next) {
        try {
          await r.body?.cancel();
        } catch {
          /* ignore */
        }
        current = new URL(next, current).toString();
        continue;
      }
      res = r;
      break;
    }
    if (!res) {
      return NextResponse.json(
        { error: "couldn't read that link" },
        { status: 422 },
      );
    }
    // No coordinates in any URL along the way: scan the (capped) final page.
    const reader = res.body?.getReader();
    if (reader) {
      const decoder = new TextDecoder();
      let text = "";
      let read = 0;
      while (read < MAX_BYTES) {
        const { value, done } = await reader.read();
        if (done) break;
        read += value.byteLength;
        text += decoder.decode(value, { stream: true });
        if (read >= MAX_BYTES) break;
      }
      try { await reader.cancel(); } catch { /* ignore */ }
      const fromBody = coordsFromMapsText(text);
      if (fromBody) return NextResponse.json({ ok: true, ...fromBody });
    }
  } catch {
    /* fetch failed / timed out / body too big */
  } finally {
    clearTimeout(timer);
  }
  return NextResponse.json(
    { error: "couldn't read that link" },
    { status: 422 },
  );
}
