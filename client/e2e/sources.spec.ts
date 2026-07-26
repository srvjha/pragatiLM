import { test, expect, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";
// Playwright runs from the client project root.
const fixtures = join(process.cwd(), "..", "server", "tests", "fixtures");

async function reset(page: Page): Promise<void> {
  const response = await page.request.get(`${API}/api/notebooks`);
  const body = (await response.json()) as { data: { id: string }[] };
  for (const notebook of body.data) {
    await page.request.delete(`${API}/api/notebooks/${notebook.id}`);
  }
}

/** Opens a notebook so the rail is showing its sources. */
async function openNotebook(
  page: Page,
  name = "Research notebook",
): Promise<void> {
  await page.goto("/");
  await page
    .getByRole("button", {
      name: /^(New notebook|Create your first notebook)$/,
    })
    .first()
    .click();
  await page.getByLabel("Notebook name").fill(name);
  await page.getByRole("button", { name: "Create", exact: true }).click();

  await page
    .getByRole("listitem")
    .filter({ hasText: name })
    .getByRole("button")
    .first()
    .click();
  await page.waitForURL(/\/notebook\//);
  await expect(
    page.getByRole("heading", { name: "Sources", exact: true }),
  ).toBeVisible();
}

test.beforeEach(async ({ page }) => {
  await reset(page);
});

test("empty state names the five supported types", async ({ page }) => {
  await openNotebook(page);

  await expect(page.getByText("Add your first source")).toBeVisible();
  await expect(
    page.getByText(/PDF, YouTube, web pages, plain text, and VTT or SRT/),
  ).toBeVisible();
});

test("the add dialog offers the five tiles from the mockup", async ({
  page,
}) => {
  await openNotebook(page);
  await page
    .getByRole("button", { name: "Add source", exact: true })
    .first()
    .click();

  for (const tile of ["PDF", "YT Link", "Web Link", "Text", "VTT"]) {
    await expect(
      page.getByRole("button", { name: new RegExp(tile) }),
    ).toBeVisible();
  }
});

test("choosing a tile swaps the dialog body, and back returns to the grid", async ({
  page,
}) => {
  await openNotebook(page);
  await page
    .getByRole("button", { name: "Add source", exact: true })
    .first()
    .click();

  await page.getByRole("button", { name: /Web Link/ }).click();
  await expect(page.getByLabel("Page URL")).toBeVisible();

  await page.getByRole("button", { name: "Back to source types" }).click();
  await expect(page.getByRole("button", { name: /YT Link/ })).toBeVisible();
});

test("a text source appears immediately and reaches ready without a refresh", async ({
  page,
}) => {
  await openNotebook(page);
  await page
    .getByRole("button", { name: "Add source", exact: true })
    .first()
    .click();
  await page.getByRole("button", { name: /Text/ }).first().click();

  await page.getByLabel("Source title").fill("Consensus notes");
  await page
    .getByLabel("Text content")
    .fill("Raft elects one leader per term. A term is a logical clock.");
  await page.getByRole("button", { name: "Add text" }).click();

  const row = page.getByRole("listitem").filter({ hasText: "Consensus notes" });
  await expect(row).toBeVisible();

  // No reload anywhere in this test: the dot has to arrive over the stream.
  await expect(row.getByLabel("Ready to query")).toBeVisible({
    timeout: 30_000,
  });
});

test("three files uploaded at once progress independently to ready", async ({
  page,
}) => {
  await openNotebook(page);
  await page
    .getByRole("button", { name: "Add source", exact: true })
    .first()
    .click();
  await page.getByRole("button", { name: /PDF/ }).first().click();

  await page.getByLabel("Add PDFs").setInputFiles([
    {
      name: "one.pdf",
      mimeType: "application/pdf",
      buffer: readFileSync(join(fixtures, "distributed-systems.pdf")),
    },
    {
      name: "two.pdf",
      mimeType: "application/pdf",
      buffer: readFileSync(join(fixtures, "handbook-20p.pdf")),
    },
    {
      name: "three.pdf",
      mimeType: "application/pdf",
      buffer: readFileSync(join(fixtures, "scanned.pdf")),
    },
  ]);

  const rows = page
    .getByRole("listitem")
    .filter({ has: page.getByLabel(/Use .* for answers/) });
  await expect(rows).toHaveCount(3, { timeout: 15_000 });

  // Two index cleanly and the scan fails, all three without a page refresh.
  await expect(page.getByLabel("Ready to query")).toHaveCount(2, {
    timeout: 60_000,
  });
  await expect(page.getByLabel("Failed")).toHaveCount(1, { timeout: 60_000 });
});

test("a failed source shows its reason in the row with a retry, per FR-2.10", async ({
  page,
}) => {
  await openNotebook(page);
  await page
    .getByRole("button", { name: "Add source", exact: true })
    .first()
    .click();
  await page.getByRole("button", { name: /PDF/ }).first().click();

  await page.getByLabel("Add PDFs").setInputFiles({
    name: "scanned.pdf",
    mimeType: "application/pdf",
    buffer: readFileSync(join(fixtures, "scanned.pdf")),
  });

  await expect(
    page.getByText(/no extractable text layer, it looks like a scan/),
  ).toBeVisible({
    timeout: 60_000,
  });
  await expect(page.getByRole("button", { name: "Retry" })).toBeVisible();
});

test("a duplicate file is refused with a message naming the existing source", async ({
  page,
}) => {
  await openNotebook(page);

  for (let attempt = 0; attempt < 2; attempt += 1) {
    await page
      .getByRole("button", { name: "Add source", exact: true })
      .first()
      .click();
    await page.getByRole("button", { name: /PDF/ }).first().click();
    await page.getByLabel("Add PDFs").setInputFiles({
      name: "paper.pdf",
      mimeType: "application/pdf",
      buffer: readFileSync(join(fixtures, "distributed-systems.pdf")),
    });

    if (attempt === 0) {
      await expect(
        page.getByRole("listitem").filter({ hasText: "paper" }),
      ).toBeVisible();
    }
  }

  await expect(page.getByText(/already in the notebook/)).toBeVisible({
    timeout: 15_000,
  });
});

test("an invalid URL is refused with the reason from the server", async ({
  page,
}) => {
  await openNotebook(page);
  await page
    .getByRole("button", { name: "Add source", exact: true })
    .first()
    .click();
  await page.getByRole("button", { name: /Web Link/ }).click();

  await page.getByLabel("Page URL").fill("http://192.168.1.1/admin");
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Add source", exact: true })
    .click();

  await expect(page.getByText(/private or internal address/)).toBeVisible({
    timeout: 15_000,
  });
});

test("the selection checkbox scopes retrieval and survives a reload", async ({
  page,
}) => {
  await openNotebook(page);
  await page
    .getByRole("button", { name: "Add source", exact: true })
    .first()
    .click();
  await page.getByRole("button", { name: /Text/ }).first().click();
  await page.getByLabel("Source title").fill("Scoped");
  await page
    .getByLabel("Text content")
    .fill("Some content that will be indexed.");
  await page.getByRole("button", { name: "Add text" }).click();

  const checkbox = page.getByLabel("Use Scoped for answers");
  await expect(checkbox).toBeChecked();

  await checkbox.click();
  await expect(checkbox).not.toBeChecked();

  await page.reload();
  await expect(page.getByLabel("Use Scoped for answers")).not.toBeChecked();
});
