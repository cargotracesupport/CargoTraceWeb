// Keep users signed in across browser restarts.
//
// Supabase stores the session in cookies. Without an explicit Max-Age these are
// "session cookies" that the browser deletes on close — so the user is asked to
// log in again every time. We give the auth cookies a long Max-Age so the
// session is remembered. The access-token JWT inside still expires hourly and is
// silently refreshed by middleware using the (now-persisted) refresh token, so
// long-lived cookies don't weaken token rotation.
//
// ~1 year, kept under the browser's 400-day cap on cookie lifetime.
export const SESSION_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

/**
 * Persist set-cookies (those carrying a value) for a long time, but leave
 * removals untouched so sign-out still clears the session immediately.
 */
export function withPersistence<T extends { maxAge?: number }>(
  value: string,
  options: T,
): T {
  if (!value) return options; // a removal (empty value) — keep maxAge: 0
  return { ...options, maxAge: SESSION_COOKIE_MAX_AGE };
}
