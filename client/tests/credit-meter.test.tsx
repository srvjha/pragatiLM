import { describe, expect, it, beforeEach, vi } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { CreditMeter } from "@/components/billing/credit-meter";
import { billingState, renderWithQuery, stubFetch } from "./render";

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  vi.setSystemTime(new Date("2026-08-16T10:00:00Z"));
});

function mount(state: Record<string, unknown>) {
  vi.stubGlobal("fetch", stubFetch({ "/billing/me": billingState(state) }));
  return renderWithQuery(<CreditMeter />);
}

describe("the credit meter", () => {
  it("shows nothing until the balance is known", () => {
    mount({});
    // Ambient information: a skeleton in the header would draw the eye to a
    // number that has not arrived, on every page load.
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
  });

  it("shows the count remaining and links to the plans", async () => {
    mount({ balance: 17 });

    const link = await screen.findByRole("link");
    expect(link).toHaveTextContent("17");
    expect(link).toHaveAttribute("href", "/pricing");
  });

  it("says what is left, on which plan, and when it comes back", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    mount({ balance: 1 });

    // The tooltip is the only place the plan and the reset date are written, and
    // it does not exist until the trigger is hovered.
    await user.hover(await screen.findByRole("link"));

    // Singular, because "1 credits" is the kind of thing people notice.
    expect(
      await screen.findByText(/1 credit left on Free/),
    ).toBeInTheDocument();
    expect(screen.getByText(/resets in 16 days/)).toBeInTheDocument();
  });

  it("stays quiet when the balance is healthy", async () => {
    mount({ balance: 25 });

    const link = await screen.findByRole("link");
    // No border and muted text: nothing is wrong, so nothing is claimed.
    expect(link.className).toContain("text-muted-foreground");
    expect(link.className).not.toContain("text-destructive");
  });

  it("marks an empty balance as a refusal rather than a warning", async () => {
    mount({ balance: 0 });

    const link = await screen.findByRole("link");
    // The stamp colour means one thing in this product: the product is about to
    // decline. An empty balance is exactly that.
    expect(link.className).toContain("text-destructive");
  });

  it("never paints a low balance in the marker colour", async () => {
    mount({ balance: 2 });

    const link = await screen.findByRole("link");
    // The palette reserves the marker for spans the product actually matched,
    // and forbids it as a text colour. A warning is weight, not hue.
    expect(link.className).not.toMatch(/marker/);
    expect(link.className).toContain("text-foreground");
  });

  it("shows nothing at all when the request fails", async () => {
    vi.stubGlobal("fetch", stubFetch({}));
    renderWithQuery(<CreditMeter />);

    // A toast about a balance would interrupt work that the failure does not
    // block, so the meter simply is not there.
    await waitFor(() =>
      expect(screen.queryByRole("link")).not.toBeInTheDocument(),
    );
  });
});
