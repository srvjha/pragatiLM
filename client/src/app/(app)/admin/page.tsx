"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowLeft, Loader2, RefreshCw } from "lucide-react";
import { AppShell } from "@/components/layout/app-shell";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Panel, PanelError } from "@/components/admin/panel";
import {
  OverviewSkeleton,
  OverviewTiles,
} from "@/components/admin/overview-tiles";
import { GrowthChart } from "@/components/admin/growth-chart";
import { UsersTable } from "@/components/admin/users-table";
import { CostDonut } from "@/components/admin/cost-donut";
import { AiUsage } from "@/components/admin/ai-usage";
import { PerformanceTable } from "@/components/admin/performance-table";
import { AuditLog } from "@/components/admin/audit-log";
import {
  useAdminMe,
  useAdminOverview,
  useAdminUsers,
  useAiUsage,
  useAudit,
  usePerformance,
  useSignups,
} from "@/features/admin/hooks";
import { cn } from "@/lib/utils";

/**
 * The admin dashboard.
 *
 * Three states, and the middle one is the reason the page is written this way.
 * `/admin/me` answers 404 for anybody who is not an admin, exactly as it would
 * for a path that does not exist, and this page has to keep that promise: the
 * refusal renders the same not found page a wrong URL would, with no mention of
 * an admin panel, no "you do not have access", and no layout around it that
 * would reveal there was something here to be refused. Nothing else is
 * requested until that call succeeds.
 *
 * The layout runs top to bottom in order of how often it is read: the headline
 * figures first, then the range control, then everything the range scopes. The
 * tiles sit above the control on purpose, because they come from fixed server
 * side windows and each band names its own; a filter that appeared to scope
 * them without doing so would be worse than no filter.
 */

/** The windows the range control offers. The API caps performance at 90 days. */
const WINDOWS = [7, 30, 90] as const;

export default function AdminPage() {
  const me = useAdminMe();
  const [days, setDays] = useState<number>(30);

  const enabled = me.data !== undefined;
  const overview = useAdminOverview(enabled);
  const signups = useSignups(days, enabled);
  const users = useAdminUsers(enabled);
  const ai = useAiUsage(days, enabled);
  const performance = usePerformance(days, enabled);
  const audit = useAudit(enabled);

  // The refusal, and the only thing this route says to anybody who is not an
  // admin. Deliberately outside the app frame: a rail and a header would tell a
  // stranger that the path resolves to something.
  if (me.notAdmin) return <NotFound />;

  if (me.isPending) {
    return (
      <div className="flex min-h-dvh items-center justify-center">
        <Loader2 className="text-muted-foreground size-5 animate-spin motion-reduce:animate-none" />
        <span className="sr-only">Loading</span>
      </div>
    );
  }

  const refreshing =
    overview.isFetching ||
    signups.isFetching ||
    users.isFetching ||
    ai.isFetching ||
    performance.isFetching ||
    audit.isFetching;

  function refreshAll() {
    void overview.refetch();
    void signups.refetch();
    void users.refetch();
    void ai.refetch();
    void performance.refetch();
    void audit.refetch();
  }

  return (
    <AppShell rail={false}>
      <div className="mx-auto max-w-7xl px-6 py-10">
        <header className="mb-9">
          <Button
            variant="ghost"
            size="sm"
            nativeButton={false}
            className="text-muted-foreground -ml-2.5 mb-4"
            render={
              <Link href="/notebooks">
                <ArrowLeft />
                Notebooks
              </Link>
            }
          />

          <div className="flex flex-wrap items-start justify-between gap-x-8 gap-y-4">
            <div>
              <h1 className="text-2xl font-semibold">Admin</h1>
              <p className="text-muted-foreground mt-2 max-w-xl font-serif text-sm leading-relaxed">
                Every account on this deployment, what it is doing, and what it
                costs to serve. Read only apart from granting credits, and every
                grant is logged.
              </p>
            </div>

            <div className="flex shrink-0 items-center gap-3">
              {me.data && (
                <span className="text-muted-foreground hidden font-mono text-xs sm:inline">
                  {me.data.email}
                </span>
              )}
              <Button
                variant="outline"
                size="sm"
                onClick={refreshAll}
                disabled={refreshing}
                className="text-muted-foreground"
              >
                <RefreshCw
                  className={cn(
                    "size-3.5",
                    refreshing && "animate-spin motion-reduce:animate-none",
                  )}
                />
                Refresh
              </Button>
            </div>
          </div>
        </header>

        {me.failed && (
          <PanelError>
            Could not load the dashboard. Reload to try again.
          </PanelError>
        )}

        {!me.failed && (
          <div className="space-y-10">
            {overview.isPending && <OverviewSkeleton />}
            {overview.isError && (
              <PanelError>
                Could not load the headline figures. Refresh to try again.
              </PanelError>
            )}
            {overview.data && <OverviewTiles data={overview.data} />}

            {/*
              One range control, in one row, scoping everything below it, so
              the growth chart, the spend breakdown and the route timings are
              always describing the same slice of time.
            */}
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-t pt-6">
              <div
                role="group"
                aria-label="Time window"
                className="bg-muted inline-flex h-8 items-center rounded-lg p-[3px]"
              >
                {WINDOWS.map((window) => (
                  <button
                    key={window}
                    type="button"
                    aria-pressed={days === window}
                    onClick={() => setDays(window)}
                    className={cn(
                      "focus-visible:ring-ring/50 h-full rounded-md px-2.5 text-xs font-medium transition-colors focus-visible:ring-2 focus-visible:outline-none",
                      days === window
                        ? "bg-card text-foreground"
                        : "text-muted-foreground hover:text-foreground",
                    )}
                  >
                    Last {window} days
                  </button>
                ))}
              </div>
              <p className="text-muted-foreground font-serif text-xs">
                Applies to growth, AI usage and API performance. The figures
                above use their own fixed windows.
              </p>
            </div>

            <Panel
              id="users"
              title="Users"
              blurb="Newest first. Any column sorts."
              aside={`${users.data?.length ?? 0} shown`}
              dimmed={users.isFetching && users.data !== undefined}
            >
              {users.isPending && <Skeleton className="h-80 rounded-xl" />}
              {users.isError && (
                <PanelError>
                  Could not load the accounts. Refresh to try again.
                </PanelError>
              )}
              {users.data && <UsersTable rows={users.data} />}
            </Panel>

            <Panel
              id="growth"
              title="Growth"
              blurb="Signups against the people who came back."
              aside={`Last ${days} days`}
              dimmed={signups.isFetching && signups.data !== undefined}
            >
              {signups.isPending && <Skeleton className="h-72 rounded-xl" />}
              {signups.isError && (
                <PanelError>
                  Could not load the growth series. Refresh to try again.
                </PanelError>
              )}
              {signups.data && (
                <GrowthChart points={signups.data} days={days} />
              )}
            </Panel>

            <Panel
              id="ai"
              title="AI usage"
              blurb="Estimated cost and tokens, by feature."
              aside={`Last ${days} days`}
              dimmed={ai.isFetching && ai.data !== undefined}
            >
              {ai.isPending && <Skeleton className="h-64 rounded-xl" />}
              {ai.isError && (
                <PanelError>
                  Could not load model usage. Refresh to try again.
                </PanelError>
              )}
              {ai.data && (
                <div className="space-y-6">
                  {/* The donut answers "what is driving the bill" at a glance.
                      The table under it carries the numbers, and carries the
                      features the donut folded into Other, which would
                      otherwise lose their values entirely. */}
                  <CostDonut
                    rows={ai.data}
                    pricesUpdated={overview.data?.ai.pricesUpdated ?? "-"}
                  />
                  <AiUsage
                    rows={ai.data}
                    days={days}
                    pricesUpdated={overview.data?.ai.pricesUpdated ?? null}
                  />
                </div>
              )}
            </Panel>

            <Panel
              id="performance"
              title="API performance"
              blurb="Slowest routes first, by p95."
              aside={`Last ${days} days`}
              dimmed={performance.isFetching && performance.data !== undefined}
            >
              {performance.isPending && (
                <Skeleton className="h-72 rounded-xl" />
              )}
              {performance.isError && (
                <PanelError>
                  Could not load route timings. Refresh to try again.
                </PanelError>
              )}
              {performance.data && (
                <PerformanceTable rows={performance.data} days={days} />
              )}
            </Panel>

            <Panel
              id="audit"
              title="Audit log"
              blurb="What admins have done, newest first."
              dimmed={audit.isFetching && audit.data !== undefined}
            >
              {audit.isPending && <Skeleton className="h-40 rounded-xl" />}
              {audit.isError && (
                <PanelError>
                  Could not load the audit log. Refresh to try again.
                </PanelError>
              )}
              {audit.data && <AuditLog rows={audit.data} />}
            </Panel>
          </div>
        )}
      </div>
    </AppShell>
  );
}

/**
 * The page a non admin gets. It says what a wrong URL says and nothing else:
 * no heading that names the panel, no explanation, no link that only an admin
 * would be offered.
 */
function NotFound() {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-3 px-6 text-center">
      <h1 className="font-mono text-sm font-medium tracking-[0.12em] uppercase">
        404
      </h1>
      <p className="text-muted-foreground font-serif text-sm">
        This page could not be found.
      </p>
      <Button
        variant="ghost"
        size="sm"
        nativeButton={false}
        className="text-muted-foreground mt-2"
        render={<Link href="/notebooks">Back to your notebooks</Link>}
      />
    </div>
  );
}
