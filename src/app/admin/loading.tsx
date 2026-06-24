import { SkHeading, SkStats, SkBlock, SkRows } from "@/components/Skeleton";

export default function Loading() {
  return (
    <div className="flex flex-col gap-5">
      <SkHeading />
      <SkStats />
      <SkBlock className="h-[40vh] min-h-[280px]" />
      <SkRows count={3} />
    </div>
  );
}
