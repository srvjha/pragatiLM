"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Check, Loader2, Minus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  useBillingState,
  usePlans,
  useStartCheckout,
} from "@/features/billing/hooks";
import { credits, planLimits, rupees } from "@/features/billing/format";
import { useSession } from "@/lib/auth-client";
import type { PlanDto } from "@/types/api";

/**
 * The three plans, and what each credit buys.
 *
 * Reads the catalogue from the API rather than hardcoding it. Prices, allowances
 * and the credit weights all live in the server's billing module, and a second
 * copy here would be wrong the first time one of them changed — on the one page
 * where being wrong costs money.
 */
export function PlanTable() {
  const { data, isPending } = usePlans();
  const { data: state } = useBillingState();
  const { data: session } = useSession();
  const checkout = useStartCheckout();
  const params = useSearchParams();

  /**
   * Resumes a purchase that signing up interrupted.
   *
   * Somebody who picked Plus while signed out is sent to sign up, and without
   * this they come back to the same page and have to choose the same plan
   * again. The guard list is what stops the URL doing anything else: the plan
   * has to be one the API actually returned and one they are not already on,
   * and it fires once.
   */
  const wanted = params.get("plan");
  const resumed = useRef(false);

  useEffect(() => {
    if (resumed.current || !wanted || !session || !data?.billingEnabled) return;
    if (state?.plan.code === wanted) return;

    const plan = data.plans.find((entry) => entry.code === wanted);
    if (!plan || plan.pricePaise === 0) return;

    resumed.current = true;
    checkout.mutate(wanted);
  }, [wanted, session, data, state, checkout]);

  if (isPending || !data) {
    return (
      <div className="mt-12 grid gap-4 sm:grid-cols-3">
        {[0, 1, 2].map((index) => (
          <Skeleton key={index} className="h-80 rounded-xl" />
        ))}
      </div>
    );
  }

  const currentPlan = state?.plan.code ?? null;

  return (
    <>
      <div className="mt-12 grid items-start gap-4 sm:grid-cols-3">
        {data.plans.map((plan) => (
          <PlanCard
            key={plan.code}
            plan={plan}
            current={plan.code === currentPlan}
            signedIn={Boolean(session)}
            billingEnabled={data.billingEnabled}
            busy={checkout.isPending && checkout.variables === plan.code}
            onChoose={() => checkout.mutate(plan.code)}
          />
        ))}
      </div>

      <div className="mt-12 border-t pt-8">
        <h2 className="text-sm font-medium">What a credit buys</h2>
        <dl className="text-muted-foreground mt-4 grid gap-x-8 gap-y-2 text-sm sm:grid-cols-2">
          <Cost
            label="A question, answered with citations"
            value={data.creditCosts.chat}
          />
          <Cost label="Adding a source" value={data.creditCosts.source} />
          <Cost label="A learning roadmap" value={data.creditCosts.roadmap} />
          <Cost label="An audio overview" value={data.creditCosts.podcast} />
        </dl>
        <p className="text-muted-foreground mt-6 max-w-2xl text-sm leading-relaxed">
          An audio overview costs more because it genuinely costs more to make —
          several minutes of generated speech against a few seconds of reading.
          If a job fails, its credits go back.
        </p>
      </div>
    </>
  );
}

function Cost({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex items-baseline justify-between gap-4 border-b py-1.5">
      <dt>{label}</dt>
      <dd className="text-foreground shrink-0 font-medium tabular-nums">
        {credits(value)}
      </dd>
    </div>
  );
}

function PlanCard({
  plan,
  current,
  signedIn,
  billingEnabled,
  busy,
  onChoose,
}: {
  plan: PlanDto;
  current: boolean;
  signedIn: boolean;
  billingEnabled: boolean;
  busy: boolean;
  onChoose: () => void;
}) {
  const free = plan.pricePaise === 0;

  return (
    <div
      className={[
        "flex h-full flex-col rounded-xl border p-6",
        current ? "border-foreground/30 bg-muted/30" : "",
      ].join(" ")}
    >
      <div className="flex items-baseline justify-between gap-2">
        <h2 className="font-medium">{plan.name}</h2>
        {current && (
          <span className="text-muted-foreground text-xs font-medium">
            Your plan
          </span>
        )}
      </div>

      <p className="mt-1 text-2xl font-medium tracking-tight">
        {rupees(plan.pricePaise)}
        {!free && (
          <span className="text-muted-foreground text-sm font-normal">
            {" "}
            / month
          </span>
        )}
      </p>

      <p className="text-muted-foreground mt-3 text-sm leading-relaxed">
        {plan.blurb}
      </p>

      <ul className="mt-6 flex-1 space-y-2 text-sm">
        {planLimits(plan).map((line) => {
          const absent = line.startsWith("No ");
          return (
            <li key={line} className="flex items-start gap-2">
              {absent ? (
                <Minus className="text-muted-foreground/50 mt-0.5 size-3.5 shrink-0" />
              ) : (
                <Check className="text-muted-foreground mt-0.5 size-3.5 shrink-0" />
              )}
              <span className={absent ? "text-muted-foreground/70" : ""}>
                {line}
              </span>
            </li>
          );
        })}
      </ul>

      <div className="mt-6">
        <PlanAction
          plan={plan}
          free={free}
          current={current}
          signedIn={signedIn}
          billingEnabled={billingEnabled}
          busy={busy}
          onChoose={onChoose}
        />
      </div>
    </div>
  );
}

/**
 * The button, which has more states than it looks.
 *
 * A signed out visitor is sent to sign up rather than into a checkout that would
 * fail at the session check. And when no payment keys are configured the paid
 * plans say so plainly instead of offering a button that returns an error —
 * which is the state a fresh deployment is in until Razorpay is set up.
 */
function PlanAction({
  plan,
  free,
  current,
  signedIn,
  billingEnabled,
  busy,
  onChoose,
}: {
  plan: PlanDto;
  free: boolean;
  current: boolean;
  signedIn: boolean;
  billingEnabled: boolean;
  busy: boolean;
  onChoose: () => void;
}) {
  if (current) {
    return (
      <Button variant="outline" className="w-full" disabled>
        Current plan
      </Button>
    );
  }

  if (free) {
    return (
      <Button
        variant="outline"
        className="w-full"
        render={<Link href="/sign-up" />}
      >
        Start free
      </Button>
    );
  }

  if (!signedIn) {
    return (
      <Button
        className="w-full"
        render={<Link href={`/sign-up?plan=${plan.code}`} />}
      >
        Get {plan.name}
      </Button>
    );
  }

  if (!billingEnabled) {
    return (
      <Button variant="outline" className="w-full" disabled>
        Not available yet
      </Button>
    );
  }

  return (
    <Button className="w-full" onClick={onChoose} disabled={busy}>
      {busy && <Loader2 className="size-3.5 animate-spin" />}
      {busy ? "Opening checkout" : `Get ${plan.name}`}
    </Button>
  );
}
