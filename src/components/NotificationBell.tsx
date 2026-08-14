"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { Notification } from "@/lib/types";

function timeAgo(iso: string): string {
  const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const h = Math.floor(mins / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

/**
 * Notification bell for staff (admin / agent / driver). Loads the RLS-scoped
 * feed, subscribes to realtime inserts, and tracks "seen" per user in
 * localStorage so the unread badge clears when the dropdown is opened.
 */
export default function NotificationBell({ userId }: { userId: string }) {
  const [items, setItems] = useState<Notification[]>([]);
  const [open, setOpen] = useState(false);
  const [seen, setSeen] = useState(0);
  const seenKey = `ct_notif_seen:${userId}`;

  useEffect(() => {
    try {
      const s = localStorage.getItem(seenKey);
      if (s) setSeen(Number(s));
    } catch {
      /* storage unavailable */
    }
    const supabase = createClient();
    let active = true;
    supabase
      .from("notifications")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(30)
      .then(({ data }) => {
        if (active && data) setItems(data as Notification[]);
      });
    const channel = supabase
      .channel("notifications-feed")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "notifications" },
        (payload) => {
          setItems((prev) => {
            const n = payload.new as Notification;
            if (prev.some((p) => p.id === n.id)) return prev;
            return [n, ...prev].slice(0, 50);
          });
        },
      )
      .subscribe();
    return () => {
      active = false;
      supabase.removeChannel(channel);
    };
  }, [seenKey]);

  const unread = items.filter(
    (n) => new Date(n.created_at).getTime() > seen,
  ).length;

  function toggle() {
    setOpen((v) => {
      const nv = !v;
      if (nv) {
        const now = Date.now();
        setSeen(now);
        try {
          localStorage.setItem(seenKey, String(now));
        } catch {
          /* ignore */
        }
      }
      return nv;
    });
  }

  return (
    <div className="relative">
      <button
        type="button"
        onClick={toggle}
        aria-label="Notifications"
        className="relative inline-flex h-9 w-9 items-center justify-center rounded-lg border border-border2 bg-s1 text-muted2 transition-colors hover:text-text"
      >
        <svg
          viewBox="0 0 24 24"
          className="h-4.5 w-4.5"
          width="18"
          height="18"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden
        >
          <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
          <path d="M13.73 21a2 2 0 0 1-3.46 0" />
        </svg>
        {unread > 0 ? (
          <span className="absolute -right-1 -top-1 inline-flex min-w-[16px] items-center justify-center rounded-full bg-red px-1 text-[10px] font-bold leading-4 text-white">
            {unread > 9 ? "9+" : unread}
          </span>
        ) : null}
      </button>

      {open ? (
        <>
          <div
            className="fixed inset-0 z-40"
            onClick={() => setOpen(false)}
            aria-hidden
          />
          <div
            className="absolute right-0 z-50 mt-2 w-80 overflow-hidden rounded-xl border border-border2 bg-s1 shadow-xl"
            style={{ boxShadow: "var(--ct-shadow-pop)" }}
          >
            <div className="border-b border-border px-4 py-2.5 text-sm font-semibold">
              Notifications
            </div>
            {items.length === 0 ? (
              <div className="px-4 py-8 text-center text-sm text-muted2">
                No notifications yet.
              </div>
            ) : (
              <ul className="max-h-[60vh] divide-y divide-border overflow-y-auto">
                {items.map((n) => (
                  <li key={n.id} className="px-4 py-2.5">
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-sm font-medium text-text">{n.title}</p>
                      <span className="shrink-0 text-[11px] text-muted2">
                        {timeAgo(n.created_at)}
                      </span>
                    </div>
                    {n.body ? (
                      <p className="mt-0.5 text-xs text-muted2">{n.body}</p>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </>
      ) : null}
    </div>
  );
}
