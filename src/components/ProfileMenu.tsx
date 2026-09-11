"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { Avatar, Contact, LogOut } from "@/components/icons";

/**
 * Header account control: an avatar button that opens a dropdown with a link to
 * the profile page and a Log out action (with a confirmation step, preserving
 * the previous logout behaviour). Replaces the standalone LogoutButton.
 */
export default function ProfileMenu({
  name,
  roleLabel,
  profileHref,
}: {
  name: string | null;
  roleLabel?: string;
  profileHref: string;
}) {
  const [open, setOpen] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [mounted, setMounted] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => setMounted(true), []);

  // Close the dropdown on an outside click or Escape.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node))
        setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const confirmModal = (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Confirm logout"
      className="fixed inset-0 z-[70] flex items-center justify-center p-4"
    >
      <button
        type="button"
        aria-label="Cancel"
        onClick={() => setConfirm(false)}
        className="absolute inset-0 cursor-default bg-black/40 backdrop-blur-sm"
      />
      <div
        className="ct-card relative w-full max-w-xs p-5"
        style={{ boxShadow: "var(--ct-shadow-pop)" }}
      >
        <h2 className="text-base font-semibold tracking-tight">Log out?</h2>
        <p className="mt-1 text-sm text-muted2">
          You&rsquo;ll need to sign in again to access your console.
        </p>
        <div className="mt-4 flex justify-end gap-2">
          <button
            type="button"
            onClick={() => setConfirm(false)}
            className="ct-btn-ghost px-3 py-2 text-sm"
          >
            Cancel
          </button>
          <form action="/api/auth/signout" method="post">
            <button type="submit" className="ct-btn-primary px-3 py-2 text-sm">
              <LogOut className="h-4 w-4" />
              Log out
            </button>
          </form>
        </div>
      </div>
    </div>
  );

  return (
    <div className="relative" ref={wrapRef}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label="Account menu"
        aria-haspopup="menu"
        aria-expanded={open}
        className="flex items-center rounded-full outline-none ring-primary/40 focus-visible:ring-2"
      >
        <Avatar name={name ?? "?"} size={30} />
      </button>

      {open ? (
        <div
          role="menu"
          className="absolute right-0 z-50 mt-2 w-56 overflow-hidden rounded-xl border border-border2 bg-s1 shadow-xl"
          style={{ boxShadow: "var(--ct-shadow-pop)" }}
        >
          <div className="border-b border-border px-4 py-3">
            <div className="truncate text-sm font-semibold text-text">
              {name ?? "Your account"}
            </div>
            {roleLabel ? (
              <div className="mt-0.5 text-[11px] uppercase tracking-wide text-muted2">
                {roleLabel}
              </div>
            ) : null}
          </div>
          <Link
            href={profileHref}
            role="menuitem"
            onClick={() => setOpen(false)}
            className="flex w-full items-center gap-2.5 px-4 py-2.5 text-sm text-text transition-colors hover:bg-s2"
          >
            <Contact className="h-4 w-4 text-muted2" /> Profile
          </Link>
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              setOpen(false);
              setConfirm(true);
            }}
            className="flex w-full items-center gap-2.5 px-4 py-2.5 text-left text-sm text-red transition-colors hover:bg-red/10"
          >
            <LogOut className="h-4 w-4" /> Log out
          </button>
        </div>
      ) : null}

      {confirm && mounted ? createPortal(confirmModal, document.body) : null}
    </div>
  );
}
