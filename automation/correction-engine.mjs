// Pure correction transaction engine. No network, credentials, logging or scheduling.
// A live adapter is intentionally not supplied. Production activation remains disabled.
const USERS = new Set(['RAJP', 'MAHBUB']);
const ORIGIN = 'https://centuryccpl.in';
export function isoDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value || '')) return false;
  const d = new Date(value + 'T00:00:00Z');
  return Number.isFinite(+d) && d.toISOString().slice(0,10) === value;
}
export function indiaPreviousDay(now) {
  const p = new Intl.DateTimeFormat('en-GB', {timeZone:'Asia/Kolkata',year:'numeric',month:'2-digit',day:'2-digit'})
    .formatToParts(now).reduce((a,x)=>(a[x.type]=x.value,a),{});
  return new Date(Date.UTC(+p.year,+p.month-1,+p.day)-86400000).toISOString().slice(0,10);
}
function identity(a,b) {
  return ['recordId','voucher','branch','user','userDate'].every(k=>a[k]===b[k]);
}
function fieldsEqual(a,b) {
  const keys=Object.keys(a).sort();
  return JSON.stringify(keys)===JSON.stringify(Object.keys(b).sort()) &&
    keys.every(k=>a[k]===b[k]);
}
function formMatches(form,row) {
  let u; try {u=new URL(form.url);} catch {return false;}
  const entries=[...u.searchParams];
  return u.origin===ORIGIN && u.pathname==='/cpanel/AddJournalVoucher.aspx' &&
    entries.length===1 && entries[0][0]==='Id' && entries[0][1]===row.recordId &&
    form.recordId===row.recordId && form.voucher===row.voucher && form.branch===row.branch &&
    form.date===row.voucherDate && form.dateVisible===true && form.dateEnabled===true &&
    form.nonDateFields && typeof form.nonDateFields==='object';
}
/**
 * Adapter contract:
 * readRow(id): fresh, stable authoritative list row, never cached.
 * openForm(row)/inspectForm(): verified visible DOM snapshot including full non-date
 * business controls (amounts, ledgers, narration, voucher, branch, etc.).
 * fillDate(ISO): only the Date control; no synthetic full form submission.
 * saveOnce(): one exact observed Save click; transport must independently allow
 * exactly one matching edit POST and reject changed non-date business payload.
 * readBack(id): reload list + reopen same edit URL; return {row,formDate}.
 * No adapter may log details or credentials. All exceptions intentionally sanitized.
 */
export async function correctOne({candidate,coverage,target,adapter,now=()=>new Date()}) {
  const result=(status)=>({status,saveAttempts});
  let saveAttempts=0, stage='PREFLIGHT';
  try {
    if (!coverage || coverage.complete!==true || coverage.monotone!==true ||
      coverage.crossCheckComplete!==true || coverage.pages<1 || coverage.pages>10 ||
      coverage.scope!=='BOUNDED_RECENT') return result('BLOCKED_COVERAGE');
    if (!isoDate(target) || indiaPreviousDay(now())!==target) return result('BLOCKED_TARGET');
    if (!candidate || !/^\d+$/.test(candidate.recordId||'') ||
      !candidate.voucher || !candidate.branch || !USERS.has(candidate.user) ||
      candidate.userDate!==target || !isoDate(candidate.voucherDate)) return result('BLOCKED_CANDIDATE');
    if (candidate.voucherDate===target) return result('ALREADY_CORRECT');
    stage='FRESH_ROW';
    const fresh=await adapter.readRow(candidate.recordId);
    if (!fresh || !identity(fresh,candidate) || fresh.voucherDate!==candidate.voucherDate)
      return result('CHANGED_SINCE_SCAN');
    stage='FORM';
    const before=await adapter.openForm(fresh);
    if(!formMatches(before,fresh))return result('BLOCKED_FORM');
    if(before.saveCount===0)return result('SKIPPED_NO_SAVE');
    if(before.saveCount!==1 || before.saveEnabled!==true || before.saveVisible!==true)
      return result('BLOCKED_SAVE');
    // Recheck authoritative row immediately before filling.
    const finalRow=await adapter.readRow(candidate.recordId);
    if(!finalRow || !identity(finalRow,fresh) || finalRow.voucherDate!==fresh.voucherDate)
      return result('CHANGED_BEFORE_FILL');
    if(indiaPreviousDay(now())!==target)return result('BLOCKED_DAY_ROLLOVER');
    stage='FILL';
    await adapter.fillDate(target);
    const pending=await adapter.inspectForm();
    if(!formMatches({...pending,date:fresh.voucherDate},fresh) ||
      pending.date!==target || !fieldsEqual(before.nonDateFields,pending.nonDateFields) ||
      pending.saveCount!==1 || pending.saveEnabled!==true || pending.saveVisible!==true)
      return result('BLOCKED_FIELD_CHANGE');
    if(indiaPreviousDay(now())!==target)return result('BLOCKED_DAY_ROLLOVER');
    stage='INTENT';
    // Durable private compare-and-set; existing intent MUST be reconciled, not retried.
    if(await adapter.reserveIntent({recordId:fresh.recordId,target,expectedDate:fresh.voucherDate})!==true)
      return result('BLOCKED_EXISTING_INTENT');
    if(indiaPreviousDay(now())!==target)return result('BLOCKED_DAY_ROLLOVER');
    stage='SAVE';
    saveAttempts=1; // Count attempted click even if it throws. Never retry.
    try { await adapter.saveOnce(); } catch {}
    stage='READBACK';
    const persisted=await adapter.readBack(candidate.recordId);
    if(persisted && persisted.row && identity(persisted.row,fresh) &&
      persisted.row.voucherDate===target && persisted.formDate===target &&
      fieldsEqual(before.nonDateFields,persisted.nonDateFields))
      { await adapter.recordOutcome('VERIFIED_PERSISTED'); return result('VERIFIED_PERSISTED'); }
    await adapter.recordOutcome('UNKNOWN_SAVE_OUTCOME');
    return result('UNKNOWN_SAVE_OUTCOME');
  } catch {
    return result(saveAttempts ? 'UNKNOWN_SAVE_OUTCOME' : 'BLOCKED_'+stage);
  } finally {
    // Closing must never save or auto-submit unsaved edits.
    try { await adapter.closeWithoutSave(); } catch {}
  }
}
