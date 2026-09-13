"use client";

import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { toast } from "sonner";
import * as api from "./api";
import { queryKeys } from "@/lib/query-keys";
import { ApiError } from "@/lib/api-client";

/**
 * How many accounts the table asks for. The server caps this at 500; a hundred
 * is enough to scan and small enough that the page is not a report.
 */
export const USER_LIMIT = 100;

/**
 * Whether this session may see the panel at all.
 *
 * A non-admin gets a 404, which is the whole point: the answer to "is there an
 * admin dashboard here" has to be the same as the answer for a path that does
 * not exist. Callers read `notAdmin` and render a plain not-found page, never
 * a "you are not allowed" message, which would confirm the panel is real.
 *
 * Never retried. A 404 is not a flake, and retrying it would only make the
 * refusal slower.
 */
export function useAdminMe() {
  const query = useQuery({
    queryKey: queryKeys.admin.me(),
    queryFn: api.fetchAdminMe,
    retry: false,
    staleTime: Infinity,
  });

  const notAdmin =
    query.error instanceof ApiError && query.error.status === 404;

  return {
    ...query,
    notAdmin,
    /** An error that is not the refusal, so the page can say so plainly. */
    failed: query.isError && !notAdmin,
  };
}

/**
 * The same check, for the account menu.
 *
 * Separate from `useAdminMe` only in what it does with a failure: here there is
 * nothing to report, the link simply is not rendered. It shares the cache key,
 * so opening the menu and then the page costs one request, not two.
 */
export function useIsAdmin(): boolean {
  const { data } = useQuery({
    queryKey: queryKeys.admin.me(),
    queryFn: api.fetchAdminMe,
    retry: false,
    staleTime: Infinity,
  });

  return data !== undefined;
}

export function useAdminOverview(enabled: boolean) {
  return useQuery({
    queryKey: queryKeys.admin.overview(),
    queryFn: api.fetchOverview,
    enabled,
  });
}

/**
 * The windowed panels.
 *
 * All three keep the previous window on screen while the new one loads, so
 * changing the range dims the numbers rather than replacing the page with
 * skeletons and moving everything under the pointer.
 */
export function useSignups(days: number, enabled: boolean) {
  return useQuery({
    queryKey: queryKeys.admin.signups(days),
    queryFn: () => api.fetchSignups(days),
    enabled,
    placeholderData: keepPreviousData,
  });
}

export function useAiUsage(days: number, enabled: boolean) {
  return useQuery({
    queryKey: queryKeys.admin.ai(days),
    queryFn: () => api.fetchAiUsage(days),
    enabled,
    placeholderData: keepPreviousData,
  });
}

export function usePerformance(days: number, enabled: boolean) {
  return useQuery({
    queryKey: queryKeys.admin.performance(days),
    queryFn: () => api.fetchPerformance(days),
    enabled,
    placeholderData: keepPreviousData,
  });
}

export function useAdminUsers(enabled: boolean) {
  return useQuery({
    queryKey: queryKeys.admin.users(USER_LIMIT),
    queryFn: () => api.fetchUsers(USER_LIMIT),
    enabled,
  });
}

export function useAudit(enabled: boolean) {
  return useQuery({
    queryKey: queryKeys.admin.audit(),
    queryFn: api.fetchAudit,
    enabled,
  });
}

/**
 * The one write on the page.
 *
 * Deliberately not optimistic. The balance that comes back is the server's sum
 * over the ledger, and a table that guessed at it would be showing a number
 * nobody can reconcile against the audit row written beside it. The rows and
 * the log are refetched instead.
 */
export function useGrantCredits() {
  const client = useQueryClient();

  return useMutation({
    mutationFn: api.grantCredits,

    onSuccess: (result, body) => {
      toast.success(
        `${body.credits > 0 ? "Granted" : "Removed"} ${Math.abs(body.credits)} credits. The balance is now ${result.balance}.`,
      );
      void client.invalidateQueries({ queryKey: queryKeys.admin.usersAll() });
      void client.invalidateQueries({ queryKey: queryKeys.admin.audit() });
    },

    onError: (error: unknown) => {
      // A 4xx here is the server's own validation talking, and it says
      // something useful, such as which bound the amount broke.
      toast.error(
        error instanceof ApiError && error.status >= 400 && error.status < 500
          ? error.message
          : "Could not apply the grant. Try again in a moment.",
      );
    },
  });
}
