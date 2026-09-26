// Server-side only (uses node:crypto). Imported by API route handlers.
import { createHash } from "node:crypto";

export const PWNED_MESSAGE =
  "This password has appeared in a known data breach. Please choose a different one.";

/**
 * How many times a password appears in the Have I Been Pwned breach corpus.
 * Uses the k-anonymity range API: only the first 5 hex characters of the
 * password's SHA-1 are sent; the password itself never leaves the server.
 *
 * Returns the breach count (0 = not found), or null when the check couldn't run
 * (network error / timeout). Callers fail OPEN on null so an HIBP outage never
 * blocks an admin from setting a password.
 *
 * (Supabase's built-in leaked-password protection requires the Pro plan; this
 * gives the same protection for every password set from the dashboard.)
 */
export async function pwnedCount(password: string): Promise<number | null> {
  const sha1 = createHash("sha1").update(password).digest("hex").toUpperCase();
  const prefix = sha1.slice(0, 5);
  const suffix = sha1.slice(5);

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 3000);
  try {
    const res = await fetch(`https://api.pwnedpasswords.com/range/${prefix}`, {
      // Padding hides the real response size; padded rows have a count of 0.
      headers: { "Add-Padding": "true" },
      signal: ctrl.signal,
      cache: "no-store",
    });
    if (!res.ok) return null;
    const body = await res.text();
    for (const line of body.split("\n")) {
      const [s, c] = line.trim().split(":");
      if (s === suffix) return Number(c) || 0;
    }
    return 0;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/** True when the password is known to be breached (fails open on errors). */
export async function isPwned(password: string): Promise<boolean> {
  return ((await pwnedCount(password)) ?? 0) > 0;
}
