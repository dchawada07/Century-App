// Playwright adapter. Not invoked by any workflow. No credentials, logs or scheduler.
// Caller supplies an authenticated context, bounded fresh-row lookup, durable private store,
// and a record-bound transport guard. Missing dependencies fail closed.
const origin='https://centuryccpl.in';
const display=d=>d.slice(8,10)+'/'+d.slice(5,7)+'/'+d.slice(0,4);
function parse(s){const m=/^(\d{2})\/(\d{2})\/(\d{4})$/.exec(s||'');return m?m[3]+'-'+m[2]+'-'+m[1]:null;}
export function createCenturyAdapter({context,readFreshRow,store,transport,account,enableWrites=false}) {
 if(!context||typeof readFreshRow!=='function'||!store||!transport||!account)throw Error('CONFIGURATION');
 let page,row,before,intent,target,closed=false;
 async function snapshot(){
  const u=new URL(page.url());
  if(u.origin!==origin||u.pathname!=='/cpanel/AddJournalVoucher.aspx'||u.searchParams.get('Id')!==row.recordId)
   throw Error('IDENTITY');
  const state=await page.evaluate(()=>{
   const date=document.querySelector('#tb_date'), voucher=document.querySelector('#tb_voucherNo'),branch=document.querySelector('#tb_Branch');
   const visible=e=>!!e&&!!(e.offsetWidth||e.offsetHeight||e.getClientRects().length);
   const saves=[...document.querySelectorAll('input[type=submit],input[type=button],button')]
    .filter(e=>/^save$/i.test((e.value||e.innerText||'').trim()));
   const fields=[...document.querySelectorAll('input,textarea,select')].filter(e=>e.name && !['submit','button','file'].includes(e.type));
   if(fields.some(e=>e.type==='password'))throw Error('UNEXPECTED_FORM');
   const business={};
   for(const e of fields){
    if(['__VIEWSTATE','__VIEWSTATEGENERATOR','__EVENTVALIDATION','__EVENTTARGET','__EVENTARGUMENT','tb_time','tb_date'].includes(e.name))continue;
    if(Object.hasOwn(business,e.name))throw Error('DUPLICATE_CONTROL');
    business[e.name]=e.type==='checkbox'||e.type==='radio'?String(e.checked):e.value;
   }
   const ledgers=[...document.querySelectorAll('input[id^="gv_List_tb_LedgerName_"]')].map(e=>{
    const i=e.id.split('_').pop();
    const value=id=>document.getElementById(id)?.value;
    const debit=value('gv_List_tb_DebitAmount_'+i),credit=value('gv_List_tb_CreditAmount_'+i),narration=value('gv_List_tb_Remark_'+i);
    if([debit,credit,narration].some(v=>typeof v!=='string'))throw Error('LINE_SCHEMA');
    const sub=[...document.querySelectorAll('[id^="gv_List_gv_SubLedger_'+i+'_"]')].filter(x=>x.name&&'value'in x).map(x=>[x.name,x.value]);
    return {ledger:e.value,debit,credit,narration,subledger:JSON.stringify(sub)};
   });
   const submit=saves.length===1?saves[0]:null;
   const owner=submit?.form;
   const payload=owner?[...new FormData(owner)].map(([k,v])=>{if(typeof v!=='string')throw Error('FILE_FORM');return [k,v];}):null;
   if(payload&&submit?.name)payload.push([submit.name,submit.value]);
   return {date:date?.value,dateVisible:visible(date),dateEnabled:!!date&&!date.disabled,
    voucher:voucher?.value,branch:branch?.value,saveCount:saves.length,saveVisible:visible(submit),
    saveEnabled:!!submit&&!submit.disabled,saveName:submit?.name,saveValue:submit?.value,
    business,ledgers,payload};
  });
  if(!state.voucher||!state.branch||!state.ledgers.length)throw Error('FORM_SCHEMA');
  return {...state,url:u.href,recordId:row.recordId,voucher:row.voucher,date:parse(state.date),
   // Numeric voucher and branch label independently bind actual controls to candidate.
   identityValid:state.voucher===row.voucher.split('-').pop()&&state.branch===row.branch,
   nonDateFields:{...state.business,voucher:state.voucher,branch:state.branch,ledgerLines:JSON.stringify(state.ledgers)}};
 }
 return {
  readRow:async id=>readFreshRow(id),
  openForm:async r=>{
   row=r;page=await context.newPage();
   await page.goto(origin+'/cpanel/AddJournalVoucher.aspx?Id='+encodeURIComponent(r.recordId),{waitUntil:'domcontentloaded'});
   before=await snapshot();if(!before.identityValid)throw Error('IDENTITY');
   return before;
  },
  fillDate:async iso=>{
   if(!enableWrites)throw Error('WRITES_DISABLED');
   target=iso;await page.locator('#tb_date').fill(display(iso));await page.locator('#tb_date').press('Tab');
  },
  inspectForm:async()=>{const p=await snapshot();if(!p.identityValid)throw Error('IDENTITY');return p;},
  reserveIntent:async data=>{
   if(!enableWrites)return false;
   intent=await store.reserve({account,...data});
   return !!intent;
  },
  saveOnce:async()=>{
   if(!enableWrites||!intent||!target)throw Error('WRITES_DISABLED');
   const pending=await snapshot();
   if(!pending.identityValid||pending.saveCount!==1||!pending.saveVisible||!pending.saveEnabled||
     !pending.saveName||!pending.payload||pending.date!==target)throw Error('SAVE_PREFLIGHT');
   if(JSON.stringify(before.nonDateFields)!==JSON.stringify(pending.nonDateFields))throw Error('FIELD_CHANGE');
   // arm() independently validates exact payload and consumes its permit once.
   await transport.arm({url:pending.url,recordId:row.recordId,beforePayload:before.payload,
    pendingPayload:pending.payload,dateName:'tb_date',dateValue:display(target),
    submitName:pending.saveName,submitValue:pending.saveValue,durableIntent:intent});
   await page.getByRole('button',{name:'Save',exact:true}).click();
  },
  readBack:async id=>{
   const reread=await readFreshRow(id);
   await page.goto(origin+'/cpanel/AddJournalVoucher.aspx?Id='+encodeURIComponent(id),{waitUntil:'domcontentloaded'});
   const after=await snapshot();if(!after.identityValid)throw Error('IDENTITY');
   return {row:reread,formDate:after.date,nonDateFields:after.nonDateFields};
  },
  recordOutcome:async status=>{if(!intent)throw Error('NO_INTENT');await store.finish(intent,status);},
  closeWithoutSave:async()=>{if(closed)return;closed=true;await transport.disarm();if(page)await page.close();}
 };
}
