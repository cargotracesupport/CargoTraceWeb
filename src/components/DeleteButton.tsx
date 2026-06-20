"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import Spinner from "@/components/Spinner";

type Table = "deliveries" | "vehicles" | "devices";

/**
 * Delete a row (admin only; RLS enforces it) with a confirm prompt, then refresh.
 * For deleting drivers (auth users) use the /api/drivers DELETE endpoint instead.
 */
export default function DeleteButton({
  table,
  id,
  confirmText,
  label = "Delete",
}: {
  table: Table;
  id: string;
  confirmText?: string;
  label?: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function onClick() {
    if (!window.confirm(confirmText ?? "Delete this? This can't be undone.")) return;
    setBusy(true);
    const supabase = createClient();
    const { error } = await supabase.from(table).delete().eq("id", id);
    setBusy(false);
    if (error) {
      window.alert(error.message);
      return;
    }
    router.refresh();
  }

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={busy}
      title="Delete"
      className="ct-btn-ghost px-2 py-1 text-xs hover:border-red hover:text-red disabled:opacity-50"
    >
      {busy ? <Spinner /> : label}
    </button>
  );
}
