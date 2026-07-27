"use client";

import { useQuery } from "@tanstack/react-query";
import { getHealth } from "@/lib/api-client";

/**
 * The API's own health, including whether a queue worker is attached.
 *
 * Only worth asking while something is actually waiting to be indexed, which
 * is what `enabled` is for: a notebook whose sources are all READY has no
 * reason to poll this at all.
 */
export function useHealth(enabled: boolean) {
  return useQuery({
    queryKey: ["health"],
    queryFn: getHealth,
    enabled,
    // Slow, because the answer only changes when someone starts or stops a
    // process, and a wrong answer for twenty seconds costs nothing.
    refetchInterval: 20_000,
    staleTime: 10_000,
    retry: false,
  });
}
