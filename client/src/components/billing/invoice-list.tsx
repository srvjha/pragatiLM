"use client";

import { Skeleton } from "@/components/ui/skeleton";
import { useInvoices } from "@/features/billing/hooks";
import { rupees } from "@/features/billing/format";

const onDate = (iso: string) =>
  new Date(iso).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });

/**
 * What has actually been charged.
 *
 * Amounts come from the payment as the provider reported it, not from the plan's
 * price today: a receipt has to say what was taken, and a price that changed
 * since would quietly rewrite history on a screen people check precisely because
 * they are querying a charge.
 *
 * Hidden entirely when there is nothing to show. An empty "Payments" heading on
 * a free account is a section about a thing that has never happened.
 */
export function InvoiceList() {
  const { data, isPending } = useInvoices();

  if (isPending) return <Skeleton className="h-24 rounded-xl" />;
  if (!data || data.length === 0) return null;

  return (
    <section className="rounded-xl border p-6">
      <h2 className="font-medium">Payments</h2>

      <ul className="mt-4 text-sm">
        {data.map((payment) => (
          <li
            key={payment.id}
            className="flex items-baseline justify-between gap-4 border-b py-2 last:border-b-0"
          >
            <span className="text-muted-foreground">
              {onDate(payment.paidAt)}
            </span>
            <span className="text-muted-foreground flex-1 truncate capitalize">
              {payment.planCode}
            </span>
            <span className="shrink-0 font-medium tabular-nums">
              {payment.currency === "INR"
                ? rupees(payment.amountPaise)
                : `${payment.currency} ${(payment.amountPaise / 100).toFixed(2)}`}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
