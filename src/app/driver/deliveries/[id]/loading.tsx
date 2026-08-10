import { Sk, SkPanel, SkBlock } from "@/components/Skeleton";

export default function Loading() {
  return (
    <div className="flex flex-col gap-4">
      <Sk className="h-3 w-32" />
      <SkPanel />
      <SkBlock className="h-[300px]" />
    </div>
  );
}
