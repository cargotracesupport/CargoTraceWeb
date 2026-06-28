import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Map of profile id -> login email for the given ids. Login emails live in
 * auth.users (not profiles), so this uses the service-role client. Callers must
 * pass ONLY ids the current user is authorized to see (e.g. an RLS-scoped list).
 */
export async function emailsByIds(
  ids: string[],
): Promise<Record<string, string>> {
  const admin = createAdminClient();
  const pairs = await Promise.all(
    ids.map(async (id) => {
      const { data } = await admin.auth.admin.getUserById(id);
      return [id, data.user?.email ?? ""] as const;
    }),
  );
  return Object.fromEntries(pairs);
}
