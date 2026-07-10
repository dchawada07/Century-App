const milestones = ['Trip Started','Arrived at Loading Point','Loading Started','Loading Completed — Waiting for Document','Vehicle Departed','Advance Payment Request','Final Payment Calculated','Driver Accepted Final Payment','Trip Closed'];
const branches = ['Delhi','Mumbai','Bengaluru'];
const roles = [['admin','Admin'],['branch_manager','Branch Manager'],['operations','Operations'],['tracking','Tracking'],['driver','Driver']];
const lanes = [
  {id:'LN-DEL-MUM',from:'Delhi',to:'Mumbai',km:1410,tat:42,rate:58000},
  {id:'LN-MUM-BLR',from:'Mumbai',to:'Bengaluru',km:980,tat:30,rate:43000},
  {id:'LN-BLR-DEL',from:'Bengaluru',to:'Delhi',km:2150,tat:66,rate:82000}
];
let state = {
  role: 'admin', branch: 'Delhi', view: 'control', note: 'Firebase push ready • SMS stub logs in-app',
  vehicles: [
    {registration:'DL 01 AB 4582',type:'12ft',branch:'Delhi',bucket:'Loading',idleHours:1.4},
    {registration:'MH 04 CX 9011',type:'container',branch:'Mumbai',bucket:'In-Transit',idleHours:0.2},
    {registration:'KA 05 MC 7720',type:'10ft',branch:'Bengaluru',bucket:'Available',idleHours:5.1},
    {registration:'DL 08 QW 1129',type:'9ft',branch:'Delhi',bucket:'Breakdown',idleHours:2.8}
  ],
  drivers: [
    {name:'Ramesh Kumar',branch:'Delhi',expiry:'2026-07-28',rating:87},
    {name:'Iqbal Khan',branch:'Mumbai',expiry:'2027-02-14',rating:92},
    {name:'Manoj S',branch:'Bengaluru',expiry:'2026-08-02',rating:79}
  ],
  trips: [
    {id:'TRP-0001',customer:'Century Retail',lane:lanes[0],vehicle:'DL 01 AB 4582',driver:'Ramesh Kumar',branch:'Delhi',step:3,eta:'Today 18:40',delayed:false,advance:'pending'},
    {id:'TRP-0002',customer:'Northstar Foods',lane:lanes[1],vehicle:'MH 04 CX 9011',driver:'Iqbal Khan',branch:'Mumbai',step:5,eta:'Tomorrow 09:20',delayed:true,advance:'approved'},
    {id:'TRP-0003',customer:'Metro Components',lane:lanes[2],vehicle:'KA 05 MC 7720',driver:'Manoj S',branch:'Bengaluru',step:8,eta:'Closed',delayed:false,advance:'settled'}
  ]
};
const nav = [['control','📊','Control Tower'],['trips','📋','Trips'],['fleet','🚚','Fleet Masters'],['driver','👤','Driver App'],['finance','⛽','Finance'],['maintenance','🔧','Maintenance']];
const $ = (s) => document.querySelector(s);
const visibleTrips = () => state.role === 'admin' ? state.trips : state.trips.filter(t => t.branch === state.branch || state.role === 'driver');
const visibleVehicles = () => state.role === 'admin' ? state.vehicles : state.vehicles.filter(v => v.branch === state.branch || state.role === 'driver');
function setView(view){ state.view=view; render(); }
function setRole(role){ state.role=role; render(); }
function setBranch(branch){ state.branch=branch; render(); }
function advanceTrip(id){ state.trips = state.trips.map(t => t.id === id ? {...t, step: Math.min(t.step+1, milestones.length-1), advance: t.step+1>=8?'settled':t.advance} : t); state.note = `${id} milestone saved, bucket updated, Control Tower notified, SMS stub logged.`; render(); }
function markAvailable(reg){ state.vehicles = state.vehicles.map(v => v.registration === reg ? {...v,bucket:'Available',idleHours:0} : v); state.note = `${reg} marked Empty/Available by driver fallback.`; render(); }
function createTrip(){ const id=`TRP-${String(state.trips.length+1).padStart(4,'0')}`; state.trips=[{id,customer:'Demo Customer',lane:lanes[0],vehicle:'DL 01 AB 4582',driver:'Ramesh Kumar',branch:'Delhi',step:0,eta:'Calculating',delayed:false,advance:'not requested'},...state.trips]; state.note=`${id} created. No LR/Bilty generated at creation; lane TAT and rate applied.`; render(); }
function money(n){ return '₹'+n.toLocaleString('en-IN'); }
function badge(text,warn=false){ return `<span class="badge ${warn?'warning':''}">${text}</span>`; }
function card(title, body, action=''){ return `<section class="card"><div class="card-head"><h2>${title}</h2>${action}</div>${body}</section>`; }
function render(){
  const title = nav.find(n=>n[0]===state.view)[2];
  document.body.innerHTML = `<div class="app-shell"><aside class="sidebar"><div class="brand"><span class="big">🚚</span><div><strong>TransportOS</strong><span>Century Cargo demo</span></div></div><nav>${nav.map(n=>`<button class="${state.view===n[0]?'active':''}" onclick="setView('${n[0]}')"><span>${n[1]}</span>${n[2]}</button>`).join('')}</nav><div class="demo-note">Localhost Phase 0: GPS, SMS, BPCL and GST flows are demo-safe stubs.</div></aside><main><header class="topbar"><div><p class="eyebrow">Live demo workspace</p><h1>${title}</h1></div><div class="controls"><select onchange="setRole(this.value)">${roles.map(r=>`<option value="${r[0]}" ${state.role===r[0]?'selected':''}>${r[1]}</option>`).join('')}</select><select onchange="setBranch(this.value)">${branches.map(b=>`<option ${state.branch===b?'selected':''}>${b}</option>`).join('')}</select></div></header><section class="notice">🔔 ${state.note}</section>${viewHtml()}</main></div>`;
}
function viewHtml(){ return ({control:controlHtml,trips:tripsHtml,fleet:fleetHtml,driver:driverHtml,finance:financeHtml,maintenance:maintenanceHtml}[state.view])(); }
function controlHtml(){ const vs=visibleVehicles(), ts=visibleTrips(); const k={fleet:vs.length,idle:vs.filter(v=>v.idleHours>4).length,alerts:vs.filter(v=>v.idleHours>4||v.bucket==='Breakdown').length+ts.filter(t=>t.delayed).length,breakdowns:vs.filter(v=>v.bucket==='Breakdown').length}; return `<div class="stack"><div class="kpi-grid">${[['Fleet count',k.fleet,'🚚'],['Idle > 4h',k.idle,'🚗'],['Active alerts',k.alerts,'🔔'],['Breakdowns',k.breakdowns,'🔧']].map(x=>`<article class="kpi"><div><span>${x[0]}</span><strong>${x[1]}</strong></div><b>${x[2]}</b></article>`).join('')}</div><div class="grid two">${card('Live alert feed',`<ul class="feed">${[...vs.filter(v=>v.bucket==='Breakdown').map(v=>`${v.registration}: Breakdown routed to Maintenance + Ops`),...vs.filter(v=>v.idleHours>4).map(v=>`${v.registration}: Idle ${v.idleHours}h, Branch Manager alerted`),...ts.filter(t=>t.delayed).map(t=>`${t.id}: Trip delayed vs ETA, Ops + Management alerted`),'GPS simulator polling every 30 seconds with WheelsEye-shaped JSON'].map(a=>`<li>⚠️ ${a}</li>`).join('')}</ul>`)}${card('Branch table',`<table><thead><tr><th>Branch</th><th>Fleet</th><th>Available</th></tr></thead><tbody>${branches.map(b=>`<tr><td>${b}</td><td>${vs.filter(v=>v.branch===b).length}</td><td>${vs.filter(v=>v.branch===b&&v.bucket==='Available').length}</td></tr>`).join('')}</tbody></table>`)}</div></div>`; }
function tripsHtml(){ const ts=visibleTrips(); return `<div class="stack">${card('Trip Creation','<p class="muted">Creating a trip only creates a Trip record. LR/Bilty generation remains out of demo scope.</p>',(state.role==='admin'||state.role==='operations')?'<button onclick="createTrip()">Create Trip</button>':'')}<div class="kanban">${milestones.map((m,i)=>`<section class="lane"><h3>${i+1}. ${m}</h3>${ts.filter(t=>t.step===i).map(t=>`<article class="trip-card"><strong>${t.id}</strong><span>${t.customer}</span><small>${t.lane.from} → ${t.lane.to} · ${t.vehicle}</small><small>ETA: ${t.eta}</small><button ${t.step===8?'disabled':''} onclick="advanceTrip('${t.id}')">${t.step===8?'Closed':'Next milestone'}</button></article>`).join('')}</section>`).join('')}</div></div>`; }
function fleetHtml(){ const vs=visibleVehicles(); return `<div class="grid three">${card('Vehicles',vs.map(v=>`<div class="row"><div><strong>${v.registration}</strong><span>${v.type} · ${v.branch}</span></div>${badge(v.bucket,v.idleHours>4)}${v.bucket!=='Available'?`<button onclick="markAvailable('${v.registration}')">Mark Empty/Available</button>`:''}</div>`).join(''))}${card('Drivers',state.drivers.map(d=>`<div class="row"><div><strong>${d.name}</strong><span>${d.branch} · Rating ${d.rating}</span></div>${new Date(d.expiry)<new Date('2026-08-09')?badge('License < 30d',true):''}</div>`).join(''))}${card('Lanes',lanes.map(l=>`<div class="row"><div><strong>${l.from} → ${l.to}</strong><span>${l.km} km · TAT ${l.tat}h · ${money(l.rate)}</span></div></div>`).join(''))}</div>`; }
function driverHtml(){ const t=visibleTrips()[0] || state.trips[0]; return `<div class="phone-layout"><section class="phone"><div class="phone-bar"></div><h2>Driver Trip</h2><p>${t.id} · ${t.vehicle}</p><div class="progress">${milestones.map((m,i)=>`<div class="${i<=t.step?'done':''}">✅ ${m}</div>`).join('')}</div><button onclick="advanceTrip('${t.id}')">Tap next milestone</button><button class="secondary" onclick="markAvailable('${t.vehicle}')">Mark Empty/Available</button></section>${card('Issue Button',['Breakdown|Critical|Maintenance + Ops|Ticket created','Accident|Critical|Ops + Safety + Mgmt|Form required','Fuel issue|Medium|Ops + Accounts|Accounts resolving','Route refusal|Escalated|Ops + Mgmt|Rating deducted'].map(s=>{const p=s.split('|');return `<div class="issue"><b>⚠️</b><div><strong>${p[0]}</strong><span>${p[1]} · ${p[2]} · ${p[3]}</span></div></div>`}).join(''))}${card('POD Upload','<div class="upload"><b>📍</b><p>File picker placeholder: uploading photo marks POD uploaded and stops ageing clock.</p><input type="file"></div>')}</div>`; }
function financeHtml(){ const ts=visibleTrips(); return `<div class="grid two">${card('Advance Payment Requests',ts.map(t=>`<div class="row"><div><strong>${t.id}</strong><span>${t.driver} · ${t.advance}</span></div><button>Approve</button><button class="secondary">Reject</button></div>`).join(''))}${card('Fuel Transactions Stub','<div class="form-grid"><input placeholder="Vehicle"><input placeholder="Amount"><input type="date"><input placeholder="Note"><button>Add Fuel Transaction</button></div><p class="muted">No BPCL OTP or payment API call is made in demo scope.</p>')}</div>`; }
function maintenanceHtml(){ return card('Breakdown Ticket Board',`<div class="ticket-flow">${['Reported','Assigned','Travelling','Work Started','Work Done','Roadworthy','Closed'].map((s,i)=>`<div class="${i<2?'active':''}">${s}</div>`).join('')}</div><p class="muted">Breakdown issues auto-create tickets. Roadworthy resumes trip and returns vehicle bucket to prior state.</p>`); }
Object.assign(window,{setView,setRole,setBranch,advanceTrip,markAvailable,createTrip});
render();
