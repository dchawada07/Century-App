import {createPrivateIntentStore} from './private-intent-store.mjs';

import assert from 'node:assert/strict';
const dirs=new Set(['/private']),files=new Map();
const io={
 lstat:async()=>({isDirectory:()=>true,isSymbolicLink:()=>false,mode:0o700,uid:process.getuid()}),
 mkdir:async p=>{if(dirs.has(p))throw Object.assign(Error(),{code:'EEXIST'});dirs.add(p);},
 open:async(p,flags,mode)=>{if(flags==='wx'){assert.equal(mode,0o600);if(files.has(p))throw Error('EXISTS');files.set(p,'');}
 return {writeFile:async v=>files.set(p,v),sync:async()=>{},close:async()=>{}};},
 readFile:async p=>{if(!files.has(p))throw Object.assign(Error(),{code:'ENOENT'});return files.get(p);}
};
const args={root:'/private',persistent:true,io};
const s=await createPrivateIntentStore(args);
const data={account:'fixture',recordId:'101',target:'2026-11-08',expectedDate:'2026-11-05'};
const tokens=await Promise.all([s.reserve(data),s.reserve({...data,expectedDate:'2026-11-04'})]);
assert.equal(tokens.filter(Boolean).length,1);
const restart=await createPrivateIntentStore(args);
assert.equal(await restart.reserve(data),null);
await restart.finish(tokens.find(Boolean),'VERIFIED_PERSISTED');
assert.equal((await restart.inspect(data)).outcome.status,'VERIFIED_PERSISTED');
await assert.rejects(()=>restart.finish(tokens.find(Boolean),'UNKNOWN_SAVE_OUTCOME'));
await assert.rejects(()=>createPrivateIntentStore({...args,persistent:false}));
await assert.rejects(()=>createPrivateIntentStore({...args,io:{...io,lstat:async()=>({isDirectory:()=>true,isSymbolicLink:()=>false,mode:0o755,uid:process.getuid()})}}));
console.log('Private-store tests passed: concurrency, restart, immutable key/outcome, privacy/configuration. Mock filesystem only; no production store provisioned.');
