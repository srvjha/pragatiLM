import type { Metadata } from "next";
import {
  Bricolage_Grotesque,
  Source_Serif_4,
  JetBrains_Mono,
} from "next/font/google";
import "./globals.css";
import { Providers } from "./providers";

/**
 * Three faces, each with a job, which is the rule the whole interface follows:
 * the grotesque is the machine speaking, the serif is the material speaking,
 * and the mono is a locator.
 *
 * Bricolage is variable on weight and optical size. Headings set it narrow,
 * which is where its character shows; at body sizes it stays quiet.
 */
const bricolage = Bricolage_Grotesque({
  variable: "--font-bricolage",
  subsets: ["latin"],
  axes: ["opsz"],
});

/** Answers and source text. A reading face, because this is a reading product. */
const sourceSerif = Source_Serif_4({
  variable: "--font-source-serif",
  subsets: ["latin"],
});

/** Page numbers, timestamps, scores and citation markers. */
const jetbrainsMono = JetBrains_Mono({
  variable: "--font-jetbrains",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: {
    default: "doChatLM",
    template: "%s · doChatLM",
  },
  description:
    "Ask questions answered only from your own sources, with a citation on every claim, and a plain refusal when the answer is not in them.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    // suppressHydrationWarning is required by next-themes, which sets the theme
    // class on this element before React hydrates.
    <html
      lang="en"
      suppressHydrationWarning
      className={`${bricolage.variable} ${sourceSerif.variable} ${jetbrainsMono.variable} h-full antialiased`}
    >
      <body className="flex min-h-full flex-col">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
