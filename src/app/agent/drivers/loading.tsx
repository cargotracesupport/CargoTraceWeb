import { SkHeading, SkPanel } from "@/components/Skeleton";

export default function Loading() {
  return (
    <div className="flex flex-col gap-4">
      <SkHeading />
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <SkPanel />
        <SkPanel />
      </div>
    </div>
  );
}
