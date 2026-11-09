import { chromium } from 'playwright';

const origin = 'https://centuryccpl.in';
const loginUrl = origin + '/cpanel/Default.aspx';
const listUrl = origin + '/cpanel/ListJournalVoucher.aspx';
let stage = 'secrets';
let browser;
try {
  const username = process.env.CENTURY_USERNAME;
  const password = process.env.CENTURY_PASSWORD;
  if (!username || !password) throw new Error();
  console.log('Existing credential secrets: present (values never logged).');
  stage = 'browser';
  browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  // Restrict document navigation and all non-read requests. Never visit edit pages.
  await context.route('**/*', async route => {
    const req = route.request();
    let u;
    try { u = new URL(req.url()); } catch { return route.abort(); }
    if (u.origin !== origin) return route.abort();
    const method = req.method();
    const safeDocuments = new Set([
      '/cpanel/Default.aspx', '/cpanel/TransportAnalyse.aspx',
      '/cpanel/ListJournalVoucher.aspx'
    ]);
    if (req.isNavigationRequest() && !safeDocuments.has(u.pathname)) return route.abort();
    if (method !== 'GET' && method !== 'HEAD') {
      // Only the site's verified username/password login submission is permitted.
      if (!(method === 'POST' && u.pathname === '/cpanel/Default.aspx')) return route.abort();
    }
    return route.continue();
  });
  const page = await context.newPage();
  stage = 'login';
  await page.goto(loginUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });
  const user = page.locator('#username');
  if (!await user.isVisible()) await page.locator('#modalOpen').click();
  await user.fill(username);
  await page.locator('#password').fill(password);
  await page.locator('#modalLogin').click();
  await page.waitForURL(url => url.origin === origin && url.pathname !== '/cpanel/Default.aspx', { timeout: 30000 });
  // Positive signed-in evidence, not merely a changed URL.
  await page.getByText(/Welcome\s+DEVEN/i).first().waitFor({ state: 'visible', timeout: 15000 });
  console.log('Authentication: verified.');
  stage = 'list';
  await page.goto(listUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.locator('#gv_Cashbook').waitFor({ state: 'visible', timeout: 30000 });
  const rowCount = await page.locator('#gv_Cashbook tr').count();
  if (rowCount < 2) throw new Error();
  // Aggregate only. No voucher identifiers, amounts, dates, HTML, screenshots or logs.
  console.log('Journal Voucher list: readable.');
  console.log('Result: PASS. No voucher edit pages opened; no records changed.');
} catch {
  console.log('Result: FAIL at stage ' + stage + '. No record changes attempted.');
  process.exitCode = 1;
} finally {
  if (browser) await browser.close().catch(() => {});
}
