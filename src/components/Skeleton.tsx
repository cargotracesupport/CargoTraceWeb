// Lightweight skeleton primitives for route loading states.
// `animate-pulse` is disabled under prefers-reduced-motion (see globals.css).

export function Sk({ className = "" }: { className?: string }) {
  return <div className={`animate-pulse rounded-md bg-s3 ${className}`} />;
}

/** Page heading placeholder (title + subtitle). */
export function SkHeading() {
  return (
    <div className="flex flex-col gap-2">
      <Sk className="h-5 w-40" />
      <Sk className="h-3 w-64 max-w-[70vw]" />
    </div>
  );
}

/** A grid of stat tiles. */
export function SkStats({ count = 4 }: { count?: number }) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="ct-card flex flex-col gap-2 p-5">
          <Sk className="h-3 w-16" />
          <Sk className="h-6 w-10" />
        </div>
      ))}
    </div>
  );
}

/** A list of card rows (deliveries, people, etc.). */
export function SkRows({ count = 4 }: { count?: number }) {
  return (
    <div className="flex flex-col gap-3">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="ct-card flex items-start justify-between gap-3 p-4">
          <div className="flex w-full flex-col gap-2">
            <Sk className="h-4 w-28" />
            <Sk className="h-3 w-2/3" />
            <Sk className="h-3 w-1/2" />
          </div>
          <Sk className="h-8 w-20 shrink-0 rounded-xl" />
        </div>
      ))}
    </div>
  );
}

/** A panel/card placeholder (e.g. a form or list container). */
export function SkPanel({ className = "" }: { className?: string }) {
  return (
    <div className={`ct-card flex flex-col gap-3 p-4 ${className}`}>
      <div className="flex items-center justify-between">
        <Sk className="h-4 w-24" />
        <Sk className="h-7 w-16 rounded-xl" />
      </div>
      <Sk className="h-3 w-full" />
      <Sk className="h-3 w-5/6" />
      <Sk className="h-3 w-2/3" />
    </div>
  );
}

/** A big map/placeholder block. */
export function SkBlock({ className = "h-72" }: { className?: string }) {
  return <Sk className={`w-full rounded-[var(--ct-radius-xl)] ${className}`} />;
}
