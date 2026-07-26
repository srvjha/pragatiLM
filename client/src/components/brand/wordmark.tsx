import Link from "next/link";
import { cn } from "@/lib/utils";

/**
 * The wordmark cites itself.
 *
 * The whole product is the claim that every statement carries a marker back to
 * where it came from, so the name wears one. It is set in the mono face, which
 * is the face this interface uses for every locator, and filled with the marker
 * colour, which is the colour it uses for every match. The mark is therefore an
 * example of the thing rather than a decoration of it.
 */
export function Wordmark({
  href = "/",
  className,
  size = "md",
}: {
  href?: string | null;
  className?: string;
  size?: "sm" | "md" | "lg";
}) {
  const content = (
    <span
      className={cn(
        "font-display inline-flex items-start font-semibold tracking-tight",
        size === "sm" && "text-sm",
        size === "md" && "text-base",
        size === "lg" && "text-2xl",
        className,
      )}
      style={{ fontVariationSettings: '"wdth" 90' }}
    >
      doChatLM
      <span
        className={cn(
          "marked font-mono leading-none font-medium",
          size === "sm" && "ml-0.5 text-[0.5rem]",
          size === "md" && "ml-0.5 text-[0.55rem]",
          size === "lg" && "ml-1 text-[0.7rem]",
        )}
        aria-hidden
      >
        [1]
      </span>
    </span>
  );

  if (!href) return content;

  return (
    <Link
      href={href}
      className="rounded-sm focus-visible:ring-2 focus-visible:outline-none"
    >
      {content}
    </Link>
  );
}
