import { NextResponse } from "next/server";
import { getSessionProfile } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

/**
 * Admin or agent: create a driver login inside the caller's org.
 * Drivers don't self-register — the sender (admin) or a dispatcher (agent)
 * provisions them.
 * POST { fullName, email, password, phone? }
 */
export async function POST(req: Request) {
  const session = await getSessionProfile();
  if (!session || !["admin", "agent"].includes(session.profile.role)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON" }, { status: 400 });
  }

  const fullName = String(body.fullName ?? "").trim();
  const email = String(body.email ?? "").trim();
  const password = String(body.password ?? "");
  const phone = body.phone ? String(body.phone).trim() : null;

  if (!fullName || !email || password.length < 6) {
    return NextResponse.json(
      { error: "fullName, email and password (min 6) required" },
      { status: 400 },
    );
  }

  const admin = createAdminClient();

  const { data: created, error: createErr } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name: fullName },
  });
  if (createErr || !created.user) {
    return NextResponse.json(
      { error: createErr?.message ?? "could not create user" },
      { status: 400 },
    );
  }

  // The signup trigger creates a default admin profile + org. Override it:
  // attach the driver to THIS admin's org with the driver role, and drop the auto org.
  const { data: autoProfile } = await admin
    .from("profiles")
    .select("org_id")
    .eq("id", created.user.id)
    .single();

  const { error: profErr } = await admin
    .from("profiles")
    .update({ org_id: session.profile.org_id, role: "driver", full_name: fullName, phone })
    .eq("id", created.user.id);

  if (profErr) {
    return NextResponse.json({ error: profErr.message }, { status: 400 });
  }

  // Clean up the throwaway org created by the signup trigger.
  if (autoProfile?.org_id && autoProfile.org_id !== session.profile.org_id) {
    await admin.from("organizations").delete().eq("id", autoProfile.org_id);
  }

  return NextResponse.json({
    driver: { id: created.user.id, full_name: fullName, email, phone },
  });
}

/**
 * Admin or agent: edit a driver's details (name, phone) in the caller's org.
 * Org-wide by design — like the admin Fleet card, an agent may edit any driver
 * in their own org (verified below), not only ones tied to their deliveries.
 * SECURITY: only full_name + phone are ever written here. Do NOT add role,
 * org_id, or email to this update — the service-role client bypasses RLS and
 * the prevent_self_privilege_change trigger, so this allow-list is the only
 * guard against privilege escalation. Email is the login and stays immutable.
 * PATCH { id, fullName, phone? }
 */
export async function PATCH(req: Request) {
  const session = await getSessionProfile();
  if (!session || !["admin", "agent"].includes(session.profile.role)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON" }, { status: 400 });
  }

  const id = String(body.id ?? "");
  const fullName = String(body.fullName ?? "").trim();
  const phone = body.phone ? String(body.phone).trim() : null;
  if (!id || !fullName) {
    return NextResponse.json(
      { error: "id and fullName required" },
      { status: 400 },
    );
  }

  const admin = createAdminClient();

  // Only edit a driver that belongs to this caller's org.
  const { data: target } = await admin
    .from("profiles")
    .select("id, org_id, role")
    .eq("id", id)
    .single();

  if (
    !target ||
    target.org_id !== session.profile.org_id ||
    target.role !== "driver"
  ) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  const { error } = await admin
    .from("profiles")
    .update({ full_name: fullName, phone })
    .eq("id", id);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({ ok: true });
}

/**
 * Admin or agent: delete a driver (and their login). DELETE /api/drivers?id=<profileId>
 * Verifies the target is a driver in the caller's org before removing the auth user
 * (the profile row cascades; assigned deliveries keep their history with driver_id set null).
 */
export async function DELETE(req: Request) {
  const session = await getSessionProfile();
  if (!session || !["admin", "agent"].includes(session.profile.role)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const id = new URL(req.url).searchParams.get("id");
  if (!id) {
    return NextResponse.json({ error: "id required" }, { status: 400 });
  }

  const admin = createAdminClient();

  // Defense in depth: only delete a driver that belongs to this admin's org.
  const { data: target } = await admin
    .from("profiles")
    .select("id, org_id, role")
    .eq("id", id)
    .single();

  if (
    !target ||
    target.org_id !== session.profile.org_id ||
    target.role !== "driver"
  ) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  const { error } = await admin.auth.admin.deleteUser(id);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({ ok: true });
}
