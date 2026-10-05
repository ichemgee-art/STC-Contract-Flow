import { expect, test, type Page } from "@playwright/test";

const ADMIN_EMAIL = "e2e-admin@stc.local";
const EDITOR_EMAIL = "e2e-editor@stc.local";
const PASSWORD = "E2e-Test-2026!";

async function login(page: Page, email = ADMIN_EMAIL) {
  await page.goto("/login");
  await page.locator('input[type="email"]').fill(email);
  await page.locator('input[type="password"]').fill(PASSWORD);
  await page.locator('form button[type="submit"]').click();
  await expect(page).toHaveURL(/\/dashboard$/);
}

test("protected routes redirect unauthenticated users to login", async ({ page }) => {
  await page.goto("/contracts");
  await expect(page).toHaveURL(/\/login$/);
  await expect(page.locator('input[type="email"]')).toBeVisible();
});

test("admin can create, progress, reopen and delete a contract", async ({ page }) => {
  await login(page);
  await page.goto("/contracts/new");
  await expect(page.getByTestId("contract-sales-representative")).toBeVisible();

  const company = `E2E Company ${Date.now()}`;
  await page.getByTestId("contract-sales-representative").fill("E2E Representative");
  await page.getByTestId("contract-company-name").fill(company);
  await page.getByTestId("contract-type").fill("Supply & Installation");
  await page.getByTestId("contract-product").fill("HPL");
  await page.getByTestId("contract-submit").click();

  await expect(page).toHaveURL(/\/contracts\/[^/]+$/);
  await expect(page.getByRole("heading", { name: company })).toBeVisible();

  const stages = [
    "stampedByUs",
    "stampedByClient",
    "downPayment",
    "supply",
    "settlement",
  ];

  for (const stage of stages) {
    const control = page.getByTestId(`stage-${stage}`);
    await expect(control).toHaveAttribute("data-completed", "false");
    await control.click();
    await expect(control).toHaveAttribute("data-completed", "true");
  }

  page.once("dialog", (dialog) => dialog.accept());
  const supply = page.getByTestId("stage-supply");
  await supply.click();
  await expect(supply).toHaveAttribute("data-completed", "false");
  await expect(page.getByTestId("stage-settlement")).toHaveAttribute("data-completed", "false");

  page.once("dialog", (dialog) => dialog.accept());
  await page.getByTestId("contract-delete").click();
  await expect(page).toHaveURL(/\/contracts$/);
});

test("editor cannot delete contracts", async ({ page }) => {
  await login(page, EDITOR_EMAIL);
  await page.goto("/contracts/scale-125");
  await expect(page.getByRole("heading", { name: "Scale Company 125" })).toBeVisible();
  await expect(page.getByTestId("contract-delete")).toHaveCount(0);
});

test("large contract register pages older records on demand", async ({ page }) => {
  await login(page);
  await page.goto("/contracts");

  const total = page.getByTestId("contracts-total");
  await expect(total).toContainText("125");

  const loadMore = page.getByTestId("contracts-load-more");
  await expect(loadMore).toHaveAttribute("data-loaded", "50");
  await expect(loadMore).toHaveAttribute("data-total", "125");

  await loadMore.click();
  await expect(loadMore).toHaveAttribute("data-loaded", "100");

  await loadMore.click();
  await expect(page.getByText("Scale Company 001", { exact: true }).first()).toBeVisible();
  await expect(page.getByTestId("contracts-load-more")).toHaveCount(0);
});
