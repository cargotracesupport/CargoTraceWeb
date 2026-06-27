import { createBrowserClient } from "@supabase/ssr";
import { SESSION_COOKIE_MAX_AGE } from "./cookies";

/** Supabase client for Client Components (browser). Enforces RLS as the signed-in user. */
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      // Persist the session across browser restarts (see ./cookies). Sign-out
      // still clears cookies explicitly, so this only affects the "remembered"
      // login. supabase-js auto-refreshes the access token in the background.
      cookieOptions: { maxAge: SESSION_COOKIE_MAX_AGE },
    },
  );
}
