import { test as base, chromium, BrowserContext, Page } from '@playwright/test';

const CDP_ENDPOINT = process.env.CDP_ENDPOINT || 'http://127.0.0.1:9222';

// Custom fixture that connects to Lightpanda via CDP
export const test = base.extend<{ context: BrowserContext; page: Page }>({
  context: async ({}, use) => {
    const browser = await chromium.connectOverCDP(CDP_ENDPOINT);
    const context = browser.contexts()[0] || await browser.newContext();
    await use(context);
    await browser.close();
  },
  page: async ({ context }, use) => {
    const page = await context.newPage();
    await use(page);
    await page.close();
  },
});

export { expect } from '@playwright/test';
