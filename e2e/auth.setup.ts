import { clerk, clerkSetup } from '@clerk/testing/playwright';
import { test as setup } from '@playwright/test';
import path from 'path';

setup.describe.configure({ mode: 'serial' });

setup('clerk setup', async ({}) => {
  await clerkSetup();
});

const authFile = path.join(__dirname, '../playwright/.clerk/user.json');

setup('authenticate', async ({ page }) => {
  await page.goto('/');
  await clerk.signIn({
    page,
    emailAddress: process.env.E2E_CLERK_USER_EMAIL!,
  });
  // Confirm session is real: navigate to a protected route and verify we
  // didn't get rewritten to /_not-found or redirected to /sign-in.
  const response = await page.goto('/dashboard');
  await page.waitForLoadState('domcontentloaded');
  const url = page.url();
  if (url.includes('/sign-in') || url.includes('/_not-found')) {
    throw new Error(`Auth failed: /dashboard redirected/rewrote to ${url}`);
  }
  // Brief settle so any async client work persists to storage.
  await page.waitForTimeout(500);
  await page.context().storageState({ path: authFile });
});
