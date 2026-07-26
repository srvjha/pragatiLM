import { chromium } from "@playwright/test";
import { readFileSync } from "node:fs";
const out = process.argv[2];
const F = "../server/tests/fixtures";
const findings = [];
const note = (s) => { findings.push(s); console.log("  ⚠ " + s); };

const b = await chromium.launch();
const page = await b.newPage({ viewport: { width: 1440, height: 900 } });
const errs = [];
page.on("console", (m) => { if (m.type() === "error") errs.push(m.text()); });
page.on("pageerror", (e) => errs.push("pageerror: " + e.message));

// ---- 1. sign up
console.log("\n[1] sign up");
await page.goto("http://localhost:3000/sign-up", { waitUntil: "networkidle" });
await page.getByLabel("Name").fill("Saurav Jha");
await page.getByLabel("Email").fill(`t${Date.now()}@example.com`);
await page.getByLabel("Password").fill("a-strong-password");
await page.getByRole("button", { name: "Create account" }).click();
await page.waitForURL("**/app", { timeout: 20000 });
console.log("  ok -> /app");

// ---- 2. create notebook with EMPTY name
console.log("\n[2] create notebook with an empty name");
await page.getByRole("button", { name: /Create your first notebook/ }).click();
await page.waitForTimeout(400);
const createBtn = page.getByRole("button", { name: "Create", exact: true });
if (await createBtn.isDisabled()) note("Create is disabled with an empty name — name is effectively required");
await createBtn.click();
await page.waitForURL(/\/app\/[0-9a-f-]{36}/, { timeout: 20000 });
await page.waitForTimeout(1500);
const railText = await page.locator("aside").innerText().catch(() => "");
if (!/Untitled notebook/i.test(railText)) note(`empty name did not become "Untitled notebook" (rail: ${railText.slice(0,60).replace(/\n/g," ")})`);
else console.log("  ok -> Untitled notebook");

// ---- 3. empty notebook: what does chat say?
console.log("\n[3] empty notebook chat state");
const body = await page.locator("main").innerText();
if (/Waiting for a source to finish indexing/i.test(body)) note("empty notebook shows 'Waiting for a source to finish indexing' with a spinner, but nothing was uploaded");
await page.screenshot({ path: `${out}/t-empty-notebook.png` });

// ---- 4. avatar
console.log("\n[4] header avatar");
const img = await page.locator("header img").count();
console.log("  header <img> count:", img);
if (img === 0) note("header avatar renders an initial only; session.user.image is never used");

// ---- 5. add a PDF
console.log("\n[5] add a PDF and wait for READY");
await page.getByRole("button", { name: "Add source", exact: true }).first().click();
await page.getByRole("button", { name: /PDF/ }).first().click();
await page.getByLabel("Add PDFs").setInputFiles({
  name: "consensus.pdf", mimeType: "application/pdf",
  buffer: readFileSync(`${F}/distributed-systems.pdf`),
});
try {
  await page.getByLabel("Ready to query").waitFor({ timeout: 90000 });
  console.log("  ok -> READY");
} catch { note("PDF never reached READY within 90s"); }
await page.screenshot({ path: `${out}/t-source-ready.png` });

// ---- 6. ask a real question
console.log("\n[6] ask a real question");
const composer = page.getByLabel("Ask a question");
await composer.fill("What does the FLP result say?");
await composer.press("Enter");
try {
  await page.getByText(/Searching \d+ source/).waitFor({ timeout: 20000 });
  console.log("  ok -> retrieval phase shown");
} catch { note("no retrieval phase indicator appeared"); }
await page.waitForTimeout(35000);
const answer = await page.locator("main").innerText();
console.log("  answer excerpt:", answer.slice(-320).replace(/\n+/g, " ").slice(0, 300));
if (/could not find this in your sources/i.test(answer)) note("REFUSED a question the corpus clearly answers (FLP is on page 1)");
await page.screenshot({ path: `${out}/t-answer.png`, fullPage: true });

// ---- 7. citations
console.log("\n[7] citation chips");
const chips = await page.locator("button").filter({ hasText: /^Page \d+/ }).count();
console.log("  citation chips:", chips);
if (chips === 0) note("answer carried no citation chips");
else {
  await page.locator("button").filter({ hasText: /^Page \d+/ }).first().click();
  await page.waitForTimeout(6000);
  const viewer = await page.getByRole("button", { name: "Close viewer" }).isVisible().catch(() => false);
  if (!viewer) note("clicking a citation did not open the viewer");
  else {
    const marks = await page.locator("mark.marked").count();
    console.log("  highlighted spans in the PDF:", marks);
    if (marks === 0) note("viewer opened but highlighted no spans on the cited page");
  }
  await page.screenshot({ path: `${out}/t-viewer.png` });
}

console.log("\n[console errors]", errs.length ? [...new Set(errs)].slice(0,4).join(" | ").slice(0,400) : "none");
console.log("\n===== FINDINGS =====");
findings.forEach((f, i) => console.log(`${i + 1}. ${f}`));
await b.close();
