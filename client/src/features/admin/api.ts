import { apiFetch } from "@/lib/api-client";

/**
 * The admin dashboard's read layer.
 *
 * Every path here is refused with a 404 rather than a 403 when the caller is
 * not an admin, so a stranger cannot learn that the panel exists by watching
 * status codes. The client has to treat 404 as "no such page" for the same
 * reason, which is why `fetchAdminMe` is the gate every other call waits on.
 *
 * The shapes mirror server/src/services/admin.service.ts.
 */

export type AdminIdentity = { email: string; name: string };

export type AdminOverview = {
  users: {
    total: number;
    newToday: number;
    newThisWeek: number;
    activeThisWeek: number;
  };
  usage: {
    questions: number;
    sources: number;
    roadmaps: number;
    podcasts: number;
  };
  ai: {
    calls: number;
    totalTokens: number;
    /**
     * Rupees, derived from published list prices rather than from a bill. The
     * UI must never present it as one, which is what `pricesUpdated` is for.
     */
    costRupees: number;
    /** The day the price table was last edited, as an ISO date. */
    pricesUpdated: string;
  };
  api: {
    requests: number;
    /** 5xx over total. A refusal or a 402 is the product working. */
    errorRate: number;
    p50: number;
    p95: number;
    p99: number;
  };
  revenue: { payingUsers: number; monthlyRupees: number };
};

export type SignupPoint = { day: string; signups: number; active: number };

export type AdminUserRow = {
  id: string;
  name: string;
  email: string;
  createdAt: string;
  plan: string;
  /**
   * A proxy, not a stopwatch: the span between the first and last request in
   * each hour, summed. It cannot see someone reading for ten minutes without
   * clicking. Every surface that prints it has to say so.
   */
  minutesSpent: number;
  questions: number;
  sources: number;
  tokens: number;
  costRupees: number;
  lastSeen: string | null;
};

export type FeatureUsage = {
  feature: string;
  calls: number;
  tokens: number;
  costRupees: number;
};

export type RoutePerformance = {
  route: string;
  method: string;
  requests: number;
  errorRate: number;
  p50: number;
  p95: number;
  p99: number;
  maxMs: number;
};

export type AuditRow = {
  id: string;
  actorEmail: string;
  action: string;
  subjectEmail: string | null;
  detail: string;
  createdAt: string;
};

export type GrantBody = {
  userId: string;
  /** Bounded at a thousand either way by the server, and never zero. */
  credits: number;
  note: string;
};

export function fetchAdminMe(): Promise<AdminIdentity> {
  return apiFetch<AdminIdentity>("/admin/me");
}

export function fetchOverview(): Promise<AdminOverview> {
  return apiFetch<AdminOverview>("/admin/overview");
}

export function fetchSignups(days: number): Promise<SignupPoint[]> {
  return apiFetch<SignupPoint[]>(`/admin/signups?days=${days}`);
}

export function fetchUsers(limit: number): Promise<AdminUserRow[]> {
  return apiFetch<AdminUserRow[]>(`/admin/users?limit=${limit}`);
}

export function fetchAiUsage(days: number): Promise<FeatureUsage[]> {
  return apiFetch<FeatureUsage[]>(`/admin/ai?days=${days}`);
}

export function fetchPerformance(days: number): Promise<RoutePerformance[]> {
  return apiFetch<RoutePerformance[]>(`/admin/performance?days=${days}`);
}

export function fetchAudit(): Promise<AuditRow[]> {
  return apiFetch<AuditRow[]>("/admin/audit");
}

export function grantCredits(body: GrantBody): Promise<{ balance: number }> {
  return apiFetch<{ balance: number }>("/admin/grant", {
    method: "POST",
    body: JSON.stringify(body),
  });
}
