import { vi } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render } from "@testing-library/react";
import type { ReactElement } from "react";

/**
 * Renders inside a fresh query client.
 *
 * Fresh per test, because a shared cache would let one test's fixture answer
 * another test's query and pass for the wrong reason. Retries are off so a
 * deliberate failure fails once instead of after three timeouts.
 */
export function renderWithQuery(ui: ReactElement) {
  const client = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0 },
      mutations: { retry: false },
    },
  });

  return render(
    <QueryClientProvider client={client}>{ui}</QueryClientProvider>,
  );
}

/** A billing state the tests can vary one field of. */
export function billingState(overrides: Record<string, unknown> = {}) {
  return {
    plan: {
      code: "free",
      name: "Free",
      blurb: "Enough to see whether it answers your questions.",
      pricePaise: 0,
      monthlyCredits: 25,
      notebooks: 2,
      sourcesPerNotebook: 5,
      storageBytes: 25 * 1024 ** 2,
      podcasts: false,
    },
    balance: 25,
    periodStart: "2026-08-01T00:00:00.000Z",
    periodEnd: "2026-09-01T00:00:00.000Z",
    subscription: null,
    ...overrides,
  };
}

/**
 * Answers fetch with one JSON envelope per URL fragment.
 *
 * The api client wraps everything in { data }, so the fixtures are written as
 * the payload and wrapped here — a test that had to remember the envelope would
 * be testing the envelope.
 */
export function stubFetch(routes: Record<string, unknown>) {
  return vi.fn((input: RequestInfo | URL): Promise<Response> => {
    const url = String(input);
    const match = Object.keys(routes).find((path) => url.includes(path));

    if (!match) {
      return Promise.resolve(
        new Response(
          JSON.stringify({ error: { code: "NOT_FOUND", message: "no stub" } }),
          {
            status: 404,
            headers: { "Content-Type": "application/json" },
          },
        ),
      );
    }

    return Promise.resolve(
      new Response(JSON.stringify({ data: routes[match] }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
  });
}
