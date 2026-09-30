# Client Portal Map

**Session:** CC-20260823-r4k9 · **Base:** `d1d46d1e` · **Gate:** 0

Answers the Gate 0 question *"What client/org portal exists?"*

---

## The short answer: none

There is no client-facing surface in this platform today. Every authenticated surface
belongs to one of three audiences, and an external client is none of them.

| Surface | Route tree | Audience | Guard |
|---|---|---|---|
| Public site | `frontend/src/routes/publicRoutes.tsx` | Anonymous visitors, leads | none |
| Student portal | `portalRoutes.tsx` | Enrolled participants | `requireParticipant` |
| Admin / management | `adminRoutes.tsx` | Colaberry staff | admin auth + `mgmtRole` / `canSection` |
| Referral | `referralRoutes.tsx` | Referrers | referral token |

`/refactored` is **unclaimed** — no occurrence in any route tree or backend route file.

---

## What "org portal" means today, and why it is not this

`models/Organization.ts` is the closest thing, and it is a different concept:

```ts
owner_enrollment_id: { allowNull: false, unique: true,
                       references: { model: 'enrollments', key: 'id' } }
// "one management account per manager enrollment (idempotent register)"
```

An `Organization` is **a manager's management account** — a Colaberry-side construct for a
person who manages other learners. Backed by `orgService.ts`, `adminOrgService.ts`,
`OrgMember`, `OrgCohort`, `db/ensureOrgAccountSchema.ts`.

It is not a client company, cannot exist without an enrollment, and its services carry no
tenant filter (`grep -c tenant_id` returns **0** for both). See C-02 in
[SCHEMA_CONFLICTS.md](SCHEMA_CONFLICTS.md).

**Sponsor/employer dashboard:** recorded in project memory as *not built*. Consistent with
what the code shows.

---

## What Gate 10 must build

### Navigation (master plan §Gate 10)

```
Overview · Decisions · Design · Preview · Changes · Releases · Results · Documents
```

Eight destinations, none of which is a story board, a terminal, an agent log or a Kanban.
That is the point: *"Client UI is not builder UI."*

### The projection rule — the one that actually protects the client relationship

Master plan §Gate 10 forbids exposing raw agent scratchpad, internal mentor notes, private
builder assessment, secrets, and unnecessary engineering logs.

**This must be enforced by returning a different shape, not by hiding fields in React.**

```
GET /api/refactored/projects/:id            builder shape
GET /api/refactored/client/projects/:id     client shape — a different serializer
```

A client-role check that filters a fully-populated response in the browser puts a
mentor's private assessment of an intern into a network payload that a client can open
DevTools and read. The projection therefore happens server-side, in a dedicated
serializer, and the test for it asserts on the **response body**, not on the rendered DOM.

Precedent exists: the admin portal already has `mgmtRole` / `canSection` /
`adminAllowedSections` for staff-side section gating. The mechanism is understood; the
audience is new.

### Client Project AI

Answers only:

- why this exists
- what changed
- what needs approval
- what a change would affect
- what evidence supports a release

It reads **approved project truth** — contract, approved decisions, releases, evidence
summaries. It does not read the agent scratchpad, mentor notes or builder assessments,
because those are not in its context at all. Scope by context construction, not by
instructing the model to decline.

This is also the §11 untrusted-input boundary: client conversation is untrusted text and
must never be able to alter tool or security policy.

### Client Acceptance — a durable object, not a UI state

```
delivery_client_acceptances
  release_id | story_id      scope
  promised_acceptance         what was committed
  preview_ref                 what they looked at
  evidence_summary            what supported it
  accepted_by_identity_id
  accepted_at
  comments
  exceptions                  accepted-with-exceptions is a real outcome
  status
```

Master plan §24 stop condition: *"client acceptance is not durable."*
`AcceptanceChecklist.tsx` in the student portal is a UI component, not a record — it is
not the precedent to follow.

### Change requests show impact before build

An approved state plus a client request produces an **impact-aware change request**, not a
silent mutation. The impact is computed from the project graph: which requirements,
design decisions, stories and agent definitions the change touches.

---

## Identity

Master plan §12: *"Do not create separate Refactored usernames/passwords. Use
PlatformIdentity."*

**Open question, deliberately not assumed:** a client reviewer at an external company has
no enrollment and no admin user. Whether `PlatformIdentity` + `PlatformIdentityLink`
already support an identity linked to neither has **not** been verified — it needs a read
of `modules/identity/platformIdentityService.ts` at Gate 2.

If it does not, the options are to extend `PlatformIdentity` (preferred — one identity
spine) or to add a client-invitation link type. Either way it is a Gate 2 decision, and
inventing a second credential store is explicitly out.

**Also out of scope for this plan:** live client invitations. Master plan §20 forbids them
along with production email.

---

## Security requirements specific to this surface

1. Client sees only their own engagement's projects — tenant guard **and** delivery
   membership, in that order, so a foreign project is denied before its existence is
   disclosed.
2. Private repo contents never reach the client surface except as approved artifacts.
3. No client data in global analytics payloads (master plan §11, §Gate 15).
4. Client comment text is untrusted input — escaped on render, never interpolated into a
   prompt as instruction.
5. Every client route gets the four auth tests from
   [AUTHORIZATION_MATRIX.md](AUTHORIZATION_MATRIX.md) §6.
