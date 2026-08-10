import { SkHeading, SkPanel } from "@/components/Skeleton";

export default function Loading() {
  return (
    <div className="flex flex-col gap-4">
      <SkHeading />
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
        <SkPanel />
        <SkPanel />
        <SkPanel />
      </div>
    </div>
  );
}
