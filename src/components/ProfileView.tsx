"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { ROLE_LABEL, type Role } from "@/lib/types";
import { Avatar, Contact, Phone, Check } from "@/components/icons";
import Spinner from "@/components/Spinner";

export interface ProfileInitial {
  userId: string;
  fullName: string | null;
  phone: string | null;
  email: string | null;
  role: Role;
  orgName: string | null;
  createdAt: string;
}

function fmtDate(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? "—"
    : d.toLocaleDateString(undefined, {
        year: "numeric",
        month: "long",
        day: "numeric",
      });
}

/** Editable profile: the user can change their own name + phone; role, org and
 * email are shown read-only (locked server-side for self-service updates). */
export default function ProfileView({ initial }: { initial: ProfileInitial }) {
  const [fullName, setFullName] = useState(initial.fullName ?? "");
  const [phone, setPhone] = useState(initial.phone ?? "");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const dirty =
    fullName.trim() !== (initial.fullName ?? "") ||
    phone.trim() !== (initial.phone ?? "");

  async function save() {
    setBusy(true);
    setMsg(null);
    const supabase = createClient();
    const { error } = await supabase
      .from("profiles")
      .update({ full_name: fullName.trim() || null, phone: phone.trim() || null })
      .eq("id", initial.userId);
    setBusy(false);
    if (error) {
      setMsg({ ok: false, text: error.message });
      return;
    }
    initial.fullName = fullName.trim() || null;
    initial.phone = phone.trim() || null;
    setMsg({ ok: true, text: "Profile saved." });
  }

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-4">
      <div>
        <h1 className="text-lg font-semibold tracking-tight">Profile</h1>
        <p className="text-sm text-muted2">
          Your account details. Update your name and contact number.
        </p>
      </div>

      {/* Identity header */}
      <section className="ct-card flex items-center gap-4 p-5">
        <Avatar name={fullName || initial.email || "?"} size={56} />
        <div className="min-w-0">
          <div className="truncate text-base font-semibold text-text">
            {fullName || "Unnamed user"}
          </div>
          <div className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-muted2">
            <span className="ct-pill bg-primary/10 text-primary">
              {ROLE_LABEL[initial.role]}
            </span>
            {initial.orgName ? <span>{initial.orgName}</span> : null}
          </div>
        </div>
      </section>

      {/* Editable */}
      <section className="ct-card flex flex-col gap-4 p-5">
        <div>
          <label className="ct-label" htmlFor="p_name">
            Full name
          </label>
          <div className="relative">
            <Contact className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted2" />
            <input
              id="p_name"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              placeholder="Your name"
              className="ct-input pl-9"
            />
          </div>
        </div>
        <div>
          <label className="ct-label" htmlFor="p_phone">
            Mobile number
          </label>
          <div className="relative">
            <Phone className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted2" />
            <input
              id="p_phone"
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="+91 90000 00000"
              className="ct-input pl-9"
            />
          </div>
        </div>

        {msg ? (
          <p className={`text-sm ${msg.ok ? "text-green" : "text-red"}`}>
            {msg.text}
          </p>
        ) : null}

        <div className="flex justify-end">
          <button
            type="button"
            onClick={save}
            disabled={busy || !dirty}
            className="ct-btn-primary disabled:opacity-60"
          >
            {busy ? (
              <>
                <Spinner /> Saving…
              </>
            ) : (
              <>
                <Check className="h-4 w-4" /> Save changes
              </>
            )}
          </button>
        </div>
      </section>

      {/* Read-only account info */}
      <section className="ct-card p-5">
        <h2 className="text-[11px] font-semibold uppercase tracking-wide text-muted2">
          Account
        </h2>
        <dl className="mt-3 flex flex-col divide-y divide-border/60 text-sm">
          <Row label="Email" value={initial.email ?? "—"} />
          <Row label="Role" value={ROLE_LABEL[initial.role]} />
          <Row label="Organization" value={initial.orgName ?? "—"} />
          <Row label="Member since" value={fmtDate(initial.createdAt)} />
        </dl>
        <p className="mt-3 text-xs text-muted">
          Role and organization are managed by your admin and can&rsquo;t be
          changed here.
        </p>
      </section>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3 py-2.5">
      <dt className="text-muted2">{label}</dt>
      <dd className="min-w-0 truncate text-right font-medium text-text">
        {value}
      </dd>
    </div>
  );
}
