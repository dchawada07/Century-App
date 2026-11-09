// Requires a pre-provisioned private persistent POSIX directory.
// GitHub-hosted runner temp folders, caches and public artifacts are NOT supported.
import * as fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
const keyOf=({account,recordId,target})=>createHash('sha256').update(JSON.stringify([account,recordId,target])).digest('hex');
export async function createPrivateIntentStore({root,persistent=false,io=fs}) {
 if(!persistent||!path.isAbsolute(root||''))throw Error('PRIVATE_PERSISTENT_STORAGE_REQUIRED');
 const st=await io.lstat(root);
 if(!st.isDirectory()||st.isSymbolicLink()||(st.mode&0o077)!==0||
   (typeof process.getuid==='function'&&st.uid!==process.getuid()))throw Error('PRIVATE_DIRECTORY_REQUIRED');
 async function syncDir(dir){const f=await io.open(dir,'r');try{await f.sync();}finally{await f.close();}}
 async function writeOnce(file,value){const f=await io.open(file,'wx',0o600);try{await f.writeFile(JSON.stringify(value));await f.sync();}finally{await f.close();}}
 return {
  async reserve(data){
   if(!data.account||!/^\d+$/.test(data.recordId||'')||!/^\d{4}-\d{2}-\d{2}$/.test(data.target||''))throw Error('INTENT_SCHEMA');
   const key=keyOf(data),dir=path.join(root,key);
   try{await io.mkdir(dir,{mode:0o700});}catch(e){if(e.code==='EEXIST')return null;throw Error('INTENT_UNAVAILABLE');}
   // A crash from here leaves the key occupied: fail closed and reconcile privately.
   await syncDir(root);
   await writeOnce(path.join(dir,'intent.json'),{version:1,...data,status:'INTENT',created:new Date().toISOString()});
   await syncDir(dir);
   return {key};
  },
  async finish(token,status){
   if(!/^[a-f0-9]{64}$/.test(token?.key||'')||!['VERIFIED_PERSISTED','UNKNOWN_SAVE_OUTCOME'].includes(status))throw Error('OUTCOME_SCHEMA');
   const dir=path.join(root,token.key);
   await writeOnce(path.join(dir,'outcome.json'),{status,recorded:new Date().toISOString()});
   await syncDir(dir);
  },
  async inspect(data){
   const dir=path.join(root,keyOf(data));
   const read=async name=>{try{return JSON.parse(await io.readFile(path.join(dir,name),'utf8'));}catch(e){if(e.code==='ENOENT')return null;throw Error('INTENT_READ_FAILED');}};
   return {intent:await read('intent.json'),outcome:await read('outcome.json')};
  }
 };
}
