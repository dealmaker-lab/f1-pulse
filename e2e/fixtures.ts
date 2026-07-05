import { test as base, chromium, BrowserContext, Page } from '@playwright/test';
import { readFileSync, existsSync } from 'fs';

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

type StorageStateFile = {
  cookies?: Array<{ name: string; value: string; domain: string; path: string; expires?: number; httpOnly?: boolean; secure?: boolean; sameSite?: 'Strict' | 'Lax' | 'None' }>;
  origins?: Array<{ origin: string; localStorage: Array<{ name: string; value: string }> }>;
};

// Lightpanda's newContext({ storageState }) silently hangs context setup
// (the option exists but isn't applied). Apply it manually.
async function applyStorageState(context: BrowserContext, storageState: string | StorageStateFile | undefined) {
  if (!storageState) return;
  const data: StorageStateFile = typeof storageState === 'string'
    ? (existsSync(storageState) ? JSON.parse(readFileSync(storageState, 'utf8')) : { cookies: [], origins: [] })
    : storageState;
  if (data.cookies?.length) {
    await context.addCookies(data.cookies as any);
  }
  // localStorage is per-origin and Lightpanda only sets it after navigation.
  // Defer to first navigation via init script.
  if (data.origins?.length) {
    for (const o of data.origins) {
      const ls = o.localStorage || [];
      if (!ls.length) continue;
      await context.addInitScript((entries: Array<{ name: string; value: string }>) => {
        try {
          for (const { name, value } of entries) {
            window.localStorage.setItem(name, value);
          }
        } catch {}
      }, ls);
    }
  }
}

// Custom fixture that connects to Lightpanda via connectOverCDP
// Lightpanda speaks raw CDP, not the Playwright wire protocol
// - Retries CDP connect because Lightpanda can drop connections between tests
// - Honors `storageState` from project config (used by Clerk auth tests),
//   applied manually because Lightpanda doesn't load it via newContext()
export const test = base.extend<{ context: BrowserContext; page: Page }>({
  context: async ({ viewport, extraHTTPHeaders, storageState, baseURL }, use) => {
    const browser = await connectWithRetry();
    // Lightpanda hangs on `browser.newContext()`; always reuse the default
    // context. For storageState tests, open a throwaway page first because
    // Lightpanda's `addCookies` requires the context to have a loaded page.
    const context = browser.contexts()[0] || await browser.newContext({
      viewport: viewport || undefined,
      extraHTTPHeaders: extraHTTPHeaders || undefined,
    });
    if (storageState) {
      const warmup = await context.newPage();
      try {
        await warmup.goto(baseURL || 'about:blank', { waitUntil: 'domcontentloaded', timeout: 10_000 });
      } catch { /* doesn't matter — we just need the context loaded */ }
      try { await context.clearCookies(); } catch {}
      await applyStorageState(context, storageState as any);
      try { await warmup.close(); } catch {}
    }
    await use(context);
    try { await browser.close(); } catch { /* already closed */ }
  },
  page: async ({ context, baseURL, viewport }, use) => {
    const page = await context.newPage();
    // Apply the project viewport at the page level. Lightpanda hangs on
    // browser.newContext({ viewport }), so the context fixture can't carry
    // it — without this the mobile project (390×844) silently ran at
    // Lightpanda's default width and never exercised the mobile layout.
    if (viewport) {
      await page.setViewportSize(viewport).catch(() => {
        /* older Lightpanda builds may not support resize — best effort */
      });
    }
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
