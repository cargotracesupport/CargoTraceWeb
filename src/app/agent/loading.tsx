import { SkHeading, SkStats, SkRows } from "@/components/Skeleton";

export default function Loading() {
  return (
    <div className="flex flex-col gap-5">
      <SkHeading />
      <SkStats />
      <SkRows count={4} />
    </div>
  );
}
