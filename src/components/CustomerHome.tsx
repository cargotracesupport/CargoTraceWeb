"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import DeliveryStatusBadge from "@/components/DeliveryStatusBadge";
import Spinner from "@/components/Spinner";
import type { DeliveryStatus } from "@/lib/types";
import { BrandMark, MapPin, Flag, Package, Search } from "@/components/icons";

// Remembered credentials so a returning customer lands straight on their
// deliveries (same device-local convention as the tracker's phone memory).
// Either { token } (from a home link) or { phone, reference } (typed).
const STORE_KEY = "ct_customer_home";

type Creds = { token: string } | { phone: string; reference: string };

type HomeDelivery = {
  reference: string | null;
  status: DeliveryStatus;
  goods: string | null;
  origin_label: string | null;
  dest_label: string | null;
  needs_dropoff: boolean;
  tracking_token: string;
  created_at: string;
  delivered_at: string | null;
};

const DONE = new Set<DeliveryStatus>(["delivered", "cancelled"]);

function fmtDate(iso: string | null): string {
  if (!iso) return "";
  try {
    return new Date(iso).toLocaleDateString(undefined, {
      day: "numeric",
      month: "short",
      year: "numeric",
    });
  } catch {
    return "";
  }
}

/**
 * Customer home. Opened from a home link (/customer/<token> — the link itself
 * is the login, zero typing) or at /customer with the mobile number + any one
 * delivery reference. Shows everything booked with that number: actions needed
 * (set drop-off), deliveries on the way, and history.
 */
export default function CustomerHome({ token }: { token?: string }) {
  const [phone, setPhone] = useState("");
  const [reference, setReference] = useState("");
  const [busy, setBusy] = useState(false);
  // True while the link/remembered auto-login runs, so the form doesn't flash.
  const [boot, setBoot] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState<string | null>(null);
  const [deliveries, setDeliveries] = useState<HomeDelivery[] | null>(null);

  async function login(creds: Creds, silent = false) {
    setBusy(true);
    if (!silent) setError(null);
    try {
      const res = await fetch("/api/customer/deliveries", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(creds),
      });
      const j = (await res.json().catch(() => null)) as {
        error?: string;
        customer_name?: string | null;
        deliveries?: HomeDelivery[];
      } | null;
      if (!res.ok) {
        // Remembered/link credentials stopped matching — fall back to the form.
        if (silent) {
          try {
            localStorage.removeItem(STORE_KEY);
          } catch {
            /* ignore */
          }
        } else {
          setError(j?.error ?? `Failed (${res.status})`);
        }
        return;
      }
      setName(j?.customer_name ?? null);
      setDeliveries(j?.deliveries ?? []);
      try {
        localStorage.setItem(STORE_KEY, JSON.stringify(creds));
      } catch {
        /* remembering is best-effort */
      }
    } catch {
      if (!silent) setError("Could not reach the server. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  // Boot: a home link logs in with its token; otherwise a returning customer's
  // remembered credentials log in silently.
  useEffect(() => {
    (async () => {
      if (token) {
        await login({ token }, true);
        setBoot(false);
        return;
      }
      try {
        const saved = localStorage.getItem(STORE_KEY);
        if (saved) {
          const creds = JSON.parse(saved) as Creds;
          if ("token" in creds ? creds.token : creds.phone && creds.reference) {
            if ("phone" in creds) {
              setPhone(creds.phone);
              setReference(creds.reference);
            }
            await login(creds, true);
          }
        }
      } catch {
        /* fall through to the form */
      }
      setBoot(false);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  function logout() {
    try {
      localStorage.removeItem(STORE_KEY);
    } catch {
      /* ignore */
    }
    setDeliveries(null);
    setName(null);
    setPhone("");
    setReference("");
    setError(null);
  }

  const needsAction = (deliveries ?? []).filter(
    (d) => !DONE.has(d.status) && d.needs_dropoff,
  );
  const onTheWay = (deliveries ?? []).filter(
    (d) => !DONE.has(d.status) && !d.needs_dropoff,
  );
  const history = (deliveries ?? []).filter((d) => DONE.has(d.status));

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-xl flex-col gap-5 px-4 py-8">
      <div className="flex flex-col items-center gap-1 text-center">
        <BrandMark className="h-11 w-11" />
        <h1 className="text-xl font-bold tracking-tight">
          Cargo<span className="text-primary">Trace</span>
        </h1>
        <p className="text-xs font-semibold uppercase tracking-wide text-muted2">
          My deliveries
        </p>
      </div>

      {boot ? (
        /* ── Link/remembered login in flight ───────────────────────────── */
        <div className="ct-card flex flex-col items-center gap-3 px-5 py-12 text-center">
          <Spinner />
          <p className="text-sm text-muted2">Loading your deliveries…</p>
        </div>
      ) : deliveries == null ? (
        /* ── Login: phone + any delivery reference ─────────────────────── */
        <section className="ct-card p-5">
          <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-2xl bg-primary/10 text-primary">
            <Package className="h-5 w-5" />
          </div>
          <h2 className="text-lg font-bold tracking-tight">
            See all your deliveries
          </h2>
          <p className="mt-1 text-sm text-muted2">
            {token
              ? "This link couldn't load your deliveries — enter the mobile number your deliveries were booked with, plus any one delivery reference."
              : "Enter the mobile number your deliveries were booked with, plus any one delivery reference from an order message (e.g. CT-1234)."}
          </p>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void login({ phone, reference });
            }}
            className="mt-4 flex flex-col gap-3"
          >
            <div>
              <label className="ct-label" htmlFor="cust_phone">
                Mobile number
              </label>
              <input
                id="cust_phone"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                required
                type="tel"
                autoComplete="tel"
                placeholder="Your mobile number"
                className="ct-input"
              />
            </div>
            <div>
              <label className="ct-label" htmlFor="cust_ref">
                Delivery reference
              </label>
              <input
                id="cust_ref"
                value={reference}
                onChange={(e) => setReference(e.target.value)}
                required
                placeholder="e.g. CT-1234"
                className="ct-input"
              />
            </div>
            {error ? (
              <p
                role="alert"
                className="rounded-xl border border-red/40 bg-red/10 px-3 py-2 text-xs font-medium text-red"
              >
                {error}
              </p>
            ) : null}
            <button
              type="submit"
              disabled={busy}
              className="ct-btn-primary w-full !py-3"
            >
              {busy ? (
                <>
                  <Spinner /> Checking…
                </>
              ) : (
                <>
                  <Search className="h-4 w-4" /> Show my deliveries
                </>
              )}
            </button>
          </form>
        </section>
      ) : (
        /* ── Home ──────────────────────────────────────────────────────── */
        <>
          <div className="flex items-center justify-between px-1">
            <p className="text-sm text-muted2">
              {name ? (
                <>
                  Hi <span className="font-semibold text-text">{name}</span>
                </>
              ) : (
                "Your deliveries"
              )}
            </p>
            <button
              type="button"
              onClick={logout}
              className="text-xs text-muted2 underline hover:text-text"
            >
              Use a different number
            </button>
          </div>

          {deliveries.length === 0 ? (
            <div className="ct-card flex flex-col items-center gap-2 px-5 py-12 text-center">
              <Package className="h-6 w-6 text-muted2" />
              <p className="text-sm text-muted2">
                No deliveries found for this number yet.
              </p>
            </div>
          ) : null}

          {needsAction.length > 0 ? (
            <section className="flex flex-col gap-2">
              <h2 className="px-1 text-sm font-semibold">
                Needs your action{" "}
                <span className="ct-pill bg-amber/10 text-amber">
                  {needsAction.length}
                </span>
              </h2>
              {needsAction.map((d) => (
                <div key={d.tracking_token} className="ct-card p-4">
                  <Row d={d} />
                  <Link
                    href={`/track/${d.tracking_token}`}
                    className="ct-btn-primary mt-3 w-full !py-2.5"
                  >
                    <MapPin className="h-4 w-4" /> Set drop-off location
                  </Link>
                </div>
              ))}
            </section>
          ) : null}

          {onTheWay.length > 0 ? (
            <section className="flex flex-col gap-2">
              <h2 className="px-1 text-sm font-semibold">
                On the way{" "}
                <span className="ct-pill bg-green/10 text-green">
                  {onTheWay.length}
                </span>
              </h2>
              {onTheWay.map((d) => {
                // Drop-off is changeable until the trip starts (same window
                // the tracker/API allows). En-route deliveries are locked.
                const canChange =
                  d.status === "awaiting_dropoff" ||
                  d.status === "pending" ||
                  d.status === "assigned";
                return (
                  <div key={d.tracking_token} className="ct-card p-4">
                    <Row d={d} />
                    <div
                      className={`mt-3 grid gap-2 ${canChange ? "grid-cols-2" : ""}`}
                    >
                      <Link
                        href={`/track/${d.tracking_token}`}
                        className="ct-btn-ghost justify-center !py-2.5"
                      >
                        <Flag className="h-4 w-4" />
                        {canChange ? "Track" : "Track this delivery"}
                      </Link>
                      {canChange ? (
                        <Link
                          // The hash tells the tracker to open the drop-off
                          // editor straight away.
                          href={`/track/${d.tracking_token}#change-dropoff`}
                          className="ct-btn-ghost justify-center !py-2.5"
                        >
                          <MapPin className="h-4 w-4" /> Change drop-off
                        </Link>
                      ) : null}
                    </div>
                  </div>
                );
              })}
            </section>
          ) : null}

          {history.length > 0 ? (
            <section className="flex flex-col gap-2">
              <h2 className="px-1 text-sm font-semibold text-muted2">
                History{" "}
                <span className="ct-pill bg-s3 text-muted2">
                  {history.length}
                </span>
              </h2>
              {history.map((d) => (
                <Link
                  key={d.tracking_token}
                  href={`/track/${d.tracking_token}`}
                  className="ct-card block p-4 opacity-80 transition-opacity hover:opacity-100"
                >
                  <Row d={d} />
                  <p className="mt-1.5 text-xs text-muted">
                    {d.status === "delivered"
                      ? `Delivered ${fmtDate(d.delivered_at)}`
                      : `Cancelled · booked ${fmtDate(d.created_at)}`}
                  </p>
                </Link>
              ))}
            </section>
          ) : null}
        </>
      )}
    </main>
  );
}

function Row({ d }: { d: HomeDelivery }) {
  return (
    <>
      <div className="flex items-center justify-between gap-2">
        <span className="font-mono text-sm font-medium text-primary">
          {d.reference ?? "—"}
        </span>
        <DeliveryStatusBadge status={d.status} />
      </div>
      <p className="mt-1 truncate text-sm text-text">{d.goods ?? "Delivery"}</p>
      <p className="mt-1 flex items-center gap-1.5 text-xs text-muted2">
        <MapPin className="h-3 w-3 shrink-0 text-primary" />
        <span className="truncate">{d.origin_label ?? "—"}</span>
        <span className="text-muted">→</span>
        <Flag className="h-3 w-3 shrink-0 text-accent" />
        <span className="truncate">{d.dest_label ?? "to be set"}</span>
      </p>
    </>
  );
}
