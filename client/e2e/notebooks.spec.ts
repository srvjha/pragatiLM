import { test, expect, type Page } from "@playwright/test";
import { signUpAndVisitApp } from "./session";

/** Scoped to the list item, because the row and its menu share the name. */
function row(page: Page, name: string) {
  return page.getByRole("listitem").filter({ hasText: name });
}

function openRow(page: Page, name: string) {
  return row(page, name).getByRole("button").first();
}

async function createNotebook(page: Page, name?: string): Promise<void> {
  await page
    .getByRole("button", {
      name: /^(New notebook|Create your first notebook)$/,
    })
    .first()
    .click();
  if (name !== undefined) {
    await page.getByLabel("Notebook name").fill(name);
  }
  await page.getByRole("button", { name: "Create", exact: true }).click();
}

test("empty state offers the one primary action", async ({ page }) => {
  await signUpAndVisitApp(page);

  await expect(
    page.getByRole("heading", { name: "Create your first notebook" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Create your first notebook" }),
  ).toBeVisible();
});

test("create appears immediately and persists across a reload", async ({
  page,
}) => {
  await signUpAndVisitApp(page);
  await createNotebook(page, "Distributed systems");

  await expect(row(page, "Distributed systems")).toBeVisible();
  await expect(page.getByText("0 sources")).toBeVisible();

  await page.reload();
  await expect(row(page, "Distributed systems")).toBeVisible();
});

test("an empty name falls back to the default, per FR-1.1", async ({
  page,
}) => {
  await signUpAndVisitApp(page);
  await createNotebook(page);

  await expect(row(page, "Untitled notebook")).toBeVisible();
});

test("inline rename on double click", async ({ page }) => {
  await signUpAndVisitApp(page);
  await createNotebook(page, "Before");

  await openRow(page, "Before").dblclick();
  const input = page.getByLabel("Notebook name");
  await input.fill("After");
  await input.press("Enter");

  await expect(row(page, "After")).toBeVisible();
  await page.reload();
  await expect(row(page, "After")).toBeVisible();
});

test("delete asks first and names what goes with it", async ({ page }) => {
  await signUpAndVisitApp(page);
  await createNotebook(page, "Doomed");

  await page.getByRole("button", { name: "Actions for Doomed" }).click();
  await page.getByRole("menuitem", { name: "Delete" }).click();

  await expect(page.getByText("This cannot be undone.")).toBeVisible();
  await page.getByRole("button", { name: "Delete notebook" }).click();

  await expect(
    page.getByRole("heading", { name: "Create your first notebook" }),
  ).toBeVisible();
});

test("a failed delete rolls the row back and explains why", async ({
  page,
}) => {
  await signUpAndVisitApp(page);
  await createNotebook(page, "Survivor");
  await expect(row(page, "Survivor")).toBeVisible();

  // FR-8.4: force the failure and assert the optimistic removal is undone.
  await page.route("**/api/notebooks/*", async (route) => {
    if (route.request().method() === "DELETE") {
      await route.fulfill({
        status: 500,
        contentType: "application/json",
        body: JSON.stringify({
          error: { code: "INTERNAL", message: "Internal server error" },
        }),
      });
      return;
    }
    await route.continue();
  });

  await page.getByRole("button", { name: "Actions for Survivor" }).click();
  await page.getByRole("menuitem", { name: "Delete" }).click();
  await page.getByRole("button", { name: "Delete notebook" }).click();

  await expect(page.getByText("Could not delete the notebook")).toBeVisible();
  await expect(row(page, "Survivor")).toBeVisible();
});

test("Cmd+K switches notebooks", async ({ page }) => {
  await signUpAndVisitApp(page);
  for (const name of ["Alpha notebook", "Beta notebook"]) {
    await createNotebook(page, name);
    await expect(row(page, name)).toBeVisible();
  }

  await page.keyboard.press("ControlOrMeta+k");
  await page.getByPlaceholder("Search notebooks...").fill("Beta");
  await page.getByRole("option", { name: /Beta notebook/ }).click();

  await expect(
    page.getByRole("heading", { name: "Beta notebook" }),
  ).toBeVisible();
});

test("the rail collapses to a drawer below 1024px", async ({ page }) => {
  await signUpAndVisitApp(page);
  await createNotebook(page, "Responsive");

  const rail = page.getByRole("complementary", { name: "Notebooks" });
  await expect(rail).toBeInViewport();

  await page.setViewportSize({ width: 390, height: 844 });
  await expect(rail).not.toBeInViewport();

  await page.getByRole("button", { name: "Toggle notebooks" }).click();
  await expect(rail).toBeInViewport();

  await page.keyboard.press("Escape");
  await expect(rail).not.toBeInViewport();
});

test("no horizontal scroll from 360px to 2560px", async ({ page }) => {
  await signUpAndVisitApp(page);

  for (const width of [360, 768, 1024, 1280, 1920, 2560]) {
    await page.setViewportSize({ width, height: 900 });
    const overflows = await page.evaluate(
      () =>
        document.documentElement.scrollWidth >
        document.documentElement.clientWidth,
    );
    expect(overflows, `horizontal scroll at ${width}px`).toBe(false);
  }
});
