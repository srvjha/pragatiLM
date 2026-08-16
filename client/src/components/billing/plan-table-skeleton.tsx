import { Skeleton } from "@/components/ui/skeleton";

/**
 * The shape of the plans before they arrive.
 *
 * Three cards rather than a spinner, because the page is prerendered and this is
 * what a reader sees first: a spinner would say "wait", where the outline
 * already says "there are three plans here".
 */
export function PlanTableSkeleton() {
  return (
    <div className="mt-12 grid gap-4 sm:grid-cols-3">
      {[0, 1, 2].map((index) => (
        <Skeleton key={index} className="h-80 rounded-xl" />
      ))}
    </div>
  );
}
