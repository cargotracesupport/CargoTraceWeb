import { requireRole } from "@/lib/auth";
import TrashConsole from "./_trash";

export default async function AdminTrashPage() {
  // Admin-only; the admin_trash() RPC also enforces this server-side.
  await requireRole("admin");
  return <TrashConsole />;
}
