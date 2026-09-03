# Repo Ownership Map — Gate 0

- Date: 2026-09-03 · Session: CC-20260902-m8q4 · Base: `e99fdb35`

§5 calls repo-per-project **non-negotiable**: *"One DeliveryProject = one canonical
project GitHub repo"*, and canonical execution must refuse to start until a paid
DeliveryProject has a verified repo connected.

## What exists

`docs/REPO_CONNECT_CONTRACT.md` is a real, thought-through contract. Its section titles
alone show the ground already covered:

- Two doors, one outcome — **Door A bring your own repo (primary)**, Door B provision and adopt (fallback)
- Proving push access without student OAuth
- What the platform CANNOT do, honestly stated
- **Revoked access is a normal state**
- The GitHub App, scoped not built
- The no-git fallback

That matches §31 almost exactly, including the rule that an arbitrary readable public
repo is not ownership proof.

`backend/src/models/GitHubConnection.ts` carries the runtime state: `repo_url`,
`repo_owner`, `repo_name`, `access_token_encrypted`, `webhook_secret`,
`last_checked_at`, `status_json`, `file_tree_json`, `last_sync_at`,
`commit_summary_json`, `repo_language`.

## The blocker

```
enrollment_id: {
  type: DataTypes.UUID,
  allowNull: false,
  references: { model: 'enrollments', key: 'id' },
},
project_id: {
  type: DataTypes.UUID,
  allowNull: true,
  references: { model: 'projects', key: 'id' },
},
```

**A repo connection requires an enrollment**, and its optional project link points at
`projects` — the *student* Project table, which the previous Gate 0 established cannot
generalize (`enrollment_id` and `program_id` both `allowNull: false`).

A commercial AI Flotation client has **no enrollment and no student Project**. As written,
a paid DeliveryProject cannot hold a repo connection at all.

This is the same shape of trap the prior Gate 0 found in `Organization.owner_enrollment_id`
— since made nullable. It is the third instance of the same underlying fact: see
`CURRENT_STATE.md` and the theme below.

## Options, none of which are implementation details

1. **Make `enrollment_id` nullable and add `delivery_project_id`.** Smallest schema
   change, keeps one repo-connection concept for students and clients. Risk: every
   existing reader assumes an enrollment is present.
2. **A separate `DeliveryRepoConnection`.** No risk to student flows, but it duplicates
   verification, token custody and webhook handling — and §150 names duplication as a stop
   condition.
3. **Bridge a synthetic enrollment per client.** Rejected here: it puts fictional students
   in the enrollment table to satisfy a foreign key, which corrupts every enrollment count
   in the business.

**Recommendation: option 1.** The verification loop, token custody and revocation handling
in the contract are the expensive parts and they are already built; only the ownership
column is wrong. But nullable-ing a non-null FK on a live table is a schema decision and
belongs to the DRI, not to implementation.

→ **ESCALATION-3 — RULED 2026-09-03: option 1 approved by the DRI.**

`GitHubConnection.enrollment_id` becomes nullable and gains `delivery_project_id`. One
repo-connection concept serves students and commercial clients, and the expensive parts —
verification, token custody, revocation handling — are reused rather than duplicated.

**The cost of that choice, stated plainly:** every existing reader assumes an enrollment is
present. Making the column nullable does not make those readers safe; it makes them
*wrong at runtime instead of at the schema*. Before this ships, every consumer of
`GitHubConnection` must be audited for an unguarded `enrollment_id`, and the migration
must be paired with tests that construct a connection with a null enrollment and a
delivery project. That audit is Gate 9's first task, not an afterthought.

## Custody principle to preserve

The contract already states it and §5 repeats it: the customer repo is where source
lives; the platform stores pointers, decisions, evidence, acceptance and history, and
**evidence must survive repo deletion or revocation**. Whatever option is chosen must keep
that true — which argues against anything that stores delivery evidence inside the
customer's repository.
