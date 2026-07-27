import { Skeleton } from "@/components/ui/skeleton";

/**
 * What the prerendered page shows before the form takes over.
 *
 * It carries the real heading rather than a grey block, because that text is
 * known at build time and is the one thing that tells someone the page they
 * asked for is the page that is loading.
 *
 * Every measurement below is the real one: the same spacing scale, the same
 * control height, the same number of fields for the mode, and each grey bar
 * sitting inside a box the height of the line box it stands in. The form
 * replaces this in a frame or two, and anything that did not line up would show
 * up as a twitch at the exact moment someone is looking at it.
 */
export function AuthFormSkeleton({ mode }: { mode: "sign-in" | "sign-up" }) {
  return (
    <div className="space-y-7">
      <div className="space-y-2">
        <h1 className="text-[1.65rem] leading-tight font-semibold">
          {mode === "sign-in" ? "Sign in" : "Create an account"}
        </h1>

        {/* The two ledes differ in length enough to wrap differently. */}
        <div>
          <LedeLine className="w-56" />
          {mode === "sign-up" && <LedeLine className="w-40" />}
        </div>
      </div>

      <div className="space-y-4">
        {mode === "sign-up" && <FieldSkeleton labelWidth="w-11" />}
        <FieldSkeleton labelWidth="w-10" />
        <FieldSkeleton labelWidth="w-16" hint={mode === "sign-up"} />

        <Skeleton className="h-10 w-full rounded-lg" />
      </div>

      <div className="border-t pt-5">
        <div className="flex h-5 items-center">
          <Skeleton className="h-3.5 w-44" />
        </div>
      </div>
    </div>
  );
}

/** One line of the lede, in a box the height of a `text-sm leading-relaxed` line. */
function LedeLine({ className }: { className: string }) {
  return (
    <div className="flex h-[1.42rem] items-center">
      <Skeleton className={`h-3.5 ${className}`} />
    </div>
  );
}

function FieldSkeleton({
  labelWidth,
  hint = false,
}: {
  labelWidth: string;
  hint?: boolean;
}) {
  return (
    <div className="space-y-1.5">
      <div className="flex h-5 items-center">
        <Skeleton className={`h-3 ${labelWidth}`} />
      </div>
      <Skeleton className="h-10 w-full rounded-lg" />
      {hint && (
        <div className="flex h-4 items-center">
          <Skeleton className="h-2.5 w-28" />
        </div>
      )}
    </div>
  );
}
