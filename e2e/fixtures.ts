import { test as base, chromium, BrowserContext, Page } from '@playwright/test';

const CDP_ENDPOINT = process.env.CDP_ENDPOINT || 'http://127.0.0.1:9222';
const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 1000;

async function connectWithRetry(): Promise<import('@playwright/test').Browser> {
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      return await chromium.connectOverCDP(CDP_ENDPOINT);
    } catch (err) {
      if (attempt === MAX_RETRIES) throw err;
      console.warn(`CDP connect attempt ${attempt}/${MAX_RETRIES} failed, retrying in ${RETRY_DELAY_MS}ms...`);
      await new Promise(r => setTimeout(r, RETRY_DELAY_MS));
    }
  }
  throw new Error('Unreachable');
}

// Custom fixture that connects to Lightpanda via connectOverCDP
// Lightpanda speaks raw CDP, not the Playwright wire protocol
// Includes retry logic because Lightpanda CDP can drop connections between tests
export const test = base.extend<{ context: BrowserContext; page: Page }>({
  context: async ({ viewport, extraHTTPHeaders }, use) => {
    const browser = await connectWithRetry();
    const context = browser.contexts()[0] || await browser.newContext({
      viewport: viewport || undefined,
      extraHTTPHeaders: extraHTTPHeaders || undefined,
    });
    await use(context);
    try { await browser.close(); } catch { /* already closed */ }
  },
  page: async ({ context, baseURL }, use) => {
    const page = await context.newPage();
    // Monkey-patch goto to prepend baseURL for relative paths (like Playwright does natively)
    // Also add retry logic for CDP connection drops during navigation
    const originalGoto = page.goto.bind(page);
    page.goto = async (url: string, options?: any) => {
      if (baseURL && url.startsWith('/')) {
        url = baseURL + url;
      }
      for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
        try {
          return await originalGoto(url, { waitUntil: 'domcontentloaded', ...options });
        } catch (err: any) {
          const msg = err?.message || '';
          const isConnectionDrop = msg.includes('Target page, context or browser has been closed') ||
            msg.includes('Target closed') ||
            msg.includes('Connection closed') ||
            msg.includes('Protocol error');
          if (!isConnectionDrop || attempt === MAX_RETRIES) throw err;
          console.warn(`Navigation attempt ${attempt}/${MAX_RETRIES} failed (CDP drop), retrying...`);
          await new Promise(r => setTimeout(r, RETRY_DELAY_MS));
        }
      }
      return null;
    };
    await use(page);
    try { await page.close(); } catch { /* already closed */ }
  },
});

export { expect } from '@playwright/test';
