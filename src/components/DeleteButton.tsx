"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import Spinner from "@/components/Spinner";
import ConfirmDialog from "@/components/ConfirmDialog";
import { Trash } from "@/components/icons";

type Table = "deliveries" | "vehicles" | "devices";

/**
 * Move a row to the Trash (admin only; RLS enforces it) with a confirm prompt,
 * then refresh. This is a soft delete: it stamps deleted_at, so the row drops
 * out of every list but can be restored from the Trash page for 90 days, after
 * which a daily job removes it for good.
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
  const [confirm, setConfirm] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function doDelete() {
    setBusy(true);
    setError(null);
    const supabase = createClient();
    const { error } = await supabase
      .from(table)
      .update({ deleted_at: new Date().toISOString() })
      .eq("id", id);
    setBusy(false);
    if (error) {
      setError(error.message);
      return;
    }
    setConfirm(false);
    router.refresh();
  }

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setError(null);
          setConfirm(true);
        }}
        disabled={busy}
        title="Delete"
        className="ct-btn-ghost px-2 py-1 text-xs hover:border-red hover:text-red disabled:opacity-50"
      >
        {busy ? (
          <Spinner />
        ) : (
          <>
            <Trash className="h-3.5 w-3.5" />
            {label}
          </>
        )}
      </button>
      <ConfirmDialog
        open={confirm}
        title="Move to Trash?"
        message={
          error ? (
            <span className="text-red">{error}</span>
          ) : (
            confirmText ??
            "This is moved to the Trash and can be restored for 90 days."
          )
        }
        confirmLabel="Delete"
        danger
        busy={busy}
        icon={<Trash className="h-4 w-4" />}
        onConfirm={doDelete}
        onCancel={() => setConfirm(false)}
      />
    </>
  );
}
