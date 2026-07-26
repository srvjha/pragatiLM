import type { Page } from "@playwright/test";

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

/**
 * A signed in browser context.
 *
 * Every spec needs one now that the workspace sits behind authentication, and
 * each gets its own fresh account: notebooks are scoped per user, so a new
 * account is also the cleanest possible reset. That is why there is no longer a
 * "delete everything first" step, which only worked while all data was shared.
 *
 * Sign up goes through the API rather than the form because these specs are
 * about the workspace; the form itself is covered by its own spec.
 */
export async function signUpAndVisitApp(page: Page): Promise<void> {
  const email = `e2e-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.com`;

  const response = await page.request.post(`${API}/api/auth/sign-up/email`, {
    data: { name: "E2E", email, password: "a-strong-password" },
  });

  if (!response.ok()) {
    throw new Error(
      `sign up failed (${response.status()}): ${await response.text()}`,
    );
  }

  await page.goto("/app");
  await page.waitForURL("**/app");
}
