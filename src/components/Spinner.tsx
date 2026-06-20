// Small inline spinner. Inherits color from `currentColor`, so it works on any
// button or surface. Size via className (e.g. "h-8 w-8").
export default function Spinner({
  className = "h-4 w-4",
}: {
  className?: string;
}) {
  return (
    <span
      role="status"
      aria-label="Loading"
      className={`inline-block animate-spin rounded-full border-2 border-current border-t-transparent ${className}`}
    />
  );
}
