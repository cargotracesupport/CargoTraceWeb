import { NextResponse } from "next/server";
import { getSessionProfile } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

/** Returns the vehicle id only if it belongs to the org, else null. */
async function orgVehicleId(
  admin: ReturnType<typeof createAdminClient>,
  orgId: string,
  raw: unknown,
): Promise<string | null> {
  const id = raw ? String(raw) : "";
  if (!id) return null;
  const { data } = await admin
    .from("vehicles")
    .select("id")
    .eq("id", id)
    .eq("org_id", orgId)
    .maybeSingle();
  return data ? id : null;
}

/** Returns the agent id only if it's an agent in the org, else null. */
async function orgAgentId(
  admin: ReturnType<typeof createAdminClient>,
  orgId: string,
  raw: unknown,
): Promise<string | null> {
  const id = raw ? String(raw) : "";
  if (!id) return null;
  const { data } = await admin
    .from("profiles")
    .select("id")
    .eq("id", id)
    .eq("org_id", orgId)
    .eq("role", "agent")
    .maybeSingle();
  return data ? id : null;
}

/**
 * Admin or agent: create a driver login inside the caller's org.
 * Drivers don't self-register — the sender (admin) or a dispatcher (agent)
 * provisions them. An optional vehicleId sets the driver's current vehicle
 * (auto-filled at dispatch).
 * POST { fullName, email, password, phone?, vehicleId? }
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
  if (fullName.length > 120 || email.length > 200) {
    return NextResponse.json({ error: "name or email too long" }, { status: 400 });
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

  const vehicle_id = await orgVehicleId(
    admin,
    session.profile.org_id,
    body.vehicleId,
  );

  // A driver created by an agent belongs to that agent; an admin picks the
  // owning agent (optional).
  const agent_id =
    session.profile.role === "agent"
      ? session.profile.id
      : await orgAgentId(admin, session.profile.org_id, body.agentId);

  const { error: profErr } = await admin
    .from("profiles")
    .update({
      org_id: session.profile.org_id,
      role: "driver",
      full_name: fullName,
      phone,
      vehicle_id,
      agent_id,
    })
    .eq("id", created.user.id);

  if (profErr) {
    console.error("driver profile update failed:", profErr.message);
    return NextResponse.json({ error: "could not create driver" }, { status: 400 });
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
 * Admin or agent: edit a driver's details (name, phone, vehicle) in the caller's
 * org. Org-wide by design — like the admin Fleet card, an agent may edit any
 * driver in their own org (verified below), not only ones tied to their
 * deliveries.
 * SECURITY: only full_name + phone + vehicle_id are ever written here. Do NOT
 * add role, org_id, or email to this update — the service-role client bypasses
 * RLS and the prevent_self_privilege_change trigger, so this allow-list is the
 * only guard against privilege escalation. Email is the login and stays
 * immutable. vehicle_id is only touched when the request includes vehicleId.
 * PATCH { id, fullName, phone?, vehicleId? }
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
  const email = body.email ? String(body.email).trim() : "";
  const password = body.password ? String(body.password) : "";
  if (!id || !fullName) {
    return NextResponse.json(
      { error: "id and fullName required" },
      { status: 400 },
    );
  }
  if (fullName.length > 120) {
    return NextResponse.json({ error: "name too long" }, { status: 400 });
  }
  // Email + password are the driver's login — validate before touching auth.
  if (email && (email.length > 200 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))) {
    return NextResponse.json({ error: "invalid email" }, { status: 400 });
  }
  if (password && password.length < 6) {
    return NextResponse.json(
      { error: "password must be at least 6 characters" },
      { status: 400 },
    );
  }

  const admin = createAdminClient();

  // Only edit a driver that belongs to this caller's org — and, for agents,
  // only a driver they own. The service-role client bypasses RLS, so this
  // ownership check is the only thing stopping an agent from editing another
  // agent's driver.
  const { data: target } = await admin
    .from("profiles")
    .select("id, org_id, role, agent_id")
    .eq("id", id)
    .single();

  if (
    !target ||
    target.org_id !== session.profile.org_id ||
    target.role !== "driver"
  ) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }
  if (session.profile.role === "agent" && target.agent_id !== session.profile.id) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const update: Record<string, unknown> = { full_name: fullName, phone };
  // Only touch the vehicle when the caller explicitly sends it (so name/phone
  // edits don't wipe the assigned vehicle).
  if ("vehicleId" in body) {
    update.vehicle_id = await orgVehicleId(
      admin,
      session.profile.org_id,
      body.vehicleId,
    );
  }
  // Only an admin may reassign a driver's owning agent.
  if (session.profile.role === "admin" && "agentId" in body) {
    update.agent_id = await orgAgentId(
      admin,
      session.profile.org_id,
      body.agentId,
    );
  }

  const { error } = await admin.from("profiles").update(update).eq("id", id);
  if (error) {
    console.error("driver PATCH failed:", error.message);
    return NextResponse.json({ error: "could not update driver" }, { status: 400 });
  }

  // Update login credentials (email and/or password) when provided. Gated by the
  // same ownership checks above, so an agent can only change their own driver's.
  const authUpdate: { email?: string; email_confirm?: boolean; password?: string } =
    {};
  if (email) {
    authUpdate.email = email;
    authUpdate.email_confirm = true;
  }
  if (password) authUpdate.password = password;
  if (Object.keys(authUpdate).length > 0) {
    const { error: authErr } = await admin.auth.admin.updateUserById(id, authUpdate);
    if (authErr) {
      console.error("driver credential update failed:", authErr.message);
      return NextResponse.json(
        { error: authErr.message || "could not update login" },
        { status: 400 },
      );
    }
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

  // Defense in depth: only delete a driver in this caller's org — and, for
  // agents, only a driver they own (the service-role client bypasses RLS).
  const { data: target } = await admin
    .from("profiles")
    .select("id, org_id, role, agent_id")
    .eq("id", id)
    .single();

  if (
    !target ||
    target.org_id !== session.profile.org_id ||
    target.role !== "driver"
  ) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }
  if (session.profile.role === "agent" && target.agent_id !== session.profile.id) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const { error } = await admin.auth.admin.deleteUser(id);
  if (error) {
    console.error("driver DELETE failed:", error.message);
    return NextResponse.json({ error: "could not delete driver" }, { status: 400 });
  }

  return NextResponse.json({ ok: true });
}
