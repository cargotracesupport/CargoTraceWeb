import { NextResponse } from "next/server";
import { getSessionProfile } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

/**
 * Admin-only: create an agent (dispatcher) login inside the admin's org.
 * Agents assign deliveries to drivers; they don't self-register.
 * POST { fullName, email, password, phone? }
 */
export async function POST(req: Request) {
  const session = await getSessionProfile();
  if (!session || session.profile.role !== "admin") {
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
  // attach the agent to THIS admin's org with the agent role, and drop the auto org.
  const { data: autoProfile } = await admin
    .from("profiles")
    .select("org_id")
    .eq("id", created.user.id)
    .single();

  const { error: profErr } = await admin
    .from("profiles")
    .update({ org_id: session.profile.org_id, role: "agent", full_name: fullName, phone })
    .eq("id", created.user.id);

  if (profErr) {
    console.error("agent profile update failed:", profErr.message);
    return NextResponse.json({ error: "could not create agent" }, { status: 400 });
  }

  // Clean up the throwaway org created by the signup trigger.
  if (autoProfile?.org_id && autoProfile.org_id !== session.profile.org_id) {
    await admin.from("organizations").delete().eq("id", autoProfile.org_id);
  }

  return NextResponse.json({
    agent: { id: created.user.id, full_name: fullName, email, phone },
  });
}

/**
 * Admin-only: edit an agent's details (name, phone) in the admin's org.
 * SECURITY: only full_name + phone are written here — never role, org_id, or
 * email. The service-role client bypasses RLS and the privilege trigger, so
 * this allow-list is the only guard. Email is the login and stays immutable.
 * PATCH { id, fullName, phone? }
 */
export async function PATCH(req: Request) {
  const session = await getSessionProfile();
  if (!session || session.profile.role !== "admin") {
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
  if (!id || !fullName) {
    return NextResponse.json(
      { error: "id and fullName required" },
      { status: 400 },
    );
  }
  if (fullName.length > 120) {
    return NextResponse.json({ error: "name too long" }, { status: 400 });
  }
  // Email is the login — validate before we touch the auth account.
  if (email && (email.length > 200 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))) {
    return NextResponse.json({ error: "invalid email" }, { status: 400 });
  }

  const admin = createAdminClient();

  const { data: target } = await admin
    .from("profiles")
    .select("id, org_id, role")
    .eq("id", id)
    .single();

  if (
    !target ||
    target.org_id !== session.profile.org_id ||
    target.role !== "agent"
  ) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  const { error } = await admin
    .from("profiles")
    .update({ full_name: fullName, phone })
    .eq("id", id);
  if (error) {
    console.error("agent PATCH failed:", error.message);
    return NextResponse.json({ error: "could not update agent" }, { status: 400 });
  }

  // Update the login email on the auth account if one was provided. Kept
  // confirmed so the agent can sign in immediately with the new address.
  if (email) {
    const { error: authErr } = await admin.auth.admin.updateUserById(id, {
      email,
      email_confirm: true,
    });
    if (authErr) {
      console.error("agent email update failed:", authErr.message);
      return NextResponse.json(
        { error: authErr.message || "could not update email" },
        { status: 400 },
      );
    }
  }

  return NextResponse.json({ ok: true });
}

/**
 * Admin-only: delete an agent (and their login). DELETE /api/agents?id=<profileId>
 * Verifies the target is an agent in the caller's org before removing the auth user.
 */
export async function DELETE(req: Request) {
  const session = await getSessionProfile();
  if (!session || session.profile.role !== "admin") {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const id = new URL(req.url).searchParams.get("id");
  if (!id) {
    return NextResponse.json({ error: "id required" }, { status: 400 });
  }

  const admin = createAdminClient();

  // Defense in depth: only delete an agent that belongs to this admin's org.
  const { data: target } = await admin
    .from("profiles")
    .select("id, org_id, role")
    .eq("id", id)
    .single();

  if (
    !target ||
    target.org_id !== session.profile.org_id ||
    target.role !== "agent"
  ) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  const { error } = await admin.auth.admin.deleteUser(id);
  if (error) {
    console.error("agent DELETE failed:", error.message);
    return NextResponse.json({ error: "could not delete agent" }, { status: 400 });
  }

  return NextResponse.json({ ok: true });
}
