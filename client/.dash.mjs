import { chromium } from "@playwright/test";
import { readFileSync } from "node:fs";
const out = process.argv[2];
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1440, height: 1000 } });
const errs = [];
p.on("pageerror", (e) => errs.push(e.message));
p.on("console", (m) => { if (m.type() === "error" && !m.text().includes("401")) errs.push(m.text()); });

await p.goto("http://localhost:3000/sign-up", { waitUntil: "networkidle" });
await p.getByLabel("Name").fill("Saurav Jha");
await p.getByLabel("Email").fill(`ds${Date.now()}@example.com`);
await p.getByLabel("Password").fill("a-strong-password");
await p.getByRole("button", { name: "Create account" }).click();
await p.waitForURL("**/app", { timeout: 20000 });

// Empty account first: the numbers must read as "no data", not as zero scores.
await p.goto("http://localhost:3000/app/dashboard", { waitUntil: "networkidle" });
await p.waitForTimeout(1500);
await p.screenshot({ path: `${out}/D1-empty.png`, fullPage: true });

// Then with real content.
await p.goto("http://localhost:3000/app", { waitUntil: "networkidle" });
await p.getByRole("button", { name: /Create your first notebook/ }).click();
await p.getByLabel("Notebook name").fill("Distributed systems");
await p.getByRole("button", { name: "Create", exact: true }).click();
await p.waitForURL(/\/app\/[0-9a-f-]{36}/, { timeout: 20000 });
await p.getByRole("button", { name: "Add source", exact: true }).first().click();
await p.getByRole("button", { name: /PDF/ }).first().click();
await p.getByLabel("Add PDFs").setInputFiles({ name: "c.pdf", mimeType: "application/pdf",
  buffer: readFileSync("../server/tests/fixtures/distributed-systems.pdf") });
await p.getByLabel("Ready to query").waitFor({ timeout: 90000 });
const composer = p.getByLabel("Ask a question");
await composer.fill("What does the FLP result say?");
await composer.press("Enter");
await p.getByText("Sources · click to open").waitFor({ timeout: 120000 });

await p.goto("http://localhost:3000/app/dashboard", { waitUntil: "networkidle" });
await p.waitForTimeout(1800);
await p.screenshot({ path: `${out}/D2-populated.png`, fullPage: true });
console.log("errors:", errs.length ? [...new Set(errs)].slice(0,2).join(" | ").slice(0,200) : "none");
await b.close();
