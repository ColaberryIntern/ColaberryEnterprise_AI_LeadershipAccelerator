# CC-20261111-n4k8 — manager access, computed instead of remembered

- [x] Replace the audit's stored `manager_can_reach` with a computed access verdict
  - Date: 2026-11-12
  - Session: CC-20261111-n4k8
  - What changed: a new pure module `scripts/lib/agentManagerReach.ts` derives whether a
    domain's manager can open their employee's Agent Detail page by walking the real access
    chain, and the Agent Factory audit now reports that instead of the stored column.
  - Verification: `tsc --noEmit` 0 errors, proven live with a planted control error that was
    caught at `agentManagerReach.ts(267,7)`; 24 new unit tests plus 12 added to the audit
    suite (44 across the two files); the runner's SQL executed against production, including
    a positive control on `ai_agents.reports_to_org_member_id` (276 agents, 33 with a
    manager); mutation-tested by reverting `assess` to the stored flag, confirming the
    mutation was present in the file, and watching 2 tests fail; `checkTestTypecheck`
    baseline matched in both directions; full backend CI suite green.
  - Notes: supersedes the manager-access recommendation in
    `CC-20261111-n4k8-agent-factory-audit.md`, which was wrong. No new management role was
    created; see below for why none was needed.

## What was authorized, and why it was not built

Ali authorized building a minimal `agent_manager` management role. It was not built, because
measuring the chain showed it would have granted nothing.

Every one of the **12 manager-gated routers** — Agent Detail, the charter, directives, the
manager inbox, goals, one-on-ones, the conversation, memory proposals, explainability, report
subscriptions, the email inbox, behaviour switches — mounts under `/api/admin/agents/:id`, and
`PATH_SECTION` files that prefix under **`dashboard`**, the one section nearly every management
role already carries. The per-agent narrowing is not done by a section at all: it is done by
`requireAgentManagerOrAdmin`, which resolves the caller's `org_members` row from their verified
token and then requires the agent to be in their downstream. That scoping already exists, is
already tested, and is already exactly as narrow as a new role would have been.

A new role would therefore have added a row to `MGMT_ROLE_DEFS` granting `dashboard` and
nothing else, and changed no one's access.

## Three wrong answers to one question, and what they had in common

| Attempt | Claim | Why it was wrong |
|---|---|---|
| 1 | "Four `admin_users` rows is the cheapest unlock." | An `admin_users` row is the LEGACY wide login, which skips the section gate entirely. Three of the four needed nothing. |
| 2 | "Agent Detail requires the `program` section, so rows alone unblock nobody." | `/api/admin/agents` is filed under `dashboard`, not `program`. |
| 3 | "Build a minimal `agent_manager` role." | `dashboard` is already held; the narrowing is in `requireAgentManagerOrAdmin`, not in a section. |

All three were read off `agent_domain_projects.manager_can_reach` and its `manager_blocker`
prose, and all three inherited that column's errors. **A stored boolean describing a live
access decision is a cache with no invalidation.** It was written once, by hand, from a reading
of the code, and then outlived both the code and the data it described.

That is the actual defect, and it was in the audit shipped earlier the same day: PR #3972 read
that column and reported it as fact.

## What production actually says

Measured 12 November 2026. `manager_identity_id` is an **`org_members.id`** — not a
`platform_identities.id`, which a zero-row join established before anything was concluded from
it.

| Domain | Manager | Stored | Computed | Mechanism |
|---|---|---|---|---|
| platform | kes@ | `false` | **reaches** | staff `mgmt_role = admin` |
| product_experience | aleem@ | `false` | **reaches** | staff `mgmt_role = product_experience` + `{agents}` |
| sales | roselen@ | `false` | **reaches** | staff `mgmt_role = revenue` + `{agents}` |
| admissions | taiwooludimimu@gmail.com | `false` | blocked | **email mismatch** |
| website | saitejesh@ | `true` | reaches | **legacy admin only** — scoped path broken |
| curriculum, internship, marketing, executive, learner_success | | `true` | reaches | staff role |

**The stored column is wrong on three of ten rows**, and all three are false negatives: nobody
was locked out who the column said was. The recommendation drawn from it — create four
`admin_users` rows — would have widened near-full access from 7 people to 11 and unblocked
nobody, because three of the four were never blocked.

### Taiwo is blocked, and not for the recorded reason

His `manager_blocker` says "(a) he has no admin_users row, and (b) no `/api/admin/admissions`
prefix is mapped in `mgmtSectionGate`". Both are wrong now:

- He **has** an `admin_users` row, `taiwo@colaberry.com`, role `admin`.
- A legacy admin token carries no `mgmt_role`, so `mgmtSectionGate` returns `next()` on its
  first branch and never sections him. (b) cannot block him.

The real refusal is that the 6 agents reporting to him hang off an `org_members` row under
**`taiwooludimimu@gmail.com`**, while his login is `taiwo@colaberry.com`.
`requireAgentManagerOrAdmin` does `OrgMember.findOne({ where: { email } })` — a plain Postgres
equality, so it finds nothing and answers *"No linked org member record for this admin"*. One
field, two addresses. Left for Ali: it is a change to a real person's identity record.

### The row that is right for the wrong reason

`website` is recorded `true` and does work — through a legacy full-admin row. Its manager holds
`mgmt_role = 'support'`, whose only section is `students`, so the **scoped** token is refused.
A boolean cannot say that, so it reads as healthy while the narrow path is broken and a
near-full grant is what holds the surface up. That is why the verdict carries `via`, and why
`managersOnLegacyOnly` is its own headline.

## What the module refuses to claim

The real downstream test is `isAgentInHumanDownstream(orgMember.id, agentId)` — per agent. An
audit holds no single agent id, so the count of agents naming the manager as `reports_to` is
used instead. That is **necessary, not sufficient**, and the module says so rather than
rounding it up to a verdict. Overclaiming here would be the same mistake as the flag it
replaces.
