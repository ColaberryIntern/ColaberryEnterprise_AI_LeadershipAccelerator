# CC-20261113-q7m2 — the approval queue has no owner who can act

**Date:** 2026-11-13
**Branch:** `workstream/approval-queue-digest`, cut from `origin/main` at `e2f3f111f`
**Follows:** the ladder migration, applied to all ten boards earlier today

---

## Why

Step 3 of every capability ladder ends at a human decision, and its acceptance criterion is
explicit that an undecided request does not count:

> A named human other than the builder has recorded a decision on it. A decline counts; an
> undecided request does not.

Measured on production the day the ladder went live:

| | |
|---|---|
| Change requests ever filed | **1** (Kalkidan's, 12:21 PM CT) |
| Change requests ever decided | **0** |
| Rows in `agent_domain_tool_request_decisions` | **0** |
| Rows in `agent_domain_build_authorizations` | **0** |
| Stories carrying `accountable_identity_id` | **0** of 553 |

Seven builders are now each pointed at one capability. Every one of them reaches that decision
within days, into a queue that has never had a single decision made in it.

## The finding that mattered more than the digest

`agent_domain_projects.manager_can_reach` is **true for all ten domains**. It answers "can this
person open the admin UI". But both the queue list endpoint and the decide endpoint are
`requireAdmin`, which reads the token's role — so reaching the UI is not deciding.

**Three of the ten named managers hold no admin role at all:**

| domain | builder | named manager | admin role |
|---|---|---|---|
| platform | Quincy | kes@colaberry.com | **none** |
| product_experience | Mihret | aleem@colaberry.com | **none** |
| sales | Victoria | roselen@colaberry.com | **none** |

And they do not see an error. `AdminChangeRequestsPage` swallows the 403 and renders no queue,
so the page looks **empty** rather than forbidden. For three of the seven staffed builders, step 3
terminates at a person who can neither act on the request nor see that it exists.

The other seven resolve correctly: Taiwo, Swati, Dhee, Sohail, Saitejesh and Ali all hold admin.

## What was built

**`agentDomain/approvalQueueDigest.ts`** — pure composer. No database, no mail, no clock. Takes
open requests plus a per-domain decider and returns one digest per mailbox.

Routing rules, which are the behaviour worth having:

- A named owner who **can** decide gets their domain's requests.
- A named owner who **cannot** decide is **not** mailed. Those requests escalate to the admin
  list, which names the domain and the person so the access can be fixed. Mailing somebody daily
  about a queue they cannot open is how a digest teaches its reader to ignore it.
- No recorded owner escalates the same way.
- Nobody is ever asked to decide their own request.
- One mailbox owning two domains gets **one** mail, not two.
- Requests with no owner *and* no fallback are reported as orphaned and make the run exit
  non-zero, because silence there would read as "covered".

Ordering and age, both absent before: **oldest first** (the server orders `requested_at DESC`,
which put the request most needing a decision at the bottom of the page) and the age stated in
whole days.

**`briefings/approvalQueueDigestSender.ts`** — the I/O, modelled line for line on
`handoffDigestSender.ts`, the one digest in this repo that already does the hard parts right:
one mail per human who owes something, once per mailbox per Central date via `claimBriefingSlot`,
through `guardedSendMail` so the kill switch and the dev sink both apply.

The address comes from `agent_domain_projects.manager_identity_id` → `org_members.email`, the
string the auth gate matches a token against. Deliberately **not** from the capability matrix's
`accountable_human` (a display name, e.g. "Sohail Syed") nor from
`agentDomainRegistry.manager_email`, whose own docblock says nothing should start trusting it.
`resolveManagerReach` is read for its **blocker sentence only**, never for its verdict.

**`scripts/sendApprovalQueueDigest.ts`** — dry run by default, `--apply` plus
`AGENT_APPROVAL_DIGEST_SEND=on` to send. Two independent gates, because this estate runs three
scheduler instances.

**`AdminChangeRequestsPage.tsx`** — an age chip on every submitted request (amber at two days,
red at five) and the Decide queue sorted oldest first.

## What was deliberately NOT done

**No cron is registered.** `aiOpsScheduler.ts` is past the 500-line ceiling, and a new module
under `services/scheduling/` would require adding an importer to `EXPECTED_CRON_IMPORT_FILES` in
the pinned `cronRegistryBaseline` fixture plus a registry seed row. That is a deliberate change
to a governance fixture and belongs in its own diff. This follows the `scripts/agentNudges.sh`
precedent instead: a script, with the crontab line left for the owner to install.

Also worth recording: `instrumentCronJob` runs an agent that is **absent from the registry**
untracked rather than skipping it, so a registry row could never have been the dark switch. The
env flag is.

## Verification

- `npx tsc --noEmit` — clean on both stacks.
- Full backend CI jest — **2,769 suites, 44,852 passed, 0 failed**, including
  `cronRegistryReconciliation`, which passes precisely because no new cron importer was added.
- Full frontend suite with the exact CI invocation including `--testPathIgnorePatterns /testEnv/` —
  exit 0, **719 suites, 9,621 passed**.
- 15 composer tests and 6 page-helper tests, **mutation-tested**:

| Mutation | Result |
|---|---|
| ignore `canDecide` and mail the powerless owner anyway | **1 failed** (the test written for that rule) |
| reverse the sort back to newest-first | **1 failed** |
| restored | 15 passed |

Each mutation fails exactly the test written for it rather than a spread, which is the shape to
want: a broad failure would mean the suite is coupled, not thorough.

## Open for the owner

1. **Aleem, Kes and Roselen hold no admin role.** Either grant it or move those three domains'
   decisions to someone who has it. Until then Quincy, Mihret and Victoria have no reachable
   decider.
2. **Nothing records a decider in data.** The address is derived from a manager join today; there
   is no row anywhere that says "this person owns this domain's decisions".
3. **The crontab line is not installed**, so the digest sends nothing until it is.
