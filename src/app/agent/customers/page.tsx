import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import type { Customer } from "@/lib/types";
import CustomersManager from "@/components/CustomersManager";

export default async function AgentCustomersPage() {
  const session = await requireRole("agent");
  const supabase = createClient();
  // RLS: agents see only the customers they added.
  const { data } = await supabase
    .from("customers")
    .select("*")
    .order("name", { ascending: true });
  const customers = (data ?? []) as Customer[];

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-4">
      <div>
        <h1 className="text-lg font-semibold tracking-tight">Customers</h1>
        <p className="text-sm text-muted2">
          Your saved receivers. Pick them when creating a delivery instead of
          retyping their details.
        </p>
      </div>
      <CustomersManager
        initial={customers}
        orgId={session.profile.org_id}
        currentUserId={session.profile.id}
      />
    </div>
  );
}
