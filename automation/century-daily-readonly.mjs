import { chromium } from 'playwright';

const origin = 'https://centuryccpl.in';
const loginUrl = origin + '/cpanel/Default.aspx';
const listUrl = origin + '/cpanel/ListJournalVoucher.aspx';
let stage = 'secrets';
let browser;
let partialCounts=null;
let observedPage=null, expectedPage=null;
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
  observedPage=page;
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
        return {recordId:tr.querySelector('input[id^="gv_Cashbook_tb_Id_"]')?.value||'',voucher:c[1]||'',date:c[5]||'',userCell:c[7]||'',columns:c.length};
      }):null
    };
  });

  const target=previousDay();
  const asDisplay=iso=>iso.slice(8,10)+'/'+iso.slice(5,7)+'/'+iso.slice(0,4);
  function parse(p){
    if((p.rows||[]).some(r=>r.columns===11&&!/^\d+$/.test(r.recordId)))throw new Error();
    return (p.rows||[]).filter(r=>r.columns===11&&/^\d+$/.test(r.recordId)).map(r=>{
      const parts=r.userCell.split(/\r?\n/).map(s=>s.trim()).filter(Boolean);
      return {...r,user:parts[0]||'',userDate:strictDate(parts[1]||''),voucherDate:strictDate(r.date)};
    });
  }
  async function ready(){
    let prior=null;
    for(let n=0;n<20;n++){
      if(!page.url().split('?')[0].endsWith('/cpanel/ListJournalVoucher.aspx'))throw new Error();
      const p=await read();
      if(!p.filters.period)throw new Error();
      const sig=JSON.stringify({rows:p.rows,active:p.active,filters:p.filters});
      if(sig===prior)return p;
      prior=sig;await page.waitForTimeout(300);
    }
    throw new Error();
  }
  async function query({from,to,branch='0',voucher=''}){
    await page.goto(listUrl,{waitUntil:'domcontentloaded',timeout:60000});
    await page.locator('#ddl_month').selectOption('3');
    await page.waitForLoadState('domcontentloaded');
    await page.locator('#dd_Branch').selectOption(branch);await page.waitForLoadState('domcontentloaded');
    await page.locator('#tb_VoucherNo').fill(voucher);
    await page.locator('#tb_Ledger').fill('');
    await page.locator('#tb_FromDate').fill(from);
    await page.locator('#tb_ToDate').fill(to);
    await page.locator('#spinner').waitFor({state:'hidden',timeout:10000}).catch(()=>{});
    const [response]=await Promise.all([
      page.waitForResponse(r=>r.url().split('?')[0]===listUrl&&r.request().method()==='POST',{timeout:60000}),
      page.locator('#d_Search').click()
    ]);
    await response.finished();await page.waitForLoadState('domcontentloaded');
    const p=await ready();
    if(p.filters.from!==from||p.filters.to!==to||p.filters.branch!==branch||p.filters.voucher!==voucher){console.log('FILTER_VALIDATION '+JSON.stringify({fromMatches:p.filters.from===from,toMatches:p.filters.to===to,branchMatches:p.filters.branch===branch,voucherMatches:p.filters.voucher===voucher}));throw new Error();}
    return p;
  }
  async function next(p,number){
    const link=p.pager.find(x=>x.text===String(number+1)&&x.enabled)||p.pager.find(x=>x.text==='>>'&&x.enabled);
    if(!link)return null;
    expectedPage=number+1;
    await page.locator('#spinner').waitFor({state:'hidden',timeout:10000}).catch(()=>{});
    await page.locator('#'+link.id).click();await page.waitForLoadState('domcontentloaded');
    for(let n=0;n<20;n++){
      const q=await ready();if(q.active===number+1)return q;
      if(q.active!==number)throw new Error();
      await page.waitForTimeout(250);
    }
    throw new Error();
  }
  stage='date-filter-semantics';
  const initial=await ready();
  const candidate=parse(initial).find(r=>r.userDate&&r.voucherDate&&r.userDate!==r.voucherDate&&/^[A-Z]+-\d+$/.test(r.voucher));
  let semantics='UNPROVEN';
  if(candidate){
    const [branchPrefix,numeric]=candidate.voucher.split('-');
    const branches=await page.locator('#dd_Branch option').evaluateAll(es=>es.map(e=>({value:e.value,text:e.textContent.trim()})));
    const branch=branches.find(x=>x.text.split(/\s+/)[0]===branchPrefix)?.value;
    if(branch){
      const a=await query({from:asDisplay(candidate.userDate),to:asDisplay(candidate.userDate),branch,voucher:numeric});
      const usernameDateIncludes=parse(a).some(r=>r.recordId===candidate.recordId);
      const b=await query({from:asDisplay(candidate.voucherDate),to:asDisplay(candidate.voucherDate),branch,voucher:numeric});
      const voucherDateIncludes=parse(b).some(r=>r.recordId===candidate.recordId);
      semantics=usernameDateIncludes&&!voucherDateIncludes?'USERNAME_DATE':!usernameDateIncludes&&voucherDateIncludes?'VOUCHER_DATE':'UNPROVEN';
      console.log('DATE_FILTER_PROBE '+JSON.stringify({usernameDateIncludes,voucherDateIncludes,semantics,recordDetails:'not logged'}));
    }
  }
  stage='previous-day-filter';
  let p=await query({from:asDisplay(target),to:asDisplay(target)});
  const filtered=new Map();
  let filterPages=0,filterComplete=false;
  for(let n=1;n<=10;n++){
    filterPages++;
    for(const r of parse(p)){if(filtered.has(r.recordId)&&JSON.stringify(filtered.get(r.recordId))!==JSON.stringify(r))throw new Error();filtered.set(r.recordId,r);}
    const forward=p.pager.find(x=>x.text==='>>');
    const more=p.pager.some(x=>x.enabled&&(/^\d+$/.test(x.text)?Number(x.text)>n:x.text==='>>'));
    if(!more){filterComplete=true;break;}
    if(n===10)break;
    p=await next(p,n);
    if(!p)throw new Error();
  }
  const filteredEligible=[...filtered.values()].filter(r=>r.user==='RAJP'||r.user==='MAHBUB');
  const filteredTarget=filteredEligible.filter(r=>r.userDate===target);
  console.log('DAILY_FILTER_SUMMARY '+JSON.stringify({targetUsernameDate:target,timezone:'Asia/Kolkata',semantics,
    filterPages,filterComplete,totalRows:filtered.size,eligibleRows:filteredEligible.length,
    authoritativePreviousDayRows:filteredTarget.length,mismatches:filteredTarget.filter(r=>r.voucherDate!==r.userDate).length,
    eligibleRowsOutsideAuthoritativeDay:filteredEligible.filter(r=>r.userDate!==target).length}));
  // Bounded independent recent-entry check, never an all-history scan.
  stage='bounded-recent-check';
  p=await query({from:'',to:''});
  const recent=new Map();let recentPages=0,olderPages=0,boundary=false,monotone=true,priorDate=null;
  for(let n=1;n<=10;n++){
    recentPages++;
    const rows=parse(p);
    for(const r of rows){
      if(!r.userDate)throw new Error();
      if(priorDate&&r.userDate>priorDate)monotone=false;
      priorDate=r.userDate;if(recent.has(r.recordId)&&JSON.stringify(recent.get(r.recordId))!==JSON.stringify(r))throw new Error();recent.set(r.recordId,r);
    }
    if(rows.length&&rows.every(r=>r.userDate<target))olderPages++;else olderPages=0;
    if(olderPages>=2){boundary=true;break;}
    const more=p.pager.some(x=>x.enabled&&(/^\d+$/.test(x.text)?Number(x.text)>n:x.text==='>>'));
    if(!more){boundary=true;break;}
    if(n===10)break;
    p=await next(p,n);if(!p)throw new Error();
  }
  const recentTarget=[...recent.values()].filter(r=>(r.user==='RAJP'||r.user==='MAHBUB')&&r.userDate===target);
  const missing=recentTarget.filter(r=>!filtered.has(r.recordId));
  console.log('BOUNDED_RECENT_SUMMARY '+JSON.stringify({recentPages,rows:recent.size,olderBoundaryObserved:boundary,
    authoritativeDatesMonotoneInObservedRows:monotone,targetDayRows:recentTarget.length,
    mismatches:recentTarget.filter(r=>r.voucherDate!==r.userDate).length,targetDayRowsMissingFromDateFilter:missing.length,
    scope:'At most 10 recent pages, stops after two complete older pages; no all-history scan'}));
  if(!boundary||!monotone||!filterComplete){stage='daily-coverage-incomplete';throw new Error();}
  console.log('Result: READ_ONLY_DAILY_TEST_FINISHED. Coverage is limited to tested filter semantics and observed recent window; no edits or schedule.');
 } catch (err) {
  const errorText=String(err?.message||'');
  console.log('Failure category: '+(err?.name==='TimeoutError'?'TIMEOUT':/Execution context was destroyed/.test(errorText)?'NAVIGATION_RACE':'VALIDATION'));
  if(observedPage){
    const pager=await observedPage.locator('a[id^="rpt_Pager"]').evaluateAll(es=>es.map(e=>({id:e.id,text:e.innerText.trim(),enabled:!!e.getAttribute('href')}))).catch(()=>[]);
    console.log('PAGINATION_DIAGNOSTICS '+JSON.stringify({expectedPage,pager}));
  }
  if(partialCounts)console.log('INCOMPLETE_AUDIT_AGGREGATES '+JSON.stringify(partialCounts));
  console.log('Non-sensitive diagnostics: ' + JSON.stringify(diagnostics));
  console.log('Result: FAIL at stage ' + stage + '. No record changes attempted.');
  process.exitCode = 1;
} finally {
  if (browser) await browser.close().catch(() => {});
}
