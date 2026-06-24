"use client";

import { useState } from "react";
import { LogOut } from "@/components/icons";

/** Logout control that asks for confirmation before ending the session. */
export default function LogoutButton() {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="ct-btn-ghost px-3 py-1.5 text-xs"
      >
        <LogOut className="h-3.5 w-3.5" />
        Logout
      </button>

      {open ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Confirm logout"
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
        >
          <button
            type="button"
            aria-label="Cancel"
            onClick={() => setOpen(false)}
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
                onClick={() => setOpen(false)}
                className="ct-btn-ghost px-3 py-2 text-sm"
              >
                Cancel
              </button>
              <form action="/api/auth/signout" method="post">
                <button
                  type="submit"
                  onClick={() => {
                    // Re-prompt the vehicle gate on the next driver login.
                    try {
                      sessionStorage.removeItem("ct_vehicle_ok");
                    } catch {
                      /* ignore */
                    }
                  }}
                  className="ct-btn-primary px-3 py-2 text-sm"
                >
                  <LogOut className="h-4 w-4" />
                  Log out
                </button>
              </form>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
