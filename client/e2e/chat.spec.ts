import { test, expect, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { signUpAndVisitApp } from "./session";

const fixtures = join(process.cwd(), "..", "server", "tests", "fixtures");

/** A notebook with one indexed source, which is the precondition for asking anything. */
async function notebookWithSource(page: Page): Promise<void> {
  await signUpAndVisitApp(page);
  await page
    .getByRole("button", {
      name: /^(New notebook|Create your first notebook)$/,
    })
    .first()
    .click();
  await page.getByLabel("Notebook name").fill("Chat notebook");
  await page.getByRole("button", { name: "Create", exact: true }).click();
  await page.waitForURL(/\/app\/[0-9a-f-]{36}/);

  await page
    .getByRole("button", { name: "Add source", exact: true })
    .first()
    .click();
  await page.getByRole("button", { name: /PDF/ }).first().click();
  await page.getByLabel("Add PDFs").setInputFiles({
    name: "systems.pdf",
    mimeType: "application/pdf",
    buffer: readFileSync(join(fixtures, "distributed-systems.pdf")),
  });

  await expect(page.getByLabel("Ready to query")).toBeVisible({
    timeout: 60_000,
  });
}

test("the composer is disabled until a source is ready, and says why", async ({
  page,
}) => {
  await signUpAndVisitApp(page);
  await page
    .getByRole("button", { name: "Create your first notebook" })
    .click();
  await page.getByLabel("Notebook name").fill("Empty notebook");
  await page.getByRole("button", { name: "Create", exact: true }).click();
  await page.waitForURL(/\/app\/[0-9a-f-]{36}/);

  const composer = page.getByLabel("Ask a question");
  await expect(composer).toBeDisabled();
  await expect(page.getByText(/nothing to answer from yet/)).toBeVisible();
});

test("suggested questions appear once a source is ready, drawn from its title", async ({
  page,
}) => {
  await notebookWithSource(page);

  await expect(page.getByText("Ask anything about your sources")).toBeVisible();
  await expect(
    page.getByRole("button", { name: /Summarise the main points/ }),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: /systems/ })).toBeVisible();
});

test("clicking a suggestion fills the composer rather than sending blind", async ({
  page,
}) => {
  await notebookWithSource(page);
  await page.getByRole("button", { name: /Summarise the main points/ }).click();

  await expect(page.getByLabel("Ask a question")).toHaveValue(
    "Summarise the main points",
  );
});

test("asking a question streams the retrieval phases in order", async ({
  page,
}) => {
  await notebookWithSource(page);

  const composer = page.getByLabel("Ask a question");
  await composer.fill("what is consensus");
  await composer.press("Enter");

  // The question is echoed immediately and the pipeline narrates itself, rather
  // than showing one undifferentiated spinner.
  await expect(page.getByText(/Searching \d+ source/)).toBeVisible({
    timeout: 15_000,
  });

  // With no model key the answer is a plain refusal, which still has to arrive
  // and still has to be persisted.
  await expect(page.getByText(/what is consensus/)).toBeVisible();
  await expect(
    page.getByText(/OPENAI_API_KEY|could not find this in your sources/i),
  ).toBeVisible({
    timeout: 60_000,
  });
});

test("the transcript survives a reload", async ({ page }) => {
  await notebookWithSource(page);

  const composer = page.getByLabel("Ask a question");
  await composer.fill("what is sharding");
  await composer.press("Enter");
  await expect(page.getByText(/what is sharding/)).toBeVisible({
    timeout: 30_000,
  });

  // Wait for the answer to settle before reloading.
  await expect(page.getByText(/OPENAI_API_KEY|could not find/i)).toBeVisible({
    timeout: 60_000,
  });

  await page.reload();
  await expect(page.getByText(/what is sharding/)).toBeVisible({
    timeout: 15_000,
  });
});

test("Shift+Enter adds a newline instead of sending", async ({ page }) => {
  await notebookWithSource(page);

  const composer = page.getByLabel("Ask a question");
  await composer.fill("first line");
  await composer.press("Shift+Enter");
  await composer.type("second line");

  await expect(composer).toHaveValue("first line\nsecond line");
});

test("opening a source from the rail shows it in the viewer", async ({
  page,
}) => {
  await notebookWithSource(page);

  await page.setViewportSize({ width: 1440, height: 900 });
  await page
    .getByRole("listitem")
    .filter({ hasText: "systems" })
    .getByRole("button")
    .nth(1)
    .click();

  // The PDF renders with page navigation, which is what a citation will later
  // jump into.
  await expect(page.getByRole("button", { name: "Next page" })).toBeVisible({
    timeout: 30_000,
  });
  await expect(page.getByText(/1 of 3/)).toBeVisible({ timeout: 30_000 });
});

test("the viewer closes on Escape", async ({ page }) => {
  await notebookWithSource(page);
  await page.setViewportSize({ width: 1440, height: 900 });

  await page
    .getByRole("listitem")
    .filter({ hasText: "systems" })
    .getByRole("button")
    .nth(1)
    .click();
  await expect(page.getByRole("button", { name: "Close viewer" })).toBeVisible({
    timeout: 30_000,
  });

  await page.keyboard.press("Escape");
  await expect(
    page.getByRole("button", { name: "Close viewer" }),
  ).not.toBeVisible();
});

test("the viewer is an overlay below 1280px and a split pane above it", async ({
  page,
}) => {
  await notebookWithSource(page);

  await page.setViewportSize({ width: 1000, height: 900 });
  await page
    .getByRole("listitem")
    .filter({ hasText: "systems" })
    .getByRole("button")
    .nth(1)
    .click();
  await expect(page.getByRole("button", { name: "Close viewer" })).toBeVisible({
    timeout: 30_000,
  });

  // As an overlay the chat is behind it, so the composer is not reachable.
  const composerBox = await page.getByLabel("Ask a question").boundingBox();
  expect(composerBox).not.toBeNull();

  await page.setViewportSize({ width: 1440, height: 900 });
  // Split pane: both are visible side by side.
  await expect(page.getByLabel("Ask a question")).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Close viewer" }),
  ).toBeVisible();
});
