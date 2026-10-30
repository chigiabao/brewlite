# S4 / G-04 — Rewards quota/replay regression

Regression coverage uses the real Rewards, Orders and Payments services with
PostgreSQL transactions, conditional updates and unique constraints. Only the
mock gateway response is controlled. These are service integration tests; they
do not certify JWT authentication or the browser checkout flow.

## Run

From `backend/`, with PostgreSQL accessible:

```powershell
$env:REWARDS_TEST_DATABASE_URL = 'postgresql://brew:brew@127.0.0.1:55432/brewlite'
npm.cmd run test:rewards:regression
```

```bash
REWARDS_TEST_DATABASE_URL=postgresql://brew:brew@127.0.0.1:5432/brewlite_rewards_test npm run test:rewards:regression
```

Use the credentials/port for your test server. The dedicated command requires
`REWARDS_TEST_DATABASE_URL` and fails if it is missing. It does not silently skip
the database tests. Each run creates a `rewards_g04_<uuid>` schema, applies the
repository migrations there, and drops that schema in teardown. The connection
must permit creating schemas. Tests never reset or clear the `public` schema;
each test owns separate users, products and coupons. Setup/teardown failures fail
the run. An interrupted process may leave its generated schema for manual cleanup.

The existing `npm run test:e2e` only includes this suite when that environment
variable is set; the dedicated GitHub Actions workflow always sets it and uploads
JUnit results.

## Protected behavior

| Scenario | Asserted result |
| --- | --- |
| Repeated coupon preview | No quota, balance or stock mutation |
| Ten orders compete for remaining coupon slots | Only available slots succeed; `usedCount` never exceeds quota |
| `maxUses = 0` / `null` | No uses allowed / unlimited uses counted normally |
| Two orders redeem 80 points from balance 100 | One accepted; balance 20; one REDEEM |
| Insufficient points or stock failure | Coupon, points, stock and order writes roll back together |
| Transaction aborted after REDEEM | No reservation or ledger survives |
| Successful payment followed by replays | One payment/charge, one EARN, one REDEEM, one quota consumption |
| Concurrent same-key payment attempts | At most one charge and one EARN; in-progress retries may return 409 |
| Decline/timeout and replay | No EARN; reservation retained for retry on the same order |
| New payment key after failure | New payment attempt, same reservation, one EARN after success |
| Same key with changed user/method/order | Rejected with no additional rewards mutation |
| Ten concurrent finalize/REDEEM calls | One ledger row per `(orderId, kind)`, one balance increment |
| Settlement transaction aborted after EARN | Status, ledger and balance roll back; finalize can be retried |
| Points exceed amount after coupon | Only the capped points are deducted; zero-total orders earn zero |
| Finalize on wrong status/user/amount | Rejected before EARN writes |
| Missing Rewards provider in Payments | Nest wiring fails; loyalty cannot be silently omitted |

Finalize verifies the persisted Order belongs to the user, is `PAID`, and matches
`totalPaid`, in the caller's transaction. This preserves the G-02/G-03 public
method signature. G-03 records REDEEM during order creation; G-04 keeps that timing.
Reservation release on cancellation/refunds and create-order idempotency remain
separate business/owner decisions.

Review ownership: Rewards G, Payments integration F, workflow/platform A.

## Local verification — 2026-10-30

- Dedicated regression: 88 passed, including 17 real PostgreSQL integration cases;
  no skipped tests. JUnit output: `backend/reports/rewards-regression.xml`
  (generated locally and ignored by Git).
- Full backend unit suite: 79 passed; the 5 existing TODO cases in other feature
  suites remain TODO, and are not counted as passing tests.
- Backend build, full TypeScript check, lint and Foundation guard passed.
  Lint retains existing Auth/Orders warnings; G-04 introduced none.
- PostgreSQL catalog check after teardown found no remaining `rewards_g04_` schemas.
- Missing `REWARDS_TEST_DATABASE_URL` was verified to fail the dedicated command.

The workflow has been added locally; its GitHub-hosted run will occur after push.
