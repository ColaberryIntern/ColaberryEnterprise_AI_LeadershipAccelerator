# Project creation paths, and how each one is covered

## The rule this file exists to enforce

**A hand-written list of creation sites is wrong within a week.** That is not a guess. The
discovery record for this programme named three "natural chokepoints" and stated that routing
registration through them "covers every row". That sentence was inherited into a plan and built
on before anybody re-derived it, and it was false: measured at `509335f5` the three covered 6 of
7 creation sites read as categories, and 5 of 7 as actually enumerated.

The site it missed, `backend/src/services/factory/govDeliveryProject.ts`, **landed three days
after the inventory was taken and was live in production.** So a delivery project was created
with no lifecycle, in production, every time a government pursuit was approved after 2026-10-04.

So LC-01's coverage is not a list in a document. It is derived from the source on every test run
by `backend/src/services/lifecycle/__tests__/lifecycleRegistrationCoverage.test.ts`, which fails
when a creation site appears that is not accounted for. **If you are adding a creation path,
that test is what will tell you.** This file explains the design; it is not the inventory.

## Why the hook is on the model

Because the chokepoint list was wrong, and would be wrong again.

`projectLifecycleRegistration.deliveryProjectLifecycleHook` is an `afterCreate` hook on the
`DeliveryProject` model. Every creation path goes through the model, including ones that do not
exist yet, so coverage does not depend on anybody remembering to call a service.

Three properties of that hook are deliberate and each one was measured:

- **It forwards `options.transaction`.** Both live delivery-project creations run inside explicit
  transactions and `project_lifecycle_states.delivery_project_id` is a real foreign key to the
  parent row, so an INSERT outside the caller's transaction could not see the row it references.
  The feasibility of writing from inside the caller's transaction is the thing that decides
  whether this design works at all, and it is tested against a real Postgres rather than reasoned
  about.
- **It does NOT catch its own errors**, which inverts the precedent it was copied from. That
  precedent (`workLedger/ticketCreationLedgerHook.ts`) is safe to swallow because its tickets are
  created with no transaction and a lost ledger event is cosmetic. Neither holds here: a
  swallowed failure would mean a project exists with no lifecycle and nothing to say so.
- **`ON CONFLICT (delivery_project_id) WHERE delivery_project_id IS NOT NULL DO NOTHING`**, so a
  replay is a no-op rather than a duplicate. Idempotency is non-negotiable in this repo.

## Student projects: the uncovered half

`projects` rows have no hook, because there is nothing to key a tenant on. Measured on
production, 2026-10-12:

| Fact | Value |
|---|---|
| Tables carrying `tenant_id` | 60 |
| Is `projects` one of them | **No** |
| Is any table on its join path (`enrollments`, `programs`, `cohorts`, `users`) | **No** |
| Tenants defined | 4 |
| Distinct tenants in use on `delivery_projects` | 1 |
| `projects` rows | 62, all with both an `enrollment_id` and a `program_id`, zero nulls |

So the backfill is a single constant, not a join, and the open decision is which constant. That
is **P6-T1b**.

## What a front door can and cannot add

It cannot add coverage: the hook already covers every path, and a front door that did its own
registration would be one more thing to keep in sync.

What it adds is **verification**. `scripts/registerGovernedProject.js` creates through the model
and then reads back the lifecycle row, failing loudly if it is absent or carries the wrong
tenant. A hook that was removed, or never wired, would otherwise let a creation succeed and
register nothing — and that failure is completely silent without a read-back.

That is also what makes the front door hard to rewrite into a bypass. The integration test
performs an actual bypass (a creator that writes raw SQL, which skips Sequelize hooks) and shows
the script refuses it, with a positive control proving the refusal is not unconditional.
