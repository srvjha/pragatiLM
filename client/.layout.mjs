import { chromium } from "@playwright/test";
import { readFileSync } from "node:fs";
const out = process.argv[2];
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1600, height: 900 } });
await p.goto("http://localhost:3000/sign-up", { waitUntil: "networkidle" });
await p.getByLabel("Name").fill("Saurav Jha");
await p.getByLabel("Email").fill(`ly${Date.now()}@example.com`);
await p.getByLabel("Password").fill("a-strong-password");
await p.getByRole("button", { name: "Create account" }).click();
await p.waitForURL("**/app", { timeout: 20000 });
await p.getByRole("button", { name: /Create your first notebook/ }).click();
await p.getByLabel("Notebook name").fill("Distributed systems");
await p.getByRole("button", { name: "Create", exact: true }).click();
await p.waitForURL(/\/app\/[0-9a-f-]{36}/, { timeout: 20000 });
await p.waitForTimeout(1500);
await p.screenshot({ path: `${out}/L1-empty.png` });

await p.getByRole("button", { name: "Add source", exact: true }).first().click();
await p.getByRole("button", { name: /PDF/ }).first().click();
await p.getByLabel("Add PDFs").setInputFiles({
  name: "consensus.pdf", mimeType: "application/pdf",
  buffer: readFileSync("../server/tests/fixtures/distributed-systems.pdf"),
});
await p.getByLabel("Ready to query").waitFor({ timeout: 90000 });
await p.waitForTimeout(1000);
await p.screenshot({ path: `${out}/L2-ready.png` });
console.log("ready");
await b.close();
