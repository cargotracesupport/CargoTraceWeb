"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import type { Delivery } from "@/lib/types";

/**
 * Alerts the agent when a new order (delivery) is created in their org — a short
 * chime + a tappable toast. Mounted in the agent layout so it fires on any page.
 */
export default function NewOrderAlert({ orgId }: { orgId: string }) {
  const [toast, setToast] = useState<{ ref: string; assigned: boolean } | null>(
    null,
  );
  const ctxRef = useRef<AudioContext | null>(null);

  // Browsers block audio until a user gesture — unlock the AudioContext on the
  // first interaction so later chimes can play.
  useEffect(() => {
    const unlock = () => {
      if (!ctxRef.current) {
        const Ctx =
          window.AudioContext ??
          (window as unknown as { webkitAudioContext?: typeof AudioContext })
            .webkitAudioContext;
        if (Ctx) ctxRef.current = new Ctx();
      }
      void ctxRef.current?.resume();
    };
    window.addEventListener("pointerdown", unlock, { once: true });
    window.addEventListener("keydown", unlock, { once: true });
    return () => {
      window.removeEventListener("pointerdown", unlock);
      window.removeEventListener("keydown", unlock);
    };
  }, []);

  function chime() {
    const ctx = ctxRef.current;
    if (!ctx) return;
    const now = ctx.currentTime;
    [880, 1320].forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = freq;
      osc.connect(gain);
      gain.connect(ctx.destination);
      const t = now + i * 0.16;
      gain.gain.setValueAtTime(0.0001, t);
      gain.gain.exponentialRampToValueAtTime(0.28, t + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.3);
      osc.start(t);
      osc.stop(t + 0.32);
    });
  }

  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel("agent-new-orders")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "deliveries" },
        (payload) => {
          const d = payload.new as Delivery;
          if (d.org_id !== orgId) return;
          chime();
          setToast({
            ref: d.reference ?? "New order",
            assigned: d.driver_id != null,
          });
        },
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [orgId]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 6000);
    return () => clearTimeout(t);
  }, [toast]);

  if (!toast) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed bottom-20 left-1/2 z-40 -translate-x-1/2 px-4 md:bottom-6"
    >
      <Link
        href={toast.assigned ? "/agent" : "/agent/unassigned"}
        onClick={() => setToast(null)}
        className="flex items-center gap-3 rounded-full border border-border bg-s1 px-4 py-2.5 shadow-[var(--ct-shadow-pop)]"
      >
        <span className="relative flex h-2.5 w-2.5 shrink-0">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary opacity-70" />
          <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-primary" />
        </span>
        <span className="text-sm font-medium">
          New order {toast.ref}
          {toast.assigned ? "" : " · needs a driver"}
        </span>
      </Link>
    </div>
  );
}
