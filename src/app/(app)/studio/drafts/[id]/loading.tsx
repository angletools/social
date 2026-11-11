import { CardSkeleton } from "@/components/states";

export default function Loading() {
  return (
    <div className="mx-auto flex w-full max-w-[960px] flex-col gap-5">
      <span className="skeleton h-5 w-24" />
      <span className="skeleton h-8 w-2/3" />
      <CardSkeleton variant="list" rows={2} />
      <CardSkeleton variant="chart" />
    </div>
  );
}
