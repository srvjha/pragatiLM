import Link from "next/link";
import { Wordmark } from "@/components/brand/wordmark";

/**
 * The footer.
 *
 * Every destination here is one this product actually has. A footer padded out
 * with Careers, Press and Changelog links that go nowhere is the first thing
 * that tells a visitor the rest of the page might be padding too.
 */
const columns = [
  {
    heading: "The product",
    links: [
      { label: "How it works", href: "/#how" },
      { label: "Kinds of source", href: "/#sources" },
      { label: "What it refuses", href: "/#refusal" },
    ],
  },
  {
    heading: "Your work",
    links: [
      { label: "Your notebooks", href: "/notebooks" },
      { label: "Dashboard", href: "/dashboard" },
    ],
  },
  {
    heading: "Account",
    links: [
      { label: "Sign in", href: "/sign-in" },
      { label: "Create an account", href: "/sign-up" },
    ],
  },
];

export function SiteFooter() {
  return (
    <footer className="seam mt-auto">
      <div className="mx-auto max-w-6xl px-6 py-14">
        <div className="grid gap-10 sm:grid-cols-2 lg:grid-cols-[1.4fr_repeat(3,1fr)]">
          <div className="max-w-xs">
            <Wordmark href="/" size="md" />
            <p className="text-muted-foreground mt-4 font-serif text-sm leading-relaxed">
              A research notebook that answers only from the sources you give
              it, and shows you the page, paragraph or second behind every
              sentence.
            </p>
          </div>

          {columns.map((column) => (
            <nav key={column.heading} aria-label={column.heading}>
              <h2 className="text-muted-foreground font-mono text-[0.65rem] tracking-[0.16em] uppercase">
                {column.heading}
              </h2>
              <ul className="mt-4 space-y-2.5">
                {column.links.map((link) => (
                  <li key={link.href}>
                    <Link
                      href={link.href}
                      className="text-muted-foreground hover:text-foreground focus-visible:ring-ring rounded-sm text-sm transition-colors focus-visible:ring-2 focus-visible:outline-none"
                    >
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </nav>
          ))}
        </div>

        <div className="text-muted-foreground mt-12 flex flex-col gap-3 border-t pt-6 text-xs sm:flex-row sm:items-center">
          <p>© {new Date().getFullYear()} pragatiLM</p>
          <p className="sm:ml-auto">
            Notebooks are private to the account that made them.
          </p>
        </div>
      </div>
    </footer>
  );
}
