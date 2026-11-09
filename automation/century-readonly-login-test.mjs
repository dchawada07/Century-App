import { chromium } from 'playwright';

const origin = 'https://centuryccpl.in';
const loginUrl = origin + '/cpanel/Default.aspx';
const listUrl = origin + '/cpanel/ListJournalVoucher.aspx';
let stage = 'secrets';
let browser;
const diagnostics = { blockedRequests: 0, blockedNavigation: 0, loginHttpStatus: null, loginRequestFailed: false, alertShown: false };
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
    if (req.method() === 'GET' && req.url() === 'https://code.jquery.com/jquery-3.6.0.min.js') return route.continue();
    if (u.origin !== origin) { diagnostics.blockedRequests++; return route.abort(); }
    const method = req.method();
    const safeDocuments = new Set([
      '/cpanel/Default.aspx', '/cpanel/TransportAnalyse.aspx',
      '/cpanel/ListJournalVoucher.aspx'
    ]);
    if (req.isNavigationRequest() && !safeDocuments.has(u.pathname)) { diagnostics.blockedNavigation++; return route.abort(); }
    if (method !== 'GET' && method !== 'HEAD') {
      // Only the site's verified username/password login submission is permitted.
      if (!(method === 'POST' && ['/cpanel/Default.aspx', '/cpanel/Default.aspx/GetLoginMode', '/cpanel/Default.aspx/RedirectUsingCookis', '/cpanel/Default.aspx/LoginUser'].includes(u.pathname))) { diagnostics.blockedRequests++; return route.abort(); }
    }
    return route.continue();
  });
  const page = await context.newPage();
  page.on('response', response => { if (response.url().split('?')[0] === loginUrl + '/LoginUser') diagnostics.loginHttpStatus = response.status(); });
  page.on('requestfailed', req => { if (req.url().split('?')[0] === loginUrl + '/LoginUser') diagnostics.loginRequestFailed = true; });
  page.on('dialog', async dialog => { diagnostics.alertShown = true; await dialog.dismiss(); });
  stage = 'login-page';
  await page.goto(loginUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });
  stage = 'login-form';
  const user = page.locator('#username');
  if (!await user.isVisible()) await page.locator('#modalOpen').click();
  stage = 'credential-fill';
  await user.fill(username);
  await page.locator('#password').fill(password);
  stage = 'login-submit';
  await page.locator('#modalLogin').click();
  stage = 'login-redirect';
  await page.waitForURL(url => url.origin === origin && url.pathname !== '/cpanel/Default.aspx', { timeout: 30000 });
  // Verify authentication on the protected journal list, not dashboard widgets.
  stage = 'list';
  await page.goto(listUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.locator('#gv_Cashbook').waitFor({ state: 'visible', timeout: 30000 });
  const rowCount = await page.locator('#gv_Cashbook tr').count();
  if (rowCount < 2) throw new Error();
  // Aggregate only. No voucher identifiers, amounts, dates, HTML, screenshots or logs.
  console.log('Authentication: verified by protected Journal Voucher table.');
  console.log('Journal Voucher list: readable.');
  console.log('Result: PASS. No voucher edit pages opened; no records changed.');
} catch {
  console.log('Non-sensitive diagnostics: ' + JSON.stringify(diagnostics));
  console.log('Result: FAIL at stage ' + stage + '. No record changes attempted.');
  process.exitCode = 1;
} finally {
  if (browser) await browser.close().catch(() => {});
}
