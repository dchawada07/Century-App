# TransportOS — Functional & Build Specification

**Century Cargo Carrier Pvt Ltd | Demo / Localhost Scope**

This is the frozen spec for Phase 0. Everything built afterward is built *against* this document — no requirement guessing during coding. If something here is wrong or incomplete, fix it here first, before any code is written.

## Demo scope rules

Applies to every module below:

- WheelsEye GPS → simulator, same JSON shape as the real API (`{deviceId, vehicleId, lat, lng, speed, ignition, timestamp}`), feeding fake but realistic movement.
- BPCL fuel card → stub. A "Fuel Transaction" record gets created manually (amount, vehicle, date) with no real OTP/payment call.
- GST-compliant LR/Bilty → stub. A simple sequential trip reference number only (for example, `TRP-0001`), no GST fields, no printable compliance PDF.
- SMS gateway → stub. Notifications shown in-app / logged to console instead of real SMS.
- Firebase push → real because it is free and simple.
- Hosting → localhost only. No production deployment in this phase.

## Roles (RBAC)

| Role | Scope | Can do |
|---|---|---|
| admin | All branches | Everything below |
| branch_manager | Own branch | Trips, payments, tickets, branch dashboard — own branch only |
| operations | Own branch | Bookings, trip creation, dispatch, driver assignment |
| tracking | Own branch | View live map, delays — read-only on trips |
| driver | Own trips | Tap milestones, upload POD, raise issues |

Customer portal is excluded from demo scope and can be added later if needed.

## Module 1 — Auth & Roles

**Screens:** Login, Forgot Password

**Buttons:** Login · Forgot Password · Logout

**Workflow:**

- Staff logs in with email + password → server checks role → routes to role-specific dashboard.
- Driver logs in with phone number. Demo uses a simple password instead of real OTP because OTP SMS is stubbed.
- If login fails 5 times → account locked for 15 minutes using a simple demo-only lockout.
- If password is forgotten → demo flow is admin manually resets from user list. Real email reset link flow is stubbed.

## Module 2 — Fleet Masters

**Screens:** Branches · Vehicles · Drivers · Customers · Lanes

**Buttons per entity:** Add New · Edit · Deactivate (never hard-delete — history must survive)

### Vehicle creation

- Fields: registration number, type (`9ft`, `10ft`, `12ft`, `container`), branch, status.
- Status automatically defaults to `available` on creation.
- If vehicle already has an active trip → cannot be deactivated; show warning.

### Lane creation

- Fields: from location, to location, distance (km), planned TAT (hours), standard rate.
- Planned TAT auto-applies to every trip created on this lane.

### Driver creation

- Fields: name, phone, license number, license expiry, home branch.
- If license expiry is less than 30 days away → flag shown on driver list. Visual only for demo; no auto-alert required.

## Module 3 — Trip Lifecycle

**Screens:** Trip Creation, Trip Board (Kanban by status), Trip Detail

**Trip creation buttons:** Create Trip (operations only)

**Fields:** customer, route (lane), vehicle, driver, planned KM.

**Workflow:**

- On save → only a Trip record is created. No LR/Bilty is generated at this stage.
- System auto-looks-up the lane master for TAT and rate.

### 9-step status sequence

Driver-side buttons are sequential; each step unlocks the next.

1. Trip Started
2. Arrived at Loading Point
3. Loading Started
4. Loading Completed — Waiting for Document
5. Vehicle Departed
6. Driver raises Advance Payment Request
   - If Branch Manager approves → step 7
   - If Branch Manager rejects → driver notified with reason, can re-raise
7. Branch Manager Calculates Final Payment
8. Driver Responds: Accept / Reject / Add Notes
   - If Accept → payment marked settled, proceed to step 9
   - If Reject → sent back to Branch Manager with driver's note, loop until resolved
9. Trip Closed → vehicle auto-resets to `Available` in Branch Buckets

### Status change behavior

Each status change:

- Timestamps the record.
- Updates the Branch Bucket.
- Pushes update to Control Tower live view.
- Fires a notification (logged, stubbed SMS).

### Trip cancellation

Operations/admin only, any point before closure.

If cancelled:

- Vehicle auto-resets to Available.
- Nearest Branch Manager is notified to reassign.
- Cancellation reason is logged.

## Module 4 — Branch Buckets

**Purpose:** Shows where every vehicle physically sits, in 5 states.

**States:** Available · Loading · In-Transit · At Destination · Breakdown

**Screen:** Branch bucket board grouped by state and filterable by branch.

**Workflow:**

- Bucket auto-updates from Trip Lifecycle events — no manual button needed except the driver-side fallback below.
- `Mark Empty/Available` button (driver-side) — driver manually marks self free after unloading, in case system did not auto-detect.
- If a vehicle sits in one bucket state for more than 4 hours → idle timer flags it with a visual badge and feeds Control Tower alert.

## Module 5 — Driver App

Mobile web view for demo, not a real Android build.

**Screens:** Trip List, Trip Detail (milestone buttons), Issue Button, POD Upload

**Trip milestone buttons:** same 9-step sequence as Module 3, driver-facing side.

### Issue button

Nine issue types route differently per type.

| Issue | Severity | Routed to | Resolution flow |
|---|---|---|---|
| Breakdown | Critical | Maintenance + Ops | Ticket → Tech assigned → Travel → Work started → Work done. Driver notified at each step. |
| Accident | Critical | Ops + Safety + Mgmt | Form: photo, location, statement, vehicle condition, cargo condition, insurance docs |
| Urea needed | Medium | Ops team | Ops alerted, no formal ticket |
| Fuel issue | Medium | Ops + Accounts | Accounts resolves and closes |
| Payment | Medium | Accounts | Release or escalate to HO |
| Unloading charges | — | Accounts + Branch | Branch + accounts action required |
| Route refusal | — | Ops + Mgmt escalated | Logged, driver rating auto-deducted |

All issues start an SLA timer on creation. If unresolved past threshold → auto-escalates to management, logs to Control Tower alert feed and audit trail.

### POD Upload button

Available after the unloading milestone.

- Opens camera / file picker. Demo can use file picker; native camera is not required.
- If photo uploaded → status = uploaded, Ops team notified, ageing clock stops.
- If not uploaded within 48 hours → POD ageing alert fires to accounts.

## Module 6 — Maintenance / Breakdown

**Screen:** Ticket board (`Reported` → `Assigned` → `Travelling` → `Work Started` → `Work Done` → `Roadworthy` → `Closed`)

**Buttons:** Assign Technician · Mark Travelling · Mark Work Started · Mark Work Done · Close Ticket

**Workflow:**

- Ticket auto-created from a `Breakdown` issue button press.
- If marked Roadworthy → trip auto-resumes, driver notified, vehicle bucket returns to prior state.
- If not resolved within SLA → escalates to Ops + Management.

## Module 7 — Finance

**Screens:** Advance Payment Requests · Fuel Transactions (stub) · Expense Log

**Buttons:** Approve · Reject · Add Note (Branch Manager side), as described in Module 3, steps 6–8.

### Fuel Transaction (stubbed BPCL)

Manual entry: vehicle, amount, date, note. No real OTP or payment API call.

### Expense categorization

Expense categories: fuel / toll / advance / loading / other.

Each trip's expenses roll up to a CSV export button in the Reports module.

## Module 8 — Driver Rating Engine

**Trigger:** recalculates automatically on every trip close (Module 3, step 9).

| Dimension | Inputs |
|---|---|
| Operational | Timing adherence, POD upload speed, app usage consistency |
| Safety | Speed events, accident/incident history |
| Maintenance | Breakdown frequency, pre-trip vehicle checks |
| Behaviour | Route refusals, communications, rejected assignments |

**Output:** Composite score → feeds Incentive Eligibility flag and is visible on Control Tower.

For demo, use a simple weighted average formula, such as 30/25/25/20% split. This can be tuned later; do not over-engineer the algorithm for the demo phase.

## Module 9 — Control Tower & Analytics

**Screen:** Live dashboard — KPI summary, Live alert feed, Branch table, Reports/export

### Alert rules

Five alert rules are auto-generated from event stream.

| Alert | Trigger | Routed to |
|---|---|---|
| Breakdown | Immediate | Maintenance + Ops |
| Idle > 4h | Vehicle idle beyond threshold | Branch Manager |
| GPS off | No ping > 1h | Ops flagged |
| POD ageing | Unpaid/unuploaded > 48h | Accounts alert |
| Trip delayed | Actual vs ETA calculation | Ops + Management |

**KPI summary cards:** Fleet count, idle count, active alerts, breakdown count — role-filtered so branch managers see only their branch.

**Reports/export button:** CSV export, management-only, date range + branch filter.

## Module 10 — Edge Functions

These run without any button press — pure backend logic.

1. **Geofence auto-creation** — on a vehicle's first-ever GPS ping near a known lane stop, auto-draws an approximately 200m circle around it. No manual geofence setup needed.
2. **ETA / Delay calculation** — `ETA = current time + (distance remaining / average speed)`. `Delay = ETA - planned arrival`. Recalculates on every GPS ping.
3. **WheelsEye polling adapter** — for demo, polls the simulator every 30 seconds instead of the real API. Same code path swaps in the real API later with only a config change.
4. **Idle timer** — flags any vehicle stationary for more than 4 hours.
5. **Audit log writer** — every write to the database also writes a row to an immutable `audit_log` table (`who`, `what`, `when`, `before`, `after`).

## Explicitly out of scope for the demo

- Real BPCL payment/OTP flow
- Real GST-compliant LR/Bilty PDF generation and numbering series
- Real SMS delivery (MSG91/Textlocal)
- Customer self-serve portal
- Production hosting, SSL, domain
- Security audit / penetration testing
- Native Android app build (driver flow demoed as mobile-responsive web instead)

These become Phase 2 (post-demo) work, done with the agency once the demo is approved and workflows are confirmed.

## Why this document matters for cost

Every ambiguity below zero is a decision Claude Code has to guess at while building — and a wrong guess means regenerating code later, which is where token cost actually balloons. Review and correct this document before the build phase so implementation becomes mostly execution, not discovery.
