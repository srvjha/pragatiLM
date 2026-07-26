import { chromium } from "@playwright/test";
import { readFileSync } from "node:fs";
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1600, height: 900 } });
p.on("console", (m) => { const t = m.text(); if (t.includes("PDFDBG")) console.log("  " + t); });
await p.goto("http://localhost:3000/sign-up", { waitUntil: "networkidle" });
await p.getByLabel("Name").fill("Dbg");
await p.getByLabel("Email").fill(`db${Date.now()}@example.com`);
await p.getByLabel("Password").fill("a-strong-password");
await p.getByRole("button", { name: "Create account" }).click();
await p.waitForURL("**/app", { timeout: 20000 });
await p.getByRole("button", { name: /Create your first notebook/ }).click();
await p.getByLabel("Notebook name").fill("Dbg");
await p.getByRole("button", { name: "Create", exact: true }).click();
await p.waitForURL(/\/app\/[0-9a-f-]{36}/, { timeout: 20000 });
await p.getByRole("button", { name: "Add source", exact: true }).first().click();
await p.getByRole("button", { name: /PDF/ }).first().click();
await p.getByLabel("Add PDFs").setInputFiles({ name: "c.pdf", mimeType: "application/pdf",
  buffer: readFileSync("../server/tests/fixtures/distributed-systems.pdf") });
await p.getByLabel("Ready to query").waitFor({ timeout: 90000 });
// Open a source straight from the list, with no citation, then via a citation.
const composer = p.getByLabel("Ask a question");
await composer.fill("What does the FLP result say?");
await composer.press("Enter");
await p.getByText("Sources · click to open").waitFor({ timeout: 120000 });
await p.locator("button").filter({ hasText: /Page \d/ }).first().click();
await p.waitForTimeout(8000);
console.log("marks in DOM:", await p.locator("mark.marked").count());
await b.close();
