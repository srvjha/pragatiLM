import { Skeleton } from "@/components/ui/skeleton";

/**
 * What the prerendered page shows before the form takes over.
 *
 * It carries the real heading rather than a grey block, because that text is
 * known at build time and is the one thing that tells someone the page they
 * asked for is the page that is loading.
 */
export function AuthFormSkeleton({ mode }: { mode: "sign-in" | "sign-up" }) {
  return (
    <div className="space-y-6">
      <div className="space-y-1.5">
        <h1 className="text-2xl font-semibold">
          {mode === "sign-in" ? "Sign in" : "Create an account"}
        </h1>
        <Skeleton className="h-4 w-56" />
      </div>

      <div className="space-y-3">
        <Skeleton className="h-9 w-full" />
        <Skeleton className="h-9 w-full" />
        <Skeleton className="h-9 w-full" />
      </div>
    </div>
  );
}
