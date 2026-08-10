import { SkHeading, SkBlock, SkPanel } from "@/components/Skeleton";

export default function Loading() {
  return (
    <div className="flex flex-col gap-4">
      <SkHeading />
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1.6fr_1fr]">
        <SkBlock className="h-[60vh] min-h-[280px] lg:h-[calc(100vh-16rem)]" />
        <SkPanel className="lg:max-h-[calc(100vh-16rem)]" />
      </div>
    </div>
  );
}
