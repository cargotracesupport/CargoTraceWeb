import { SkHeading, SkRows } from "@/components/Skeleton";

export default function Loading() {
  return (
    <div className="flex flex-col gap-4">
      <SkHeading />
      <SkRows count={6} />
    </div>
  );
}
