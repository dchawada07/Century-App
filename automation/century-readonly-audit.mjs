import { chromium } from 'playwright';

const origin = 'https://centuryccpl.in';
const loginUrl = origin + '/cpanel/Default.aspx';
const listUrl = origin + '/cpanel/ListJournalVoucher.aspx';
let stage = 'secrets';
let browser;
let partialCounts=null;
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
    if (method === 'POST' && u.pathname === '/cpanel/ListJournalVoucher.aspx') {
      const form = new URLSearchParams(req.postData() || '');
      const target=form.get('__EVENTTARGET')||'';
      const readAction=/^(ddl_month|dd_Branch|rpt_Pager\$ctl\d+\$lnk_Page)$/.test(target)||form.has('d_Search');
      const selected=[...form.keys()].some(k=>/^gv_Cashbook.*cb_Id/.test(k));
      if(readAction&&!selected)return route.continue();
      diagnostics.blockedRequests++;return route.abort();
    }
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

  // All-time list avoids hiding a backdated voucher created yesterday.
  stage = 'all-time-filter';
  await page.locator('#ddl_month').selectOption('3');
  await page.waitForLoadState('domcontentloaded');
  await page.locator('#tb_VoucherNo').fill('');
  await page.locator('#tb_Ledger').fill('');
  await page.locator('#tb_FromDate').fill('');
  await page.locator('#tb_ToDate').fill('');
  await page.locator('#spinner').waitFor({state:'hidden',timeout:30000}).catch(()=>{});
  await Promise.all([
    page.waitForResponse(r=>r.url().split('?')[0]===listUrl && r.request().method()==='POST',{timeout:60000}),
    page.locator('#d_Search').click()
  ]);
  await page.waitForLoadState('domcontentloaded');
  function strictDate(text) {
    const match=String(text).trim().match(/^(\d{2})\/(\d{2})\/(\d{4})(?=$|\s)/);
    if(!match) return null;
    const [,dd,mm,yyyy]=match;
    const d=new Date(Date.UTC(+yyyy,+mm-1,+dd));
    return d.getUTCFullYear()===+yyyy && d.getUTCMonth()===+mm-1 && d.getUTCDate()===+dd
      ? yyyy+'-'+mm+'-'+dd : null;
  }
  function previousDay(now=new Date()) {
    const p=new Intl.DateTimeFormat('en-GB',{timeZone:'Asia/Kolkata',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(now)
      .reduce((a,x)=>(a[x.type]=x.value,a),{});
    return new Date(Date.UTC(+p.year,+p.month-1,+p.day)-86400000).toISOString().slice(0,10);
  }
  // Deterministic regression tests execute before processing records.
  if(strictDate('29/02/2024 12:00')!=='2024-02-29'||strictDate('29/02/2025')!==null||
     previousDay(new Date('2026-12-31T19:00:00Z'))!=='2026-12-31'||
     previousDay(new Date('2026-11-08T18:29:59Z'))!=='2026-11-07'||
     previousDay(new Date('2026-11-08T18:30:00Z'))!=='2026-11-08') throw new Error();
  const target=previousDay();
  const read = async()=>page.locator('body').evaluate(body=>{
    const table=body.querySelector('#gv_Cashbook');
    const pager=[...body.querySelectorAll('a[id^="rpt_Pager"]')].map(a=>({
      id:a.id,text:a.innerText.trim(),enabled:!!a.getAttribute('href')&&!a.classList.contains('aspNetDisabled')
    }));
    const active=pager.filter(a=>/^\d+$/.test(a.text)&&!a.enabled);
    return {
      active:active.length===1?Number(active[0].text):null,
      pager,
      filters:{period:body.querySelector('#ddl_month')?.value,branch:body.querySelector('#dd_Branch')?.value,
        from:body.querySelector('#tb_FromDate')?.value,to:body.querySelector('#tb_ToDate')?.value,
        voucher:body.querySelector('#tb_VoucherNo')?.value,ledger:body.querySelector('#tb_Ledger')?.value},
      headers:table?[...table.querySelectorAll('th')].map(e=>e.innerText.trim()):[],
      rows:table?[...table.querySelectorAll('tr')].filter(tr=>tr.querySelector('td')).map(tr=>{
        const c=[...tr.querySelectorAll('td')].map(e=>e.innerText.trim());
        return {voucher:c[1]||'',date:c[5]||'',userCell:c[7]||'',columns:c.length};
      }):null
    };
  });
  const signature=p=>JSON.stringify({active:p.active,rows:p.rows,filters:p.filters});
  async function stable(expected) {
    let prior=null;
    for(let attempt=0;attempt<15;attempt++){
      const p=await read();
      if(p.filters.period!=='3'||p.filters.branch!=='0'||p.filters.from||p.filters.to||p.filters.voucher||p.filters.ledger) throw new Error();
      if(p.rows&&p.rows.length&&p.active===expected && p.headers[1]==='Voucher No.'&&p.headers[5]==='Date&Time'&&p.headers[7]==='User Name'){
        const sig=signature(p);
        if(sig===prior)return p;
        prior=sig;
      }
      await page.waitForTimeout(250);
    }
    throw new Error();
  }
  stage='scan';
  let firstPass=null;
  for(let pass=1;pass<=2;pass++){
  const seen=new Map(), pages=new Set();
  const exceptions=[]; // Memory only: never print or upload voucher-level records.
  let counts={pages:0,uniqueRows:0,eligibleUsers:0,excludedUsers:0,targetDayRows:0,targetDayMismatches:0,
    targetDayMatches:0,malformedRows:0,invalidEligibleDates:0,allTimeMismatches:0,duplicateRows:0};
  partialCounts=counts;
  let current=await stable(1);
  const firstSignature=signature(current);
  for(let number=1;number<=1000;number++){
    if(current.active!==number||pages.has(number))throw new Error();
    pages.add(number);counts.pages++;
    for(const row of current.rows){
      if(row.columns!==11||!/^[A-Z]+-\d+$/.test(row.voucher)){counts.malformedRows++;continue;}
      if(seen.has(row.voucher)){counts.duplicateRows++;throw new Error();}
      seen.set(row.voucher,JSON.stringify(row));counts.uniqueRows++;
      const parts=row.userCell.split(/\r?\n/).map(s=>s.trim()).filter(Boolean);
      const user=parts[0]||'';
      if(!user){counts.malformedRows++;continue;}
      if(user!=='RAJP'&&user!=='MAHBUB'){counts.excludedUsers++;continue;}
      counts.eligibleUsers++;
      const userDate=strictDate(parts[1]||''),voucherDate=strictDate(row.date);
      if(!userDate||!voucherDate){counts.invalidEligibleDates++;exceptions.push({kind:'INVALID_DATE',voucher:row.voucher});continue;}
      if(userDate!==voucherDate)counts.allTimeMismatches++;
      if(userDate!==target)continue;
      counts.targetDayRows++;
      if(userDate===voucherDate)counts.targetDayMatches++;
      else {counts.targetDayMismatches++;exceptions.push({kind:'DATE_MISMATCH',voucher:row.voucher,user,userDate,voucherDate});}
    }
    if(number%25===0)console.log('Progress aggregate: '+JSON.stringify({pass,pages:counts.pages,uniqueRows:counts.uniqueRows}));
    const exact=current.pager.find(p=>p.text===String(number+1)&&p.enabled);
    const forward=current.pager.find(p=>p.text==='>>');
    if(!exact&&forward&&!forward.enabled){
      stage='end-stability';
      // Re-open initial list, restore ALL filter, and compare first boundary.
      await page.goto(listUrl,{waitUntil:'domcontentloaded',timeout:60000});
      await page.locator('#ddl_month').selectOption('3');
      await page.waitForLoadState('domcontentloaded');
      await page.locator('#spinner').waitFor({state:'hidden',timeout:30000}).catch(()=>{});
      await Promise.all([
        page.waitForResponse(r=>r.url().split('?')[0]===listUrl&&r.request().method()==='POST',{timeout:60000}),
        page.locator('#d_Search').click()
      ]);
      await page.waitForLoadState('domcontentloaded');
      const first=await stable(1);
      if(signature(first)!==firstSignature)throw new Error();
      if(counts.malformedRows||counts.invalidEligibleDates||counts.duplicateRows)throw new Error();
      const snapshot=JSON.stringify([...seen.entries()].sort((a,b)=>a[0].localeCompare(b[0])));
      if(pass===1){firstPass=snapshot;console.log('First all-page pass complete; independently repeating full scan.');break;}
      if(snapshot!==firstPass){stage='cross-pass-instability';throw new Error();}
      console.log('AUDIT_SUMMARY '+JSON.stringify({mode:'READ_ONLY',scope:'ALL available dates and branches',targetUsernameDate:target,
        dateTimezone:'Asia/Kolkata',coverage:'two identical full all-time passes; disabled terminal next; per-page double-read; first boundary unchanged',
        ...counts,catchUp:'All-time mismatch count informational only; no repair authority expanded',
        saveAvailability:'NOT_ASSESSED',detailReport:'Withheld from public logs; aggregate-only test'}));
      console.log('Result: PASS. Audit complete; zero voucher edit pages opened; zero records changed.');
      break;
    }
    if(number===1000)throw new Error();
    const next=exact||(forward?.enabled?forward:null);
    if(!next)throw new Error();
    stage='pagination';
    await page.locator('#'+next.id).click();
    await page.waitForLoadState('domcontentloaded');
    try { current=await stable(number+1); }
    catch {
      const fresh=await read();
      if(fresh.active!==number)throw new Error();
      const retry=fresh.pager.find(p=>p.text===String(number+1)&&p.enabled)||fresh.pager.find(p=>p.text==='>>'&&p.enabled);
      if(!retry)throw new Error();
      await page.locator('#'+retry.id).click();
      await page.waitForLoadState('domcontentloaded');
      current=await stable(number+1);
    }
    stage='scan';
  }
  }
} catch {
  if(partialCounts)console.log('INCOMPLETE_AUDIT_AGGREGATES '+JSON.stringify(partialCounts));
  console.log('Non-sensitive diagnostics: ' + JSON.stringify(diagnostics));
  console.log('Result: FAIL at stage ' + stage + '. No record changes attempted.');
  process.exitCode = 1;
} finally {
  if (browser) await browser.close().catch(() => {});
}
