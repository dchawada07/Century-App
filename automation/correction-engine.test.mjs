import {correctOne,indiaPreviousDay} from './correction-engine.mjs';

import assert from 'node:assert/strict';
const baseline={recordId:'101',voucher:'TEST-1',branch:'TEST',user:'RAJP',userDate:'2026-11-08',voucherDate:'2026-11-05'};
const coverage={complete:true,monotone:true,crossCheckComplete:true,pages:3,scope:'BOUNDED_RECENT'};
function fixture(change={}) {
 const state={fills:0,saves:0,closed:0,intents:0,outcomes:[],persisted:false,pending:false};
 const row={...baseline,...change.row};
 const form=()=>({url:'https://centuryccpl.in/cpanel/AddJournalVoucher.aspx?Id=101',recordId:'101',
 voucher:'TEST-1',branch:'TEST',date:state.pending?'2026-11-08':'2026-11-05',
 dateVisible:true,dateEnabled:true,saveCount:1,saveVisible:true,saveEnabled:true,
 nonDateFields:{voucher:'TEST-1',amount:'123',narration:'fixture'},...change.form});
 let reads=0;
 const adapter={
  readRow:async()=>{reads++;return {...row,...(reads===2?change.secondRow:{})};},
  openForm:async()=>form(), fillDate:async d=>{assert.equal(d,'2026-11-08');state.fills++;state.pending=true;},
  inspectForm:async()=>({...form(),...change.pending}),
  reserveIntent:async()=>{state.intents++;return change.reserve!==false;},
  saveOnce:async()=>{state.saves++;state.persisted=!change.noPersist;if(change.saveThrows)throw Error('private');},
  readBack:async()=>{if(change.readThrows)throw Error('private');return {
   row:{...row,voucherDate:state.persisted?'2026-11-08':'2026-11-05',...change.backRow},
   formDate:change.backDate??(state.persisted?'2026-11-08':'2026-11-05'),
   nonDateFields:change.backFields||form().nonDateFields};},
  recordOutcome:async value=>state.outcomes.push(value),
  closeWithoutSave:async()=>{state.closed++;}
 };
 let clocks=0;
 return {state,args:{candidate:row,coverage:{...coverage,...change.coverage},target:change.target||'2026-11-08',
 adapter,now:()=>{clocks++;return new Date(change.rollover&&clocks>=change.rollover?'2026-11-09T18:30:00Z':'2026-11-09T12:00:00Z');}}};
}
let count=0;
async function check(name,change,status,saves=0) {
 const f=fixture(change);const r=await correctOne(f.args);
 assert.equal(r.status,status,name);assert.equal(f.state.saves,saves,name);
 assert.equal(r.saveAttempts,saves,name);assert.equal(f.state.closed,1,name);count++;
}
await check('RAJP happy',{},'VERIFIED_PERSISTED',1);
await check('MAHBUB happy',{row:{user:'MAHBUB'}},'VERIFIED_PERSISTED',1);
for(const user of ['VISHAL','rajp','RAJPX',''])await check('excluded '+user,{row:{user}},'BLOCKED_CANDIDATE');
await check('wrong creation day',{row:{userDate:'2026-11-07'}},'BLOCKED_CANDIDATE');
await check('invalid date',{row:{voucherDate:'2026-02-30'}},'BLOCKED_CANDIDATE');
await check('today prohibited',{target:'2026-11-09'},'BLOCKED_TARGET');
await check('already correct',{row:{voucherDate:'2026-11-08'}},'ALREADY_CORRECT');
for(const c of [{complete:false},{monotone:false},{crossCheckComplete:false},{pages:11},{scope:'ALL_HISTORY'}])
 await check('coverage', {coverage:c},'BLOCKED_COVERAGE');
for(const k of ['recordId','voucher','branch','user','userDate','voucherDate'])
 await check('fresh row changed '+k,{secondRow:{[k]:'changed'}},'CHANGED_BEFORE_FILL');
await check('wrong redirect',{form:{url:'https://centuryccpl.in/cpanel/AddJournalVoucher.aspx?Id=102'}},'BLOCKED_FORM');
await check('foreign origin',{form:{url:'https://example.com/cpanel/AddJournalVoucher.aspx?Id=101'}},'BLOCKED_FORM');
await check('form date changed',{form:{date:'2026-11-04'}},'BLOCKED_FORM');
await check('no save',{form:{saveCount:0}},'SKIPPED_NO_SAVE');
for(const f of [{saveCount:2},{saveEnabled:false},{saveVisible:false}])
 await check('unsafe save',{form:f},'BLOCKED_SAVE');
await check('business field changed',{pending:{nonDateFields:{amount:'999'}}},'BLOCKED_FIELD_CHANGE');
await check('date fill failed',{pending:{date:'2026-11-05'}},'BLOCKED_FIELD_CHANGE');
await check('rollover before fill',{rollover:2},'BLOCKED_DAY_ROLLOVER');
await check('rollover before intent',{rollover:3},'BLOCKED_DAY_ROLLOVER');
await check('existing intent',{reserve:false},'BLOCKED_EXISTING_INTENT');
await check('rollover after intent',{rollover:4},'BLOCKED_DAY_ROLLOVER');
await check('timeout after persist',{saveThrows:true},'VERIFIED_PERSISTED',1);
await check('timeout before persist',{saveThrows:true,noPersist:true},'UNKNOWN_SAVE_OUTCOME',1);
await check('no persist',{noPersist:true},'UNKNOWN_SAVE_OUTCOME',1);
await check('readback throws',{readThrows:true},'UNKNOWN_SAVE_OUTCOME',1);
await check('wrong readback identity',{backRow:{recordId:'102'}},'UNKNOWN_SAVE_OUTCOME',1);
await check('wrong reopened date',{backDate:'2026-11-05'},'UNKNOWN_SAVE_OUTCOME',1);
await check('other persisted change',{backFields:{amount:'999'}},'UNKNOWN_SAVE_OUTCOME',1);
assert.equal(indiaPreviousDay(new Date('2026-11-08T18:29:59Z')),'2026-11-07');count++;
assert.equal(indiaPreviousDay(new Date('2026-11-08T18:30:00Z')),'2026-11-08');count++;
console.log('Mock tests passed: '+count+'. No network, credentials, ERP writes, or schedules.');
