import { test as base, chromium, BrowserContext, Page } from '@playwright/test';

const CDP_ENDPOINT = process.env.CDP_ENDPOINT || 'http://127.0.0.1:9222';

// Custom fixture that connects to Lightpanda via connectOverCDP
// Lightpanda speaks raw CDP, not the Playwright wire protocol
export const test = base.extend<{ context: BrowserContext; page: Page }>({
  context: async ({ viewport, extraHTTPHeaders }, use) => {
    const browser = await chromium.connectOverCDP(CDP_ENDPOINT);
    const context = browser.contexts()[0] || await browser.newContext({
      viewport: viewport || undefined,
      extraHTTPHeaders: extraHTTPHeaders || undefined,
    });
    await use(context);
    await browser.close();
  },
  page: async ({ context, baseURL }, use) => {
    const page = await context.newPage();
    // Monkey-patch goto to prepend baseURL for relative paths (like Playwright does natively)
    const originalGoto = page.goto.bind(page);
    page.goto = async (url: string, options?: any) => {
      if (baseURL && url.startsWith('/')) {
        url = baseURL + url;
      }
      return originalGoto(url, options);
    };
    await use(page);
    await page.close();
  },
});

export { expect } from '@playwright/test';
