import { chromium } from "@playwright/test";
import { readFileSync } from "node:fs";
const out = process.argv[2];
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1600, height: 900 } });
const errs = [];
p.on("pageerror", (e) => errs.push(e.message));
p.on("console", (m) => { if (m.type() === "error") errs.push(m.text()); });

await p.goto("http://localhost:3000/sign-up", { waitUntil: "networkidle" });
await p.getByLabel("Name").fill("Saurav Jha");
await p.getByLabel("Email").fill(`fl${Date.now()}@example.com`);
await p.getByLabel("Password").fill("a-strong-password");
await p.getByRole("button", { name: "Create account" }).click();
await p.waitForURL("**/app", { timeout: 20000 });
await p.getByRole("button", { name: /Create your first notebook/ }).click();
await p.getByLabel("Notebook name").fill("Distributed systems");
await p.getByRole("button", { name: "Create", exact: true }).click();
await p.waitForURL(/\/app\/[0-9a-f-]{36}/, { timeout: 20000 });

await p.getByRole("button", { name: "Add source", exact: true }).first().click();
await p.getByRole("button", { name: /PDF/ }).first().click();
await p.getByLabel("Add PDFs").setInputFiles({
  name: "consensus.pdf", mimeType: "application/pdf",
  buffer: readFileSync("../server/tests/fixtures/distributed-systems.pdf"),
});
await p.getByLabel("Ready to query").waitFor({ timeout: 90000 });
console.log("[1] source READY");

const composer = p.getByLabel("Ask a question");
await composer.fill("What does the FLP result say?");
await composer.press("Enter");
await p.getByText(/Searching \d+ source/).waitFor({ timeout: 25000 });
console.log("[2] retrieval started");

// Wait for the citations strip.
try {
  await p.getByText("Sources · click to open").waitFor({ timeout: 90000 });
  console.log("[3] answer finished with a citations strip");
} catch { console.log("[3] NO citations strip appeared"); }

await p.screenshot({ path: `${out}/F1-answer.png` });

const chip = p.locator("button").filter({ hasText: /Page \d/ }).first();
if (await chip.count()) {
  await chip.click();
  await p.waitForTimeout(7000);
  const back = await p.getByRole("button", { name: "Back to sources" }).first().isVisible().catch(() => false);
  const marks = await p.locator("mark.marked").count();
  console.log("[4] viewer replaced the list:", back, "| highlighted spans:", marks);
  await p.screenshot({ path: `${out}/F2-citation-open.png` });
  if (back) {
    await p.getByRole("button", { name: "Back to sources" }).first().click();
    await p.waitForTimeout(1200);
    const listBack = await p.getByText("Sources", { exact: true }).first().isVisible().catch(() => false);
    console.log("[5] back returns to the list:", listBack);
  }
} else console.log("[4] no citation chip to click");

console.log("[errors]", errs.length ? [...new Set(errs)].slice(0,3).join(" | ").slice(0,300) : "none");
await b.close();
