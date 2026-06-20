"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import Spinner from "@/components/Spinner";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const supabase = createClient();
    try {
      const { error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });
      if (error) {
        setError(error.message);
        return;
      }
      // Full navigation so the auth cookie is sent; root redirects by role.
      window.location.href = "/";
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="relative min-h-screen w-full overflow-hidden bg-bg flex items-center justify-center px-4 py-10">
      {/* Subtle control-panel grid backdrop */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-[0.35]"
        style={{
          backgroundImage:
            "linear-gradient(#0d1118 1px, transparent 1px), linear-gradient(90deg, #0d1118 1px, transparent 1px)",
          backgroundSize: "44px 44px",
          maskImage:
            "radial-gradient(ellipse 80% 60% at 50% 40%, #000 40%, transparent 100%)",
          WebkitMaskImage:
            "radial-gradient(ellipse 80% 60% at 50% 40%, #000 40%, transparent 100%)",
        }}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -top-32 left-1/2 h-72 w-72 -translate-x-1/2 rounded-full bg-green/10 blur-3xl"
      />

      <div className="relative w-full max-w-sm">
        {/* Branding */}
        <div className="mb-6 flex flex-col items-center text-center">
          <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-xl border border-border2 bg-s2 text-2xl shadow-lg shadow-black/40">
            <span aria-hidden>📡</span>
          </div>
          <h1 className="text-2xl font-bold tracking-tight">
            Cargo<span className="text-green">Trace</span>
          </h1>
          <p className="mt-1 text-xs font-medium uppercase tracking-[2px] text-muted2">
            Live Delivery Tracking
          </p>
        </div>

        <div className="ct-card p-5 sm:p-6 shadow-xl shadow-black/40">
          <h2 className="mb-5 text-center text-sm font-semibold text-text">
            Sign in to your account
          </h2>

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
              <input
                id="password"
                name="password"
                type="password"
                autoComplete="current-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="ct-input"
                placeholder="••••••••"
              />
            </div>

            {error && (
              <p className="rounded-md border border-red/40 bg-red/10 px-3 py-2 text-xs font-medium text-red">
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={loading}
              className="ct-btn-primary w-full"
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

        <p className="mt-4 text-center text-[11px] text-muted">
          Accounts are created by your CargoTrace administrator.
        </p>
      </div>
    </main>
  );
}
