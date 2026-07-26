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
        <div className="w-full max-w-sm">{children}</div>
      </main>
    </div>
  );
}
