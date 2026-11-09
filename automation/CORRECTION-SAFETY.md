# Correction implementation state

## Verified
- Fresh GitHub-hosted login and bounded previous-day read-only scan have passed.
- One separately authorized cloud-browser date correction was persisted and read back. No voucher details are stored here.
- Pure correction-engine offline tests: run `node automation/correction-engine.test.mjs`.
- The engine has no network or credentials and is not connected to a workflow.

## Not production-ready
No live write adapter or production correction schedule is enabled. The existing read-only workflows remain read-only.

Before enabling:
1. Implement and test the adapter contract in correction-engine.mjs with exact observed form controls. The date must be the only intended business-field change. Inspect hidden business controls explicitly; only known dynamic security tokens may be excluded.
2. Enforce transport allowlist with an exact record-bound single-use Save permit. Capture the actual Save request shape in an authorized test before trusting it. Reject other write requests.
3. Supply durable, private, atomic intent/outcome storage. Existing/unresolved intent must trigger read-only reconciliation, never blind resubmission. Do not store record IDs or voucher details in public GitHub logs, summaries or artifacts.
4. Validate adapter reload/list/reopened-form readback and business-field equivalence. Save errors mean unknown until readback, not failure safe to retry.
5. Handle concurrent edits: fresh authoritative row and form checks minimize races but the ERP may lack version-based optimistic locking. Do not claim atomic concurrency guarantees.
6. Validate empty-day behavior and catch-up policy. Current date-filter view filters voucher date, not creator date. Bounded newest-entry scanning relies on observed ordering and is not globally exhaustive.
7. Obtain authorization for any further live write test and for the final daily schedule. Coordinate the unchanged local task to avoid overlap.
8. Set fail-closed alert delivery that is private and verified reachable. Aggregate public logs only, no raw exception/error/browser traces.

## Daily scope
Exact RAJP and MAHBUB; previous calendar day in Asia/Kolkata from the User Name date. Never use Updated By. At most ten recent pages, stop after two full older pages. No all-history scan. Incomplete ordering, page cap, invalid schema, conflicting rows or identity changes stop corrections.

Offline mocks prove transaction logic only. They do not prove live adapter wiring, unattended persistence, total daily coverage, or scheduler reliability.
