import { describe, expect, it, beforeEach, vi } from "vitest";
import { screen } from "@testing-library/react";
import { CreditWall } from "@/components/billing/credit-wall";
import { creditRefusal } from "@/features/billing/hooks";
import { ApiError } from "@/lib/api-client";
import { useUiStore } from "@/stores/ui-store";
import { billingState, renderWithQuery, stubFetch } from "./render";

beforeEach(() => {
  useUiStore.setState({ refusal: null });
  vi.useFakeTimers({ shouldAdvanceTime: true });
  vi.setSystemTime(new Date("2026-08-16T10:00:00Z"));
  vi.stubGlobal(
    "fetch",
    stubFetch({ "/billing/me": billingState({ balance: 0 }) }),
  );
});

const refuse = (code: string, message: string, details?: unknown) =>
  creditRefusal(
    new ApiError(code === "PLAN_REQUIRED" ? 403 : 402, {
      code,
      message,
      details,
    }),
  );

describe("reading a refusal", () => {
  it("recognises the two credit refusals and nothing else", () => {
    expect(refuse("INSUFFICIENT_CREDITS", "out")?.kind).toBe("insufficient");
    expect(refuse("PLAN_REQUIRED", "nope")?.kind).toBe("not-on-plan");

    // A duplicate upload or a validation failure is not a money problem, and
    // showing an upgrade dialog for one would be nonsense.
    expect(refuse("CONFLICT", "duplicate")).toBeNull();
    expect(creditRefusal(new Error("boom"))).toBeNull();
  });

  it("carries the server's numbers through rather than recomputing them", () => {
    const refusal = refuse("INSUFFICIENT_CREDITS", "out", {
      action: "podcast",
      plan: "free",
      balance: 3,
      needed: 25,
    });

    expect(refusal?.details?.needed).toBe(25);
    expect(refusal?.details?.balance).toBe(3);
  });
});

describe("the credit wall", () => {
  it("is absent until something is refused", () => {
    renderWithQuery(<CreditWall />);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("offers waiting or upgrading when the allowance is spent", async () => {
    useUiStore.setState({
      refusal: refuse("INSUFFICIENT_CREDITS", "You have 0 credits left."),
    });
    renderWithQuery(<CreditWall />);

    expect(await screen.findByText("Out of credits")).toBeInTheDocument();
    expect(screen.getByText("You have 0 credits left.")).toBeInTheDocument();
    // The second remedy: it comes back on its own, and saying when is the
    // difference between a wall and a wait.
    expect(await screen.findByText(/resets in 16 days/)).toBeInTheDocument();
  });

  it("does not promise a reset for something no reset will unlock", async () => {
    useUiStore.setState({
      refusal: refuse(
        "PLAN_REQUIRED",
        "Audio overviews are not included in the Free plan.",
      ),
    });
    renderWithQuery(<CreditWall />);

    expect(await screen.findByText("Not on your plan")).toBeInTheDocument();
    // Telling somebody to wait for a reset that will never include podcasts
    // would be the interface lying cheerfully.
    expect(screen.queryByText(/resets in/)).not.toBeInTheDocument();
  });

  it("always offers a way to the plans", async () => {
    useUiStore.setState({ refusal: refuse("INSUFFICIENT_CREDITS", "out") });
    renderWithQuery(<CreditWall />);

    expect(
      await screen.findByRole("link", { name: "See plans" }),
    ).toHaveAttribute("href", "/pricing");
  });

  it("can be dismissed, and clears the refusal when it is", async () => {
    useUiStore.setState({ refusal: refuse("INSUFFICIENT_CREDITS", "out") });
    renderWithQuery(<CreditWall />);

    (await screen.findByRole("button", { name: "Not now" })).click();

    // Cleared rather than merely hidden: a refusal left in the store would
    // reopen the dialog the next time anything re-rendered.
    expect(useUiStore.getState().refusal).toBeNull();
  });
});
