"use client";

import { useEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import Spinner from "@/components/Spinner";

/**
 * Shared confirmation modal — same look and behaviour as the logout dialog in
 * ProfileMenu (centered card over a blurred backdrop, Cancel + confirm). Used
 * for delete / destructive actions instead of the browser's window.confirm.
 *
 * Controlled: the parent holds `open` and provides onConfirm / onCancel. Set
 * `busy` while the action runs to disable the buttons and show a spinner.
 */
export default function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  danger = false,
  busy = false,
  icon,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: string;
  message?: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
  busy?: boolean;
  icon?: ReactNode;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !busy) onCancel();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, busy, onCancel]);

  if (!open || !mounted) return null;

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label={title}
      className="fixed inset-0 z-[80] flex items-center justify-center p-4"
    >
      <button
        type="button"
        aria-label={cancelLabel}
        onClick={() => !busy && onCancel()}
        className="absolute inset-0 cursor-default bg-black/40 backdrop-blur-sm"
      />
      <div
        className="ct-card relative w-full max-w-xs p-5"
        style={{ boxShadow: "var(--ct-shadow-pop)" }}
      >
        <h2 className="text-base font-semibold tracking-tight">{title}</h2>
        {message ? (
          <p className="mt-1 text-sm text-muted2">{message}</p>
        ) : null}
        <div className="mt-4 flex justify-end gap-2">
          <button
            type="button"
            disabled={busy}
            onClick={onCancel}
            className="ct-btn-ghost px-3 py-2 text-sm"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={onConfirm}
            className={`${danger ? "ct-btn-danger" : "ct-btn-primary"} px-3 py-2 text-sm`}
          >
            {busy ? <Spinner /> : icon}
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
