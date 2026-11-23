# Membership seed: the dry run, and the decision it needs

**For Ali.** This is T10 of the Growth Journey by brand build. **Nothing has been written.** Every
figure below came from the real tool's dry run against production on 2026-11-22, not from my
arithmetic.

The seed is yours to run, by the script's own instruction: *"Nothing in the loop runs this against
production; that run is Ali's."*

---

## Why this is needed at all

The brand-scoped Explorer reads ride `scopedContext`, which grants a brand only against a real
membership and refuses rather than widening. **`tenant_memberships` holds zero rows**, so
`ctx.brandId` is null for every admin and a request naming a brand answers **403** today.

The merged page handles that honestly: it opens on the all-brands view, which shows the full
population and is both useful and true, and selecting a brand renders a named configuration state
rather than another brand's numbers. So **the deploy does not depend on this seed.** Per-brand
figures do.

---

## The one thing that makes this irreversible-feeling, and the thing that makes it reversible

While `tenant_memberships` is empty, every admin reads every tenant: `adminScopeBridge` grants
cross-tenant read during migration. **The first row closes that ramp for everybody**, not just for
the person it describes. That is why the tool refuses to write unless you name the lock-out number
exactly.

It is reversible, and this is worth knowing before you decide. The ramp condition is literally
`(await TenantMembership.count()) === 0`, so **deleting the rows re-opens it**. The identities and
links the write also creates are inert on their own; they grant nothing without a membership row.

---

## Measured state of production, 2026-11-22

| Fact | Value |
|---|---|
| `tenant_memberships` | **0** rows, 0 active |
| `platform_identities` | 14, **none linked to an admin** |
| `platform_identity_links` | **0 rows of any type** |
| Admin accounts | **50**: 15 human, 35 AI-operated |
| Human admins by role | 7 `admin`, 6 `sales`, 2 `super_admin` |
| Conflicting links (a link pointing at a different identity) | **0** |
| Super-admins already linked elsewhere | **0** — so the tool will not refuse |
| Tenants / brands | 4 tenants, 8 active brands |

Zero existing links is the good news: the tool's worst failure mode is an admin already linked to
a different identity, because their memberships get skipped and the first row would close the ramp
with them behind it. **There are none.**

---

## What the 35 "lock-outs" actually are

This is the number that looks alarming and is not.

All 35 are `ai_staff` rows created by `agentIdentitySeed` so that admin screens can show an agent
as an actor. They **cannot log in**. Each carries a `password_hash` of
`crypto.randomBytes(32).toString('hex')` — a random hex string, not a hash of any password, so no
credential can ever match it. The seed's own comment states the intent: *"The agent never logs in
interactively (no autonomous-account-takeover surface to protect)."*

I checked this specifically because the raw query shows all 35 with a non-empty `password_hash`,
which on its own reads as "these accounts can authenticate". They cannot.

**Human lock-outs under either option below: zero.**

---

## Two options, with the tool's own output

### Option A — Colaberry only

Every human gets their role on the `colaberry` tenant, all brands.

```
membership seed plan (dry run — nothing written)
  identities: 15
  admin links: 15
  memberships: 15
  tenant_memberships is EMPTY now: this write closes the migration ramp for EVERY admin
  LOCK-OUT: 35 admin(s) will hold no membership after this write and are denied every tenant
            (0 human, 35 AI-operated)
[dry-run] nothing written. To write: --confirm-production --acknowledge-lockout 35
```

**What it costs:** the 7 admins and 6 sales staff lose access to `cpn`, `ai-flotation` and
`refactored` surfaces, which they can see today through the ramp. The 2 super-admins keep
cross-tenant access by right, so they are unaffected.

### Option B — every human keeps every tenant (recommended)

The same 15 people, their role on all four tenants. Super-admins still get one row each, because
`platform_super_admin` is cross-tenant by right and more rows would be noise.

```
membership seed plan (dry run — nothing written)
  identities: 15
  admin links: 15
  memberships: 54
  tenant_memberships is EMPTY now: this write closes the migration ramp for EVERY admin
  LOCK-OUT: 35 admin(s) will hold no membership after this write and are denied every tenant
            (0 human, 35 AI-operated)
[dry-run] nothing written. To write: --confirm-production --acknowledge-lockout 35
```

**What it costs:** nothing. Nobody loses a surface they have today, and brand scoping starts
working. 54 rows is 2 super-admin rows plus 7 admins and 6 sales across 4 tenants each.

**Ali chose B on 2026-11-22.** Recorded here rather than left in a chat message, because the
roster is the one input to this write and a decision that lives only in a transcript is a decision
nobody can check later.

Option A traded a real loss of access for a tidier table, and closing the ramp is quite enough
change for one deploy without also narrowing thirteen people's day.

The roles proposed: `super_admin` → `platform_super_admin`, `admin` → `tenant_admin`, `sales` →
`tenant_viewer` (read-only across the tenant). If sales should be able to change things rather
than read them, say so and the roster changes; that is a judgment about their job, not about this
build.

---

## The exact run

The roster is generated **on the production box** from a query, so the 15 email addresses never
leave it. The script that builds it is at `/tmp/dryrun_b.sh` on the box right now, and the roster
it wrote is at `/tmp/roster_b.json`.

To write option B:

```
docker exec accelerator-backend node dist/scripts/seedTenantMemberships.js \
  --roster /tmp/roster_b.json --confirm-production --acknowledge-lockout 35
```

`--acknowledge-lockout 35` must match the number the dry run reports at the time you run it. A
stale number from an older roster is refused, deliberately.

**The write is idempotent.** It goes through three keyed functions and takes no transaction, so a
run that fails halfway is completed by running it again. Platform super-admins are granted first,
so a run that dies after the first row never leaves you locked out of the tool's own consequences.

---

## What changes on the page afterwards

| | Before the seed | After |
|---|---|---|
| `/admin/growth-journey` with no brand | 200, the whole population | 200, narrowed to the caller's own brand |
| `…?brand=<Colaberry Training>` | **403**, rendered as a named configuration state | 200, Explorer's data |
| `…?brand=<another brand>` | 403, same state | 200 with zero rows and the brand named |
| `/admin/explorer-growth` | forwards to the merged page, **no brand**, full population | forwards with Colaberry Training selected |

The redirect reads `memberships_populated` from the status registry, so it switches rows in that
table on its own the moment you run the seed. There is nothing to deploy twice.

---

## What I did not do

- I did not write anything. No `--confirm-production` was ever passed.
- I did not read the 15 email addresses into this session. The roster was built by a query on the
  box and the tool counts emails without printing them.
- I did not decide the roles. The mapping above is a proposal; the 54 rows follow from it.
