import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Map of profile id -> login email for the given ids. Login emails live in
 * auth.users (not profiles), so this uses the service-role client. Callers must
 * pass ONLY ids the current user is authorized to see (e.g. an RLS-scoped list).
 *
 * Fetches the user list in ONE paginated call (not one lookup per id) to avoid
 * an N+1 of auth-admin round-trips on every page load.
 */
export async function emailsByIds(
  ids: string[],
): Promise<Record<string, string>> {
  if (ids.length === 0) return {};
  const want = new Set(ids);
  const admin = createAdminClient();
  const out: Record<string, string> = {};

  // Walk pages until we've matched every id (or run out of users).
  for (let page = 1; page <= 20 && want.size > 0; page++) {
    const { data, error } = await admin.auth.admin.listUsers({
      page,
      perPage: 200,
    });
    if (error || !data?.users?.length) break;
    for (const u of data.users) {
      if (want.has(u.id)) {
        out[u.id] = u.email ?? "";
        want.delete(u.id);
      }
    }
    if (data.users.length < 200) break; // last page
  }
  // Anything unmatched -> empty string, so callers get a stable shape.
  for (const id of ids) if (!(id in out)) out[id] = "";
  return out;
}
