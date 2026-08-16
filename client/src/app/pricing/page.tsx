import type { Metadata } from "next";
import { SiteHeader } from "@/components/marketing/site-header";
import { SiteFooter } from "@/components/marketing/site-footer";
import { PlanTable } from "@/components/billing/plan-table";

export const metadata: Metadata = {
  title: "Pricing",
  description:
    "Plans for pragatiLM. Ask questions of your own documents, with every answer traced to the page it came from.",
};

/**
 * A server component so the title and description are real metadata rather than
 * something a crawler has to run JavaScript to see. Everything that needs a
 * session or a click lives in PlanTable, which is a client component.
 *
 * Outside the (app) group on purpose: this page has to work signed out, and that
 * group's layout redirects anyone without a session to sign in.
 */
export default function PricingPage() {
  return (
    <div className="flex min-h-dvh flex-col">
      <SiteHeader />

      <main className="flex-1">
        <section className="mx-auto w-full max-w-5xl px-6 py-16 sm:py-24">
          <div className="max-w-2xl">
            <p className="text-muted-foreground font-mono text-[0.7rem] tracking-[0.16em] uppercase">
              Pricing
            </p>
            <h1 className="mt-3 text-3xl font-medium tracking-tight text-balance sm:text-4xl">
              Pay for what you ask, not for a seat
            </h1>
            <p className="text-muted-foreground mt-4 text-base leading-relaxed">
              Every plan is a monthly allowance of credits. One credit is one
              answer, so the number you have left is the number of questions you
              can still ask.
            </p>
          </div>

          <PlanTable />
        </section>
      </main>

      <SiteFooter />
    </div>
  );
}
