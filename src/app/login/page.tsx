"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import Spinner from "@/components/Spinner";
import { BrandMark, Wordmark, Check, MapPin, Eye, EyeOff } from "@/components/icons";
import ThemeToggle from "@/components/ThemeToggle";
import HeroArt from "@/components/HeroArt";

const FEATURES = [
  "Live GPS tracking from pickup to doorstep",
  "By-road ETAs your customers can follow",
  "One console for fleet, drivers & deliveries",
];

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const supabase = createClient();
    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });
      if (error) {
        setError(error.message);
        setLoading(false);
        return;
      }

      // Resolve the role from the in-memory session (RLS lets a user read their
      // own profile via the bearer token — no cookie round-trip needed) so we
      // can navigate straight to the role's home and skip the "/" redirect hop.
      let dest = "/";
      const userId = data.user?.id;
      if (userId) {
        const { data: profile } = await supabase
          .from("profiles")
          .select("role")
          .eq("id", userId)
          .single();
        if (profile?.role) dest = profile.role === "admin" ? "/admin" : "/driver";
      }

      // Full navigation so the auth cookie is sent. Keep `loading` true through
      // the navigation so the spinner stays visible until the destination
      // paints — otherwise the button flips back to "Sign in" and looks frozen.
      window.location.href = dest;
    } catch {
      setError("Something went wrong. Please try again.");
      setLoading(false);
    }
  }

  return (
    <main className="relative grid min-h-dvh w-full lg:grid-cols-2">
      <ThemeToggle className="absolute right-4 top-4 z-20" />

      {/* ── Left: brand hero (desktop) ───────────────────────── */}
      <section className="relative hidden flex-col justify-between overflow-hidden p-10 lg:flex xl:p-14">
        <div
          aria-hidden
          className="absolute inset-0 -z-10"
          style={{ backgroundImage: "var(--grad-primary)", opacity: 0.96 }}
        />
        <div
          aria-hidden
          className="absolute inset-0 -z-10 opacity-30"
          style={{
            backgroundImage:
              "radial-gradient(circle at 80% 10%, rgba(255,255,255,.5), transparent 40%), radial-gradient(circle at 10% 90%, rgba(255,255,255,.35), transparent 45%)",
          }}
        />

        <div className="flex items-center gap-3 text-white">
          <span className="inline-flex h-10 w-10 items-center justify-center rounded-2xl bg-white/15 backdrop-blur">
            <BrandMark className="h-10 w-10" />
          </span>
          <Wordmark className="text-xl text-white [&_.text-gradient]:!bg-none [&_.text-gradient]:!text-white" />
        </div>

        <div className="max-w-md text-white">
          <HeroArt className="mb-8 w-full max-w-md drop-shadow-2xl" />
          <h2 className="text-3xl font-extrabold leading-tight tracking-tight xl:text-4xl">
            Every delivery, live on the map.
          </h2>
          <p className="mt-3 text-sm leading-relaxed text-white/85">
            CargoTrace turns each shipment into a shareable, real-time journey —
            from your warehouse to your customer&rsquo;s door.
          </p>
          <ul className="mt-6 space-y-3">
            {FEATURES.map((f) => (
              <li key={f} className="flex items-center gap-3 text-sm text-white/95">
                <span className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-white/20">
                  <Check className="h-3.5 w-3.5" strokeWidth={3} />
                </span>
                {f}
              </li>
            ))}
          </ul>
        </div>

        <p className="text-xs text-white/70">
          © {new Date().getFullYear()} CargoTrace · Live delivery tracking
        </p>
      </section>

      {/* ── Right: sign-in card ──────────────────────────────── */}
      <section className="relative flex items-center justify-center px-5 py-12">
        <div className="w-full max-w-sm">
          {/* Mobile brand */}
          <div className="mb-8 flex flex-col items-center text-center lg:hidden">
            <BrandMark className="mb-3 h-14 w-14" />
            <h1 className="text-2xl font-extrabold tracking-tight">
              <Wordmark />
            </h1>
            <p className="mt-1 inline-flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[2px] text-muted2">
              <MapPin className="h-3.5 w-3.5 text-primary" /> Live Delivery Tracking
            </p>
          </div>

          <div className="mb-6 hidden lg:block">
            <h1 className="text-2xl font-extrabold tracking-tight">Welcome back</h1>
            <p className="mt-1 text-sm text-muted2">
              Sign in to your operator console.
            </p>
          </div>

          <div
            className="ct-card p-6 sm:p-7"
            style={{ boxShadow: "var(--ct-shadow-pop)" }}
          >
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label htmlFor="email" className="ct-label">
                  Email
                </label>
                <input
                  id="email"
                  name="email"
                  type="email"
                  autoComplete="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="ct-input"
                  placeholder="you@company.com"
                />
              </div>

              <div>
                <label htmlFor="password" className="ct-label">
                  Password
                </label>
                <div className="relative">
                  <input
                    id="password"
                    name="password"
                    type={showPw ? "text" : "password"}
                    autoComplete="current-password"
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="ct-input pr-11"
                    placeholder="••••••••"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPw((v) => !v)}
                    aria-label={showPw ? "Hide password" : "Show password"}
                    className="absolute right-2 top-1/2 -translate-y-1/2 rounded-lg p-2 text-muted2 transition hover:bg-s2 hover:text-text"
                  >
                    {showPw ? (
                      <EyeOff className="h-4 w-4" />
                    ) : (
                      <Eye className="h-4 w-4" />
                    )}
                  </button>
                </div>
              </div>

              {error && (
                <p
                  role="alert"
                  className="rounded-xl border border-red/40 bg-red/10 px-3 py-2 text-xs font-medium text-red"
                >
                  {error}
                </p>
              )}

              <button
                type="submit"
                disabled={loading}
                className="ct-btn-primary w-full !py-3"
              >
                {loading ? (
                  <>
                    <Spinner /> Signing in…
                  </>
                ) : (
                  "Sign in"
                )}
              </button>
            </form>
          </div>

          <p className="mt-5 text-center text-[11px] text-muted">
            Accounts are created by your CargoTrace administrator.
          </p>
        </div>
      </section>
    </main>
  );
}
