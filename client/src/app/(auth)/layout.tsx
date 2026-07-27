import { Wordmark } from "@/components/brand/wordmark";
import { ThemeToggle } from "@/components/theme-toggle";
import { ReadingBackdrop } from "@/components/auth/reading-backdrop";

/**
 * The form is the whole task, so it keeps a fixed, narrow column and never
 * competes for width. Beside it on a large screen sits one worked example of
 * what the product does, which is there because someone arriving from a link
 * rather than the landing page would otherwise be asked to create an account
 * for something they have never seen. It is the product's own output rather
 * than a claim about it, and it is dropped entirely below the large breakpoint,
 * where anything next to the form would only be something else to scroll past.
 */
export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="relative flex min-h-dvh flex-col overflow-hidden">
      <ReadingBackdrop />

      <header className="relative flex h-16 shrink-0 items-center px-6 lg:px-10">
        <Wordmark size="md" />
        {/* Someone who has never signed in is stuck with whatever their system
            chose, on the one page that has to feel like the product. */}
        <ThemeToggle className="ml-auto size-8" />
      </header>

      <main className="relative flex flex-1 items-start justify-center px-6 pt-4 pb-20 sm:items-center sm:pt-0 lg:px-10">
        <div className="grid w-full max-w-5xl gap-14 lg:grid-cols-[24rem_minmax(0,1fr)] lg:items-center lg:gap-20">
          {/* The card is what stops a short form reading as an unfinished page
              on a wide screen. It lifts off the paper ground rather than
              tinting it, which is the same rule every other surface follows. */}
          {/* Opaque and lifted, because it now sits over a moving ground: a
              translucent card would let a highlight sweep under the password
              field, which is the one place on the site that must be still. */}
          <div className="bg-card w-full max-w-sm justify-self-center rounded-xl border p-6 shadow-xl sm:p-8">
            {children}
          </div>

          <Evidence />
        </div>
      </main>
    </div>
  );
}

/**
 * One citation, drawn from the same example the landing page uses so the two
 * pages are visibly describing the same thing. The marker fill is doing its
 * only job here: it marks the span the sentence was actually taken from.
 */
function Evidence() {
  return (
    <aside className="hidden max-w-md lg:block">
      <p className="text-muted-foreground font-mono text-[0.7rem] tracking-[0.16em] uppercase">
        What you are signing into
      </p>

      <h2 className="mt-5 text-2xl leading-snug font-semibold text-balance">
        Every sentence carries a marker back to where it came from.
      </h2>

      <figure className="bg-card mt-8 rounded-xl border p-6 shadow-sm">
        <figcaption className="text-muted-foreground mb-4 font-mono text-[0.68rem] tracking-[0.12em] uppercase">
          An answer from your own sources
        </figcaption>

        <p className="font-serif text-[0.95rem] leading-relaxed">
          A write is committed only once{" "}
          <span className="marked">
            a majority of nodes have acknowledged it
          </span>
          <span
            className="text-primary ml-0.5 align-super font-mono text-[0.65rem] font-medium"
            aria-hidden
          >
            [1]
          </span>
        </p>

        <p className="text-muted-foreground mt-5 border-t pt-4 font-mono text-[0.7rem]">
          <span className="text-primary">[1]</span> consensus.pdf · page 7
        </p>
      </figure>

      <p className="border-destructive/40 text-destructive mt-8 border-l-2 py-1 pl-5 font-serif text-[0.95rem] leading-relaxed">
        I could not find this in your sources.
      </p>

      <p className="text-muted-foreground mt-3 pl-5 text-sm leading-relaxed">
        And when they cannot answer, that is what you get instead of a guess.
      </p>
    </aside>
  );
}
