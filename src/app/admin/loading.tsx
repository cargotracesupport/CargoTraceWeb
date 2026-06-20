import Spinner from "@/components/Spinner";

export default function Loading() {
  return (
    <div className="flex flex-1 items-center justify-center py-24">
      <Spinner className="h-8 w-8 text-green" />
    </div>
  );
}
