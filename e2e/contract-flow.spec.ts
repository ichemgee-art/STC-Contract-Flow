import { expect, test, type Page } from "@playwright/test";

const ADMIN_EMAIL = "e2e-admin@stc.local";
const EDITOR_EMAIL = "e2e-editor@stc.local";
const PASSWORD = "E2e-Test-2026!";

async function useEnglish(page: Page) {
  const switcher = page.getByRole("button", { name: /English/ });
  if (await switcher.isVisible().catch(() => false)) await switcher.click();
}

async function login(page: Page, email = ADMIN_EMAIL) {
  await page.goto("/login");
  await useEnglish(page);
  await page.getByLabel("Email address").fill(email);
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
  await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible();
}

test("protected routes redirect unauthenticated users to login", async ({ page }) => {
  await page.goto("/contracts");
  await expect(page).toHaveURL(/\/login$/);
  await expect(page.getByRole("button", { name: /Sign in|تسجيل الدخول/ })).toBeVisible();
});

test("admin can create, progress, reopen and delete a contract", async ({ page }) => {
  await login(page);
  await page.goto("/contracts/new");

  const company = `E2E Company ${Date.now()}`;
  await page.getByLabel("Sales representative").fill("E2E Representative");
  await page.getByLabel("Company / Client").fill(company);
  await page.getByLabel("Contract type").fill("Supply & Installation");
  await page.getByLabel("Product / Item").fill("HPL");
  await page.getByRole("button", { name: "Save Contract" }).click();

  await expect(page).toHaveURL(/\/contracts\/[^/]+$/);
  await expect(page.getByRole("heading", { name: company })).toBeVisible();

  const stages = [
    "Stamped by STC",
    "Stamped by Client",
    "Down Payment",
    "Supply",
    "Stocking Payment",
  ];

  for (const stage of stages) {
    await page.getByRole("button", { name: `Complete ${stage}` }).click();
    await expect(page.getByRole("button", { name: `Reopen ${stage}` })).toBeVisible();
  }

  await expect(page.getByText("Completed", { exact: true }).first()).toBeVisible();

  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "Reopen Supply" }).click();
  await expect(page.getByText("Waiting for Supply", { exact: true }).first()).toBeVisible();

  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "Delete" }).click();
  await expect(page).toHaveURL(/\/contracts$/);
  await expect(page.getByText(company, { exact: true })).toHaveCount(0);
});

test("editor cannot delete contracts", async ({ page }) => {
  await login(page, EDITOR_EMAIL);
  await page.goto("/contracts/scale-125");
  await expect(page.getByRole("heading", { name: "Scale Company 125" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Delete" })).toHaveCount(0);
});

test("large contract registers page older records on demand", async ({ page }) => {
  await login(page);
  await page.goto("/contracts");

  await expect(page.getByText(/125 total contracts/)).toBeVisible();

  const loadMore = page.getByRole("button", { name: /Load more/ });
  await expect(loadMore).toContainText("50 of 125");

  await loadMore.click();
  await expect(loadMore).toContainText("100 of 125");

  await loadMore.click();
  await expect(page.getByText("Scale Company 001", { exact: true }).first()).toBeVisible();
  await expect(page.getByRole("button", { name: /Load more/ })).toHaveCount(0);
});
