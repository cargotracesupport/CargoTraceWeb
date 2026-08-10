import { SkHeading, SkPanel } from "@/components/Skeleton";

export default function Loading() {
  return (
    <div className="flex flex-col gap-4">
      <SkHeading />
      <div className="max-w-md">
        <SkPanel />
      </div>
    </div>
  );
}
