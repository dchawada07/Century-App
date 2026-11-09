import {createCenturyAdapter} from './century-correction-adapter.mjs';

import assert from 'node:assert/strict';
const row={recordId:'101',voucher:'TEST-1',branch:'TEST',user:'RAJP',userDate:'2026-11-08',voucherDate:'2026-11-05'};
let url='',filled=0,clicked=0,armed=0,disabled=0;
const state={date:'05/11/2026',dateVisible:true,dateEnabled:true,voucher:'1',branch:'TEST',saveCount:1,saveVisible:true,saveEnabled:true,saveName:'save',saveValue:'Save',business:{amount:'123'},ledgers:[{ledger:'fixture',debit:'123',credit:'0',narration:'',subledger:''}],payload:[['tb_date','05/11/2026'],['save','Save']]};
const page={goto:async u=>{url=u},url:()=>url,evaluate:async()=>structuredClone(state),locator:()=>({fill:async v=>{filled++;state.date=v},press:async()=>{}}),getByRole:()=>({click:async()=>{clicked++}}),close:async()=>{}};
const config={context:{newPage:async()=>page},readFreshRow:async()=>row,account:'fixture',
store:{reserve:async()=>({key:'fixture'}),finish:async()=>{}},transport:{arm:async()=>{armed++},disarm:async()=>{disabled++}}};
const a=createCenturyAdapter(config);
assert.equal((await a.openForm(row)).date,'2026-11-05');
await assert.rejects(()=>a.fillDate('2026-11-08'));
assert.equal(await a.reserveIntent({}),false);
await assert.rejects(()=>a.saveOnce());
assert.equal(filled,0);assert.equal(clicked,0);assert.equal(armed,0);
await a.closeWithoutSave();assert.equal(disabled,1);
state.branch='WRONG';
const b=createCenturyAdapter(config);await assert.rejects(()=>b.openForm(row));
state.branch='TEST';state.voucher='2';
const c=createCenturyAdapter(config);await assert.rejects(()=>c.openForm(row));
console.log('Adapter mock tests passed: inspection, default no-write gate, wrong branch/voucher, close disarm. No ERP/network used.');

state.voucher='1';state.branch='TEST';state.date='05/11/2026';
const enabled=createCenturyAdapter({...config,enableWrites:true});
await enabled.openForm(row);
await enabled.fillDate('2026-11-08');
assert.equal((await enabled.inspectForm()).date,'2026-11-08');
assert.equal(await enabled.reserveIntent({recordId:'101',target:'2026-11-08',expectedDate:'2026-11-05'}),true);
state.business.amount='999';
await assert.rejects(()=>enabled.saveOnce());
assert.equal(clicked,0);assert.equal(armed,0);
state.business.amount='123';
await enabled.saveOnce();
assert.equal(clicked,1);assert.equal(armed,1);
const back=await enabled.readBack('101');assert.equal(back.formDate,'2026-11-08');
await enabled.closeWithoutSave();
console.log('Enabled adapter mock transaction also passed; business-field change blocks Save.');
