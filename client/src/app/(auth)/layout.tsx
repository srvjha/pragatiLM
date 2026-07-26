import { Wordmark } from "@/components/brand/wordmark";

/**
 * A single column, because signing in is one task and a marketing panel beside
 * it would be something else to read at the moment someone is trying to get
 * past this screen.
 */
export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="flex h-16 shrink-0 items-center px-6">
        <Wordmark size="md" />
      </header>

      <main className="flex flex-1 items-start justify-center px-6 pt-8 pb-20 sm:items-center sm:pt-0">
        {/* The card is what stops a short form reading as an unfinished page on
            a wide screen. It lifts off the paper ground rather than tinting it,
            which is the same rule every other surface follows. */}
        <div className="bg-card w-full max-w-sm rounded-lg border p-6 shadow-sm sm:p-8">
          {children}
        </div>
      </main>
    </div>
  );
}
