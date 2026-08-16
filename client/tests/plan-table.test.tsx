import { describe, expect, it, beforeEach, vi } from "vitest";
import { screen } from "@testing-library/react";
import { PlanTable } from "@/components/billing/plan-table";
import { billingState, renderWithQuery, stubFetch } from "./render";

/**
 * The sign-in state and the URL are both module-level in the real app, so they
 * are replaced rather than provided.
 */
const session = vi.hoisted(() => ({ current: null as unknown }));
const search = vi.hoisted(() => ({ params: new URLSearchParams() }));

vi.mock("@/lib/auth-client", () => ({
  useSession: () => ({ data: session.current, isPending: false }),
}));

vi.mock("next/navigation", () => ({
  useSearchParams: () => search.params,
}));

const CATALOGUE = {
  billingEnabled: true,
  creditCosts: { chat: 1, source: 1, roadmap: 3, podcast: 25 },
  plans: [
    {
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
    {
      code: "plus",
      name: "Plus",
      blurb: "For one person's documents, with audio overviews.",
      pricePaise: 39_900,
      monthlyCredits: 250,
      notebooks: 15,
      sourcesPerNotebook: 100,
      storageBytes: 2 * 1024 ** 3,
      podcasts: true,
    },
  ],
};

beforeEach(() => {
  session.current = null;
  search.params = new URLSearchParams();
});

function mount(
  catalogue: Record<string, unknown> = {},
  state?: Record<string, unknown>,
) {
  const routes: Record<string, unknown> = {
    "/billing/plans": { ...CATALOGUE, ...catalogue },
  };
  if (state) routes["/billing/me"] = billingState(state);

  vi.stubGlobal("fetch", stubFetch(routes));
  return renderWithQuery(<PlanTable />);
}

describe("the plan table", () => {
  it("renders the prices the API gave it, not its own copy", async () => {
    mount();

    expect(await screen.findByText("₹399")).toBeInTheDocument();

    // Twice on purpose: once as the plan's name and once as its price. Zero is
    // a word here, because "₹0 / month" reads like a charge of nothing rather
    // than the absence of one.
    expect(screen.getAllByText("Free")).toHaveLength(2);
    expect(screen.getByRole("heading", { name: "Free" })).toBeInTheDocument();
  });

  it("says what a credit buys, from the server's own weights", async () => {
    mount();

    expect(await screen.findByText("25 credits")).toBeInTheDocument();
    expect(screen.getByText("An audio overview")).toBeInTheDocument();
  });

  it("names an absent feature rather than omitting it", async () => {
    mount();
    expect(await screen.findByText("No audio overviews")).toBeInTheDocument();
  });

  it("sends a signed out visitor to sign up, carrying the plan", async () => {
    mount();

    const button = await screen.findByRole("link", { name: "Get Plus" });
    // Without the plan on the URL they would sign up and have to choose Plus a
    // second time, having already decided.
    expect(button).toHaveAttribute("href", "/sign-up?plan=plus");
  });

  it("marks the plan somebody is already on and does not offer it again", async () => {
    session.current = { user: { id: "u1" } };
    mount({}, { plan: { ...CATALOGUE.plans[1] } });

    expect(await screen.findByText("Your plan")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Current plan" })).toBeDisabled();
  });

  it("says so plainly when payments are not configured", async () => {
    session.current = { user: { id: "u1" } };
    mount({ billingEnabled: false }, {});

    // The state a fresh deployment is in. A button that returns an error would
    // be worse than one that admits it.
    expect(
      await screen.findByRole("button", { name: "Not available yet" }),
    ).toBeDisabled();
  });
});

describe("resuming a purchase after signing up", () => {
  it("opens checkout for the plan carried on the URL", async () => {
    session.current = { user: { id: "u1" } };
    search.params = new URLSearchParams("plan=plus");

    const fetchMock = stubFetch({
      "/billing/plans": CATALOGUE,
      "/billing/me": billingState(),
      "/billing/checkout": {
        subscriptionId: "sub_1",
        keyId: "key",
        shortUrl: "https://rzp/x",
      },
    });
    vi.stubGlobal("fetch", fetchMock);
    renderWithQuery(<PlanTable />);

    await screen.findByText("₹399");
    await vi.waitFor(() =>
      expect(
        fetchMock.mock.calls.some((call) =>
          String(call[0]).includes("/billing/checkout"),
        ),
      ).toBe(true),
    );
  });

  it("ignores a plan the API never offered", async () => {
    session.current = { user: { id: "u1" } };
    search.params = new URLSearchParams("plan=enterprise");

    const fetchMock = stubFetch({
      "/billing/plans": CATALOGUE,
      "/billing/me": billingState(),
    });
    vi.stubGlobal("fetch", fetchMock);
    renderWithQuery(<PlanTable />);

    await screen.findByText("₹399");
    // The URL is untrusted input. Anything not in the catalogue does nothing.
    expect(
      fetchMock.mock.calls.some((call) =>
        String(call[0]).includes("/billing/checkout"),
      ),
    ).toBe(false);
  });

  it("does not re-buy a plan somebody is already on", async () => {
    session.current = { user: { id: "u1" } };
    search.params = new URLSearchParams("plan=plus");

    const fetchMock = stubFetch({
      "/billing/plans": CATALOGUE,
      "/billing/me": billingState({ plan: { ...CATALOGUE.plans[1] } }),
    });
    vi.stubGlobal("fetch", fetchMock);
    renderWithQuery(<PlanTable />);

    await screen.findByText("Your plan");
    expect(
      fetchMock.mock.calls.some((call) =>
        String(call[0]).includes("/billing/checkout"),
      ),
    ).toBe(false);
  });

  it("does nothing for a signed out visitor", async () => {
    search.params = new URLSearchParams("plan=plus");

    const fetchMock = stubFetch({ "/billing/plans": CATALOGUE });
    vi.stubGlobal("fetch", fetchMock);
    renderWithQuery(<PlanTable />);

    await screen.findByText("₹399");
    expect(
      fetchMock.mock.calls.some((call) =>
        String(call[0]).includes("/billing/checkout"),
      ),
    ).toBe(false);
  });
});
