// Aurora background — luminous, slowly-drifting gradient blobs behind the whole
// app. Fixed, non-interactive, theme-aware (colors come from CSS tokens).
// Respects prefers-reduced-motion (animation disabled via globals).
export default function AuroraBg() {
  return (
    <div
      aria-hidden
      className="pointer-events-none fixed inset-0 -z-10 overflow-hidden"
    >
      <div className="ct-aurora ct-aurora-1" />
      <div className="ct-aurora ct-aurora-2" />
      <div className="ct-aurora ct-aurora-3" />
      <div className="ct-aurora ct-aurora-4" />
      {/* subtle grain/vignette to ground the gradients */}
      <div className="absolute inset-0 [background:radial-gradient(120%_120%_at_50%_0%,transparent_55%,rgb(var(--c-bg)/0.6))]" />
    </div>
  );
}
