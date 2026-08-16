"use client";

import { BillingSettings } from "@/components/billing/billing-settings";
import { AppShell } from "@/components/layout/app-shell";

/**
 * Inside the (app) group, so the session guard and the shell come for free and
 * the credit meter in the header stays where it is on every other screen.
 *
 * A client component rather than a server one: everything on the page is the
 * signed-in person's own state, which is fetched from the API with their cookie
 * and is not something to prerender.
 */
export default function BillingSettingsPage() {
  return (
    <AppShell>
      <div className="mx-auto w-full max-w-2xl px-6 py-10">
        <h1 className="text-xl font-medium tracking-tight">Plan and usage</h1>
        <BillingSettings />
      </div>
    </AppShell>
  );
}
