# CC-20261115-q7w3 — AI Ops: reading it and acting on it become different grants

The thing Quincy Ninying actually asked for. Phases 1, 2a and 2b made a dataset read measurable,
requestable and recordable; none of them made the ai-ops surfaces reachable without admin. This
does.

## What was in the way

Quincy's L1 run ended on a request for read access nobody could grant. Two facts, both verified
rather than inferred:

1. **All 33 routes in `aiOpsRoutes.ts` carried `requireAdmin`, and `/api/admin/ai-ops` was
   UNMAPPED in `mgmtSectionGate`'s `PATH_SECTION`.** The gate is deny-by-default for scoped
   roles, so they were refused before any route was reached.
2. **`requireAdmin` cannot tell a scoped reader from a full administrator.**
   `mgmtBridgeService.ts:104` reads `const jwtRole = mgmt === 'owner' ? 'super_admin' : 'admin'`,
   so EVERY management role — mentor, support, community organizer — is minted with
   `role: 'admin'` and passes `requireAdmin`. It establishes "an admin-portal identity", not "a
   full administrator".

Fact 2 is the one that made this dangerous. `mgmtSectionGate` maps a PATH to a section and cannot
tell `GET /ai-ops/overview` from `POST /ai-ops/emergency-stop`, because they share a prefix. So
simply classifying the prefix — the obvious one-line fix — would have handed every holder of the
section the emergency stop, the emergency resume, the kill switch, safe mode, war room, and agent
run / restart / control.

## What shipped

- **`requireFullAdmin`** in `authMiddleware.ts`: the guard that means "not a scoped role", which
  the codebase did not have.
- **All 14 non-GET routes** in `aiOpsRoutes.ts` carry it. The 19 GETs do not.
- **One `PATH_SECTION` row**: `/api/admin/ai-ops` → `intelligence`.

`requireAdmin` is untouched. Narrowing it would silently change the hundreds of routes that use
it, which is a much bigger decision and not this ticket's.

## The design decisions worth arguing with

### `intelligence`, not a new `ai_ops` key

I proposed a new `ai_ops` section when I put the mechanism to Ali, and then found the fact that
makes it wrong: `/admin/ai-settings` is only a redirect, and the real page is
`/admin/intelligence`, which is **already gated on `intelligence`** by its nav entry. A new key
would have been a narrower API grant and a worse outcome — a reader would need TWO grants to make
ONE page work, and the second would exist only to paper over the first.

`intelligence` is also what the existing rows in that table do: classify from the page and the
data, not from the route's name.

### The row admits nobody new, and that is the condition for adding it safely

**No scoped role holds `intelligence`** — verified by counting, and asserted in
`mgmtSectionGate.aiOps.test.ts` so that a future role granted it fails a test rather than
inheriting a surface. `owner` and `admin` derive it from `ALL_SECTIONS`; legacy admins skip the
gate. So on merge, nobody gains anything and nobody loses anything. That is the condition
`brandPaths.test.ts` names.

### The guard is defined as "whoever reaches an unmapped admin path today"

Legacy admins, `owner`, and the near-full `admin` (whose `isBroad` branch passes unmapped paths).
Matching that set precisely is what makes applying the guard take access from **nobody** — anyone
who can POST to these routes today still can. `requireFullAdmin.test.ts` asserts that as its own
property, because the alternative is a regression dressed up as a hardening.

### The verb split IS the read/act split, and it is checked rather than assumed

All 19 GETs are reads; all 14 non-GETs are actions. That is a fact about this file, not a general
truth, so `aiOpsRoutes.readWriteSplit.test.ts` pins it structurally and additionally asserts that
no GET path is action-shaped — so `GET /ai-ops/restart`, added later, fails instead of inheriting
a read grant.

### The four most dangerous routes stay unmapped

`/api/admin/system`, `/api/admin/launch` and `/api/admin/system-health` live in the same file and
are deliberately still UNMAPPED, so they remain deny-by-default for every scoped role. They carry
`requireFullAdmin` anyway: the day somebody classifies one of those prefixes, the kill switch must
not open as a side effect of a row added to a table in a different file.

## Verification

- `jest --testPathPattern "middlewares|mgmt|auth|aiOps|routes/admin"` — **150 suites, 2,597
  tests passing**. 64 new tests across three files.
- `tsc --noEmit` — **exit 0**. Control errors planted in all three changed source files produced
  exactly **3**, and all three restores were byte-identical.
- **NINE mutation tests, all caught:**
  1. `requireFullAdmin` stripped from the emergency stop — 3 failures
  2. stripped from the kill switch — 3 failures
  3. a scoped role (`mentor`) added to `BROAD_MGMT_ROLES` — 4 failures
  4. the guard predicate inverted so only scoped roles could act — 22 failures
  5. the `mgmt_role` presence check dropped, locking out LEGACY admins — 2 failures, caught by
     the regression property rather than by a permission test
  6. the scoped-role refusal removed entirely — 19 failures
  7. the `PATH_SECTION` row removed, back to a latent 403 — 5 failures
  8. the prefix mapped to `dashboard`, which EVERY mgmt role holds — 4 failures
  9. `requireFullAdmin` added to a READ, silently reverting the change — 1 failure
- A **positive control on the premise**: the suite asserts that `requireAdmin` really does pass
  every scoped role. If that ever stops being true, this guard may be redundant and should be
  reconsidered rather than kept out of habit.
- gitleaks clean; the repo's scanner self-tested on 4 planted secrets first, then 8,704 files.

## A pre-existing failure this PR INHERITS and did not cause

`node scripts/checkTestTypecheck.js` is **red on main**:
`src/services/maya/__tests__/mayaToolGrantReadiness.test.ts` is a new file with 1 type error.

Traced rather than assumed: added by commit `1cb0491f4` ("Maya: register both tool belts and file
her grant requests"), and `git merge-base --is-ancestor` confirms it landed on main AFTER
`89f1ce228` — i.e. between the ratchet run during Phase 2b (which reported the baseline matched
exactly, in both directions) and this one. **None of this session's three new test files are
flagged.** The gate is report-only in CI, so it does not block, but it is red for everyone until
somebody fixes that one error. Not folded in here: it is another session's file and this is an
auth change.

## Not done here

- **Quincy still has no access.** This makes the grant POSSIBLE and safe; it does not make it.
  The grant is one row — `intelligence` as a `mgmt_extra_sections` extra on his existing role —
  through the surface `communityMemberRoutes.ts` already exposes. Who gets it is a decision about
  a person, so it is Ali's, not a line in this PR.
- **Granting `intelligence` is wider than ai-ops alone.** It also covers `/api/admin/ceo`,
  `/api/admin/cb-system`, `/api/admin/insights`, `/api/admin/governance`,
  `/api/admin/agent-orphans` and `/api/admin/knowledge-ops`. Stated plainly because the narrower
  alternative was rejected on the grounds above, not because it does not matter.
- **`requireAdmin`'s weakness is untouched everywhere else.** Every other route guarded by
  `requireAdmin` alone still cannot distinguish a scoped role from a full admin. That is only
  latent where the path is unmapped, which is most of them — but it is a class of defect, not one
  bug, and closing it route by route is a separate piece of work.
- **The dataset scope still is not ENFORCED at runtime** (Phase 2b's open item, unchanged).
- **Kesetebirhan Delele has still not been contacted.**
