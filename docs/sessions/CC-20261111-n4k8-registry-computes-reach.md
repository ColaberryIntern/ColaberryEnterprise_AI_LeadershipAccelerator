# CC-20261111-n4k8 — the catalog stops answering a question it cannot know

- [x] Compute manager reachability everywhere instead of reading a hardcoded registry field
  - Date: 2026-11-13
  - Session: CC-20261111-n4k8
  - What changed: `can_reach_surface` and `blocker` are gone from `agentDomainRegistry`, along with
    `blockedDomains()`. Every read surface resolves reachability per request through the new
    `managerReachResolver`, the provisioner's stored columns became a derived cache it refreshes
    from the same computation, and the ADR stopped stating a figure.
  - Verification: `tsc --noEmit` 0 errors in `backend/`; `checkTestTypecheck` baseline matched in
    both directions (399 / 140); the two new guards mutation-tested — defaulting `unknownReach` to
    reachable failed 2 tests, re-adding `can_reach_surface` to one registry entry failed the
    catalog guard — each mutation confirmed present in the file before the run and confirmed
    reverted after; full backend CI suite green.
  - Notes: authorized by Ali on 2026-11-13 ("Refactor the registry to compute from
    assessManagerReach"). Scope quoted as ~4 files, delivered as 13.

## The thing that was actually wrong

`agentDomainRegistry.ts` carried two hand-typed fields per domain under this comment:

```ts
/** MEASURED: does an `admin_users` row exist on the manager's email? */
readonly can_reach_surface: boolean;
```

Both halves were wrong, and the way they were wrong mattered more than the values.

**The question was wrong.** An `admin_users` row is the LEGACY wide login. The scoped path is a
staff `community_members` row carrying a `mgmt_role`, which needs no `admin_users` row at all.
Three managers were recorded as locked out while holding a working login.

**"MEASURED" meant measured once**, on 2026-10-08, then frozen into source. The registry's own
docblock described catching `HUMAN_OWNERSHIP_MAP.md` in exactly that state — stale, confident,
wrong on four domains — and then froze its own answer the same way, one level down.

## Why four surfaces agreed with each other and with nothing else

The literals flowed outward:

| Surface | How it got the wrong answer |
|---|---|
| the database | `reconcileAnchorMetadata` wrote the constant into `agent_domain_projects`, so the job whose purpose is "make the row match reality" overwrote reality |
| the portal | `GET /api/admin/agent-domains` served `AGENT_DOMAINS` directly — it never read the database at all |
| the phase report | `rowFor()` copied both fields into a handoff document |
| the story prose | a builder's interview story asserted "cannot reach the agent surface today" |
| the audit | PR #3972 read the DB column and reported it as fact |

Everything agreed because everything read one constant. **Agreement between copies is not
accuracy**, and the ADR parity test is the sharpest example: it was rewritten to derive the ADR's
figure from the registry rather than assert a literal, so the two could not drift — and it passed
while both were wrong.

## What replaced it

`services/access/agentManagerReach.ts` (moved out of `scripts/lib/`, since it is production access
logic now) holds the pure judgement. `services/agentDomain/managerReachResolver.ts` holds the one
live query. Every consumer takes the verdict:

- **routes** — `publicDomainView(key, reach)`; the list endpoint counts its totals off the computed
  views rather than filtering the catalog separately, so the totals cannot disagree with the rows
  printed beside them.
- **provisioned reader** — a `withComputedReach` overlay on every loader. The stored columns stay in
  the SELECT only so a mismatch is visible to anyone comparing the two.
- **phase report** — reach is a required parameter. `renderPhaseReportMarkdown` lost its
  `= buildPhaseReport()` default, because a function that silently builds its own input is how a
  caller renders a report it never looked at.
- **story templates** — assert nothing. The story now tells the builder to check access with the
  manager in the room and names the endpoint. A story generated weeks before it is worked has no
  business stating a live access state.
- **provisioner** — INSERT writes NULL (honestly "not yet computed"); `reconcileAnchorMetadata`
  refreshes from `resolveManagerReach`.

## The decision taken without asking

The column was kept as a **derived cache** rather than deleted. Deleting it meant removing
`reconcileAnchorMetadata` — a function a production script calls, with a 16-reference integration
test — whose only job was syncing those two columns. Repointing it kept that path working and
turned it into something that does what its name says. No read surface depends on when it last ran.

## Two things found and deliberately not fixed

- The registry's `platform` entry carries `kesetebirhan@gmail.com`; the org row says
  `kes@colaberry.com`. No production code reads the field, so it is inert. Commented as
  non-authoritative rather than changed, since changing identity data was not needed.
- `buildPhaseReport()` and `blockedDomains()` had **no production callers** — only their own tests.
  `blockedDomains()` is deleted. The phase report is kept and fixed, but it is worth knowing that a
  document we treat as a deliverable is reachable from nothing.

## What the tests assert now

The stale assertions were not repaired, they were **replaced by properties that cannot go stale**:

- the catalog carries no reachability field, under any of four names, and exports no helper that
  filters by one (both mutation-proven)
- nothing is ever defaulted to reachable; an unknown domain is a refusal with a named reason
- the endpoint's `reachable` + `blocked` always equal the row count
- the report marks exactly the domains its input says are blocked
- the ADR states no figure, and names where the answer is computed

A blocker is a CODE now (`org_member_email_mismatch`), not a paragraph. The old format was prose
naming a cause and a remedy, and a paragraph nobody can diff is a paragraph nobody re-checks —
three of them described a missing login that was not missing.
