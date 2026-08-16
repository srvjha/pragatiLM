import { describe, expect, it, vi, afterEach } from "vitest";
import {
  credits,
  planLimits,
  resetsIn,
  rupees,
  storageLabel,
} from "@/features/billing/format";
import type { PlanDto } from "@/types/api";

describe("rupees", () => {
  it("divides paise and never shows a fraction of one", () => {
    expect(rupees(39_900)).toBe("₹399");
    expect(rupees(99_900)).toBe("₹999");
  });

  it("says Free rather than ₹0", () => {
    expect(rupees(0)).toBe("Free");
  });

  it("groups in the Indian system, not the western one", () => {
    // 1,00,000 rather than 100,000. Getting this wrong makes a price look like a
    // different price to the people being asked to pay it.
    expect(rupees(10_000_000)).toBe("₹1,00,000");
  });
});

describe("storageLabel", () => {
  it("uses MB below a gigabyte and GB above it", () => {
    expect(storageLabel(25 * 1024 ** 2)).toBe("25 MB");
    expect(storageLabel(2 * 1024 ** 3)).toBe("2 GB");
    expect(storageLabel(10 * 1024 ** 3)).toBe("10 GB");
  });

  it("keeps one decimal only when there is one", () => {
    expect(storageLabel(1.5 * 1024 ** 3)).toBe("1.5 GB");
    expect(storageLabel(1024 ** 3)).toBe("1 GB");
  });
});

describe("credits", () => {
  it("agrees with itself about number", () => {
    expect(credits(1)).toBe("1 credit");
    expect(credits(0)).toBe("0 credits");
    expect(credits(250)).toBe("250 credits");
  });
});

describe("planLimits", () => {
  const plan: PlanDto = {
    code: "plus",
    name: "Plus",
    blurb: "",
    pricePaise: 39_900,
    monthlyCredits: 250,
    notebooks: 15,
    sourcesPerNotebook: 100,
    storageBytes: 2 * 1024 ** 3,
    podcasts: true,
  };

  it("names what the plan includes", () => {
    expect(planLimits(plan)).toEqual([
      "250 credits a month",
      "15 notebooks",
      "100 sources per notebook",
      "2 GB of storage",
      "Audio overviews",
    ]);
  });

  it("states an absent feature rather than omitting it", () => {
    // The card renders a struck-through row from this, so a plan without audio
    // has to say so; dropping the line would make Free look like it has one.
    expect(planLimits({ ...plan, podcasts: false })).toContain(
      "No audio overviews",
    );
  });
});

describe("resetsIn", () => {
  afterEach(() => vi.useRealTimers());

  function at(now: string) {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(now));
  }

  it("counts days rather than printing a date", () => {
    at("2026-08-10T10:00:00Z");
    expect(resetsIn("2026-08-16T10:00:00Z")).toBe("resets in 6 days");
  });

  it("says tomorrow and today rather than 1 days and 0 days", () => {
    at("2026-08-15T10:00:00Z");
    expect(resetsIn("2026-08-16T10:00:00Z")).toBe("resets tomorrow");

    at("2026-08-16T10:00:00Z");
    expect(resetsIn("2026-08-16T09:00:00Z")).toBe("resets today");
  });

  it("does not go negative once the period has passed", () => {
    at("2026-09-01T10:00:00Z");
    expect(resetsIn("2026-08-16T10:00:00Z")).toBe("resets today");
  });
});
