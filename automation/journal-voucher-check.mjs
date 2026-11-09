import { chromium } from "playwright";

const BASE = "https://centuryccpl.in";
const LIST = BASE + "/cpanel/ListJournalVoucher.aspx";
const dryRun = String(process.env.DRY_RUN ?? "true").toLowerCase() !== "false";
const username = String(process.env.CENTURY_USERNAME ?? "").trim();
const password = String(process.env.CENTURY_PASSWORD ?? "").trim();
if (!username || !password) throw new Error("Missing CENTURY_USERNAME or CENTURY_PASSWORD GitHub Secret");

const pad = n => String(n).padStart(2, "0");
const parts = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Asia/Calcutta", year: "numeric", month: "2-digit", day: "2-digit"
}).formatToParts(new Date()).reduce((a, p) => (a[p.type] = p.value, a), {});
const runDate = `${parts.day}/${parts.month}/${parts.year}`;
const log = [];
const browser = await chromium.launch({ headless: false });
const context = await browser.newContext({
  userAgent: "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
  viewport: { width: 1365, height: 900 },
  locale: "en-IN",
});
const page = await context.newPage();

try {
  await page.goto(BASE + "/cpanel/Default.aspx", { waitUntil: "domcontentloaded" });
  const userField = page.locator("#username");
  const passField = page.locator("#password");
  if (!await userField.isVisible().catch(() => false)) {
    // Open the central LOGIN control before filling the credential form.
    await page.locator("#modalOpen").click({ force: true });
    await userField.waitFor({ state: "visible", timeout: 10000 });
  }
  await userField.fill(username);
  await passField.fill(password);
  await page.locator("#modalLogin").click({ force: true });
  await page.waitForTimeout(1500);
  await page.waitForURL(url => !url.toString().includes("Default.aspx"), { timeout: 15000 }).catch(async () => {
    const visibleText = await page.locator("body").innerText().catch(() => "");
    throw new Error("Century CCPL login did not complete. Visible page text: " + visibleText.slice(0, 1000));
  });
  if (page.url().includes("Default.aspx")) {
    const state = await page.locator("body").innerText().catch(() => "");
    throw new Error("Century CCPL login did not complete. URL=" + page.url() + " title=" + await page.title() + " text=" + state.slice(0, 1000));
  }

  await page.goto(LIST, { waitUntil: "domcontentloaded" });
  await page.locator("#tb_FromDate").fill(runDate);
  await page.locator("#tb_ToDate").fill(runDate);
  await page.locator("#d_Search").click();
  await page.waitForTimeout(1200);

  const seen = new Set();
  let safety = 0;
  while (safety++ < 100) {
    const rows = await page.locator("#gv_Cashbook tr").evaluateAll(trs => trs.slice(1).map(tr => {
      const c = [...tr.querySelectorAll("td")].map(x => x.innerText.trim());
      const u = (c[7] || "").split(String.fromCharCode(10)).map(x => x.trim()).filter(Boolean);
      return { voucher: c[1], voucherDate: c[5], user: u[0] || "", userDate: u[1] || "", href: tr.querySelector('a[title="Edit"],a[href*="AddJournalVoucher"]')?.href || "" };
    }).filter(x => x.voucher));

    for (const row of rows) {
      if (seen.has(row.voucher)) continue;
      seen.add(row.voucher);
      if (!["RAJP", "MAHBUB"].includes(row.user)) continue;
      if (row.voucherDate === row.userDate) continue;
      const entry = { voucher: row.voucher, user: row.user, oldDate: row.voucherDate, targetDate: row.userDate, result: "DRY_RUN" };
      if (!row.href) { entry.result = "SKIPPED_NO_EDIT"; log.push(entry); continue; }

      const edit = await context.newPage();
      await edit.goto(row.href, { waitUntil: "domcontentloaded" });
      const date = edit.locator("#tb_date");
      const saves = edit.locator('input[type="submit"],input[type="button"],button').filter({ hasText: /save/i });
      const saveCount = await saves.count();
      const visibleSave = saveCount ? await saves.first().isVisible().catch(() => false) : false;
      if (!visibleSave) {
        entry.result = "SKIPPED_NO_SAVE";
      } else if (!dryRun) {
        await date.fill(row.userDate);
        await saves.first().click();
        await edit.waitForTimeout(800);
        entry.result = "SAVED";
      }
      await edit.close();
      log.push(entry);
    }

    const links = await page.locator('[id^="rpt_Pager_lnk_Page_"]').evaluateAll(as => as.map(a => ({ id: a.id, text: a.innerText.trim(), disabled: a.className.includes("aspNetDisabled") })));
    const active = links.find(x => /^\\d+$/.test(x.text) && x.disabled);
    if (!active) break;
    const nextText = String(Number(active.text) + 1);
    let next = links.find(x => x.text === nextText && !x.disabled);
    if (!next) {
      const gt = links.find(x => x.text === ">>" && !x.disabled);
      if (!gt) break;
      await page.locator("#" + gt.id).click();
      await page.waitForTimeout(1000);
      const after = await page.locator('[id^="rpt_Pager_lnk_Page_"]').evaluateAll(as => as.map(a => ({ id: a.id, text: a.innerText.trim(), disabled: a.className.includes("aspNetDisabled") })));
      next = after.find(x => /^\\d+$/.test(x.text) && !x.disabled);
    }
    if (!next) break;
    await page.locator("#" + next.id).click();
    await page.waitForTimeout(1000);
  }
  console.log(JSON.stringify({ runDate, dryRun, vouchersSeen: seen.size, entries: log }, null, 2));
} finally {
  await browser.close();
}