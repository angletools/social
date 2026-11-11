import { CardSkeleton } from "@/components/states";

export default function Loading() {
  return (
    <div className="mx-auto flex max-w-[1180px] flex-col gap-6 lg:gap-8">
      <span className="skeleton h-8 w-40" />
      <div className="grid items-start gap-6 lg:grid-cols-[200px_minmax(0,1fr)] lg:gap-12">
        <div className="hidden flex-col gap-2 lg:flex">
          {Array.from({ length: 8 }, (_, i) => (
            <span key={i} className="skeleton h-5 w-32" />
          ))}
        </div>
        <div className="flex flex-col gap-5">
          <CardSkeleton variant="list" rows={3} />
          <CardSkeleton variant="list" rows={2} />
        </div>
      </div>
    </div>
  );
}
