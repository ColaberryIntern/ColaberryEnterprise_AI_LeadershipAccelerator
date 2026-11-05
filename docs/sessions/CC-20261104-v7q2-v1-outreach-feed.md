# CC-20261104-v7q2 — the live feed Cora has been waiting on

Ticket: R6 — [Tag the campus call queue into GHL as ent-* tags](https://app.basecamp.com/3945211/buckets/7463955/todos/10460236766)

- [x] Service-token read of the Explorer call queue, for Cora
  - Date: 2026-11-05
  - Session: CC-20261104-v7q2
  - What changed: new `backend/src/controllers/v1OutreachController.ts`; one route added to
    `v1Routes.ts`.
  - Verification: 18 new tests; 210 green across four suites including the admin router's own
    surface pin. Both new files typecheck clean on the backend's own tsc 5.9.3 under `--strict`.
    Mutation-tested 4 of 4 killed, every restore byte-identical.
  - Notes: below.

## Why a second route and not the admin one

`/api/admin/explorer-growth/outreach` is guarded by `requireAdmin`, which verifies a session JWT
with a four-hour expiry. A nightly job in another system cannot hold one. Measured against
production on 2026-11-03: a static bearer there returns `Invalid or expired token`, while
`/api/v1/enrollments/lookup` returns `Invalid service token` for the same bearer. Two different
middlewares, and no credential makes the admin path work for a machine.

## The payload is an allowlist, and that is the security decision

The admin payload carries `email` and `name`. This one does not. They are the only personal data
in the row, and the consumer does not need them: Cora joins on `ghl_url`, which carries the
GoHighLevel contact id and the sub-account it lives in, both of which Cora already holds. Kes
confirmed this by building the matching on `ghl_url` before the endpoint existed.

**It is an allowlist rather than an `Omit<>` or a delete, and that distinction is the point.** A
denylist protects the fields somebody remembered; the next person to add a column to the ranking
would export it to an external system by default and nothing would say so. With an allowlist a
new field is invisible until someone adds it deliberately. A test pins the emitted key set as a
whole, and another feeds the source a `phone` and a `home_address` and asserts neither escapes.

## One schema, not two

`outreachQuerySchema` is imported from the admin surface rather than restated, so the two cannot
drift on the 200-row cap or on rejecting an unknown parameter. A mutation swapping it for a
permissive parse is killed.

## What a control is doing in each place

- The PII tests have a control asserting the SOURCE row really does carry an email and a name.
  Without it, "email is absent" would also pass against a fixture that never had one.
- The route-registration test has a control asserting the file really is being read.
- An empty queue is a 200 with `count: 0`, not a 404, because "nobody to call today" is an
  answer and a 404 reads as "the feed is broken".

## Still outstanding

The credential. A token has to exist in the accelerator container and in the Cora environment,
and that is placed on the hosts, never emailed. Until then this route answers 401 to Cora exactly
as it should.
