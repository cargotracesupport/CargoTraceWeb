import { SkHeading, SkRows } from "@/components/Skeleton";

export default function Loading() {
  return (
    <div className="flex flex-col gap-5">
      <SkHeading />
      <SkRows count={4} />
    </div>
  );
}
