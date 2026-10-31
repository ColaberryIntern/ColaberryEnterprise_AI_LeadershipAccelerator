# Releases become autonomy levels, without deleting anyone's work

**Decided by Ali, 30 October 2026.** Agent-to-agent communication is in scope, so `autonomy:R8` is
a real rung rather than a ceiling. Nothing an intern has done may be deleted. Kes signs `R0` to
`R2`; Ali signs `R3` and above.

This document is the migration design. The audit it follows from is
`AGENT_FACTORY_AUTONOMY_STRATEGY.html`.

---

## The one-sentence change

A release stops being a **phase of work** and becomes a **rung of autonomy**.

Today each of the ten domain projects has three releases — `r0` Discovery and validation, `r1`
Legacy migration plan, `r2` Capability development. Those are workstreams. The platform separately
defines ten autonomy levels, `autonomy:R0` to `autonomy:R9`, in the owner's own words, and nothing
in the project structure refers to them. The lowercase `r0/r1/r2` looks like the ladder and is a
different axis, which is most of why this drifted.

## The constraint that shapes everything: nothing is deleted

**513 stories exist and 51 are complete with a `verified_at` stamp on each.** That is real work by
seven people. The migration below does not delete a story, a status, a verification, a narrative or
a prompt. The strongest statement available is this one:

> After the migration, every story row that exists today still exists, with the same `id`, the same
> `title`, the same `status`, the same `verified_at` and the same `build` prompt. The columns that
> change on an existing row are `task_list_id` — which release it hangs under — and `release_key`,
> which moves with it because a release now *is* a rung.

*(This paragraph said "503" and "the only column that changes is `task_list_id`" when it was
written on 30 October. 503 became 513 when Phase 1 gave every domain a Command Center, and the
one-column promise did not survive implementation: see "Two columns change on an existing row" under
Phase 2 for what actually happens and why.)*

And even that is reversible, because the three original release rows are **kept, not dropped**. They
end up empty, and they are the rollback path: one `UPDATE` puts every story back.

## The mapping

| What exists today | Goes to | Why |
|---|---|---|
| The 5 research stories per domain | `autonomy:R0` | R0 is literally *"Define the workflow, requirements, risks and human decisions."* That is what those five stories are. |
| The legacy migration story | `autonomy:R0` | Same kind of work: deciding what the agent inherits before it does anything. |
| The Command Center (STORY-000) | `autonomy:R0` | Understanding what you are about to build is R0 work, and it stays first on the board. |
| Each capability story (443 of them) | the capability's own `starting_autonomy` | Already recorded per capability. Measured: **all 443** are `autonomy:R0`, not merely most, so the re-parent consolidates rather than spreads — which is what the next section is about. |
| *(new)* one story per `release_behaviour[]` entry | that entry's `autonomy` | **This is the part that is purely additive.** |

### The additive half is the important half

Every capability record already carries `release_behaviour[]`, an array of
`{autonomy, behaviour, acceptance_criteria}`. One entry per autonomy level, with its acceptance
criteria, already written. From `internship.json`:

```json
"starting_autonomy": "autonomy:R0", "max_permitted_autonomy": "autonomy:R4",
"release_behaviour": [
  { "autonomy": "autonomy:R2", "behaviour": "Answers which states an application can legally reach next…",
    "acceptance_criteria": "…evaluator is a human reviewer against internshipStateMachine.ts" },
  { "autonomy": "autonomy:R4", "behaviour": "Drives a multi-step application lifecycle end to end against sandbox fixtures",
    "acceptance_criteria": "…mutation-proven by a test that dies when the lock or assertTransition is removed" }
]
```

**The shape we want is already data.** It is simply never projected into the releases and stories
tables. So the new stories are not invented; they are a projection of records that already exist,
with acceptance criteria somebody already wrote.

## Why this does not make anyone look worse

A fair objection: if all the completed work lands at `R0`, does the migration make Quincy look like
he has done less?

No, and the opposite is closer to true. Today he is at 50% of a flat 54-item checklist with nothing
above it. Afterwards he has:

- `R0` substantially complete, which is accurate
- `R1` with real stories he can claim immediately, because he **has** built fixtures, a sealed
  baseline test and a locked sandbox — he simply had nowhere to record it
- `R2` through `R9` visible above him for the first time

The migration gives him somewhere to put work he has already done and cannot currently log. That is
the opposite of a demotion.

## Three phases, in order, each shippable alone

### Phase 1 — Make the agents real and give everyone a Command Center

**BUILT, 30 October 2026.** What follows is what was planned; the subsection after it records what
building it actually found, because one of the three items was not the problem it looked like.

Nothing on a ladder means anything while the agent is invisible and nobody can see their own plan.

1. **Backfill STORY-000** into all ten domain projects, and add the injection to the domain
   provisioning path so the next domain gets one automatically. The mechanism works and has fired
   54 times on other projects; these ten were provisioned around it.
2. **Seed each agent's identity** — the enrollment, community member and admin user rows that make
   an `ai_agents` row visible. Nine agents have the row and not the identity, which is why an
   intern opening their console today sees an empty page rather than a broken one.
3. **Link each agent to its project** so the card reads `built: true`.

Still `enabled: false`, still `observe`, still no tools. **Visible is not the same as able**, and
this phase deliberately only buys visibility.

#### What Phase 1 found: the identity seeder was not missing, it was refusing

Item 2 was written as "seed each agent's identity", on the assumption the seeder had never run.
It runs on **every boot**, and it had been **refusing all nine agents on every boot for twelve
days**. Measured in the production container, 30 October:

```
[AI Ops] domain agent identity seed failed for MarketingDomainAgent:
  AiAgent.tools_granted is missing or empty — every ticket-creating agent must declare its
  real capabilities in AGENT_REGISTRY before seedAgentIdentity() will register it
  (Agent Ticket Standard Step 4).
```

Nine lines like that, every restart. **Two correct designs deadlocked each other.**
`agentRegistry/domainAgents.ts` ships all ten agents at the Release Zero floor with
`tools_granted: []` *deliberately* — its own header says "no capability. Granting one is AF7.1 and
requires a manager" — and `seedAgentIdentity()` refuses any agent whose tool list is empty.

The seeder is fail-open, so nothing broke loudly. `liveAgentsService` selects `AdminUser` where
`is_ai_operated = true AND agent_id IS NOT NULL`, so an agent with no identity renders an **empty**
console rather than a broken one. Seven interns opened their agent and saw nothing, with no
indication that anything had refused anything.

**The fix was not to grant a tool.** Granting one would also lift the `no_tool_grants` cap in
`effectiveAuthority()`, which forces any capability above `autonomy:R2` back down while grants are
empty — so a cosmetic fix would have quietly raised nine agents' authority ceiling. Tool grants are
the owner's lever by design and by explicit instruction; a boot-time seeder must never pull it.

Instead the gate keeps its scope and gains the words its own error message already used: it
protects **ticket-creating** agents. An agent that declares `nonTicketCreating` is exempt from that
one check, and the exemption is honoured **only at the floor** — `enabled` and `autonomy_level` are
re-read off the row rather than trusted from the config, so an exempt agent that has been switched
on or promoted is refused exactly as before. Ten tests hold that line, including a positive control
proving the gate still refuses the same row without the exemption.

#### The one existing column Phase 1 writes

This document promises that the only column changing on an existing row is `task_list_id`. That is
true of Phase 2 and **not** of Phase 1, so it is corrected here rather than quietly contradicted:
backfilling STORY-000 also rewrites `position` on the stories already in each `r0` release, because
the portal sorts the board on it and a Command Center that renders fourth is a Command Center
nobody opens first.

It renormalizes rather than shifting. A shift has to know whether it already ran — run it twice and
`r0` starts at 2; crash between the shift and the insert and it starts at 1 with a hole, and both
states are silent. The backfill instead computes the intended order (Command Center first, then
every existing row in its current order) and writes `0..n`, which is idempotent **by value**: a
second run computes the same numbers and the `IS DISTINCT FROM` guard writes nothing. It also
repairs a tie or a gap, which a shift would preserve forever. Relative order among the builder's own
stories is never changed.

No story, status, `verified_at`, narrative or prompt is touched.

#### Item 3 resolves the agent ids, it does not pin them

`AGENT_DOMAINS[].agent_id` is populated for exactly two domains, `learner_success` (Reese) and
`curriculum` (Dara), because both agents predate the Agent Factory. The nine `*DomainAgent` rows
were created later, in one batch, and their ids were never written back.

Those ids are **not** derived — `seedAgentRegistry` creates the rows with `findOrCreate` keyed on
`agent_name`, so each id is a UUID minted at insert time and differs per environment. Pinning nine
production UUIDs into the registry would have produced a file that is correct in production and
silently wrong in dev. `agent_name` is the only stable link, so that is what the reconcile resolves
on. It fills a `NULL` only, is tenant-scoped (the sibling reconcile shipped without that predicate
and a verifier reproduced it clobbering another tenant's row), and writes nothing to `enabled`,
`autonomy_level` or `tools_granted`.

It reports all **ten** domains, not the nine in the agent registry. `curriculum` has no
`*DomainAgent` entry because its employee is Dara, and a report covering only the registry's nine
would read as ten clean domains.

### Phase 2 — Project the ladder

**BUILT, 31 October 2026.** What follows is what was planned; the subsections after it record what
building it found, because two of the four items were not quite what this document promised.

4. **Create the ten autonomy releases** per project, keeping the three existing ones.
5. **Re-parent** existing stories per the mapping table. One column changes.
6. **Generate the new stories** from `release_behaviour[]`.
7. **Persist the link** the provisioner currently computes and throws away: `capability_id` and the
   autonomy stage belong on the story row. Without them no dashboard can ever say where anyone is.

Measured: **13 releases per project** (ten rungs at positions 0-9, the three originals kept empty
at 10-12), **513 stories re-parented**, **964 projected** from `release_behaviour[]`, for 1,477
stories in all. Still `enabled: false`, still `observe`, still no tools granted, and finishing a
release still promotes nobody.

#### Two columns change on an existing row, not one

This document promised that "the only column that changes on an existing row is `task_list_id`".
That is not achievable, so it is corrected here rather than quietly broken.

**`release_key` moves with `task_list_id`.** Every one of the 513 rows in production satisfies
`release_key = its list's cluster` today, and leaving `release_key` behind would break that
invariant and leave `coverageMatrix` — which reads `release_key` — reporting the superseded axis
forever. **`position` is also rewritten**, for the reason Phase 1 recorded: three lists merging
into one rung produces dozens of duplicate positions, and the portal sorts the board on it. It
renormalizes rather than shifts, so it is idempotent by value.

Three previously-NULL columns are populated: `capability_id`, `autonomy_stage` and `story_kind`.
All three were null on all 513 rows before this ran, so filling them takes nothing away.

There is also one repair. **17 rows hold a `story_id` truncated by the old `varchar(60)` column**,
and re-parenting writes the full value now that the column can hold it. That is found and explained
in the next section; it is listed here because it is a fourth column changing on an existing row.

Never touched on an existing row: `id`, `title`, `status`, `narrative`, `build`, `due_on`,
`verified_at`, `verified_by`, `verified_ref`, `verification_json`. **56 rows carry a verification
stamp and all 56 keep it** (this document said 51 when it was written on 30 October; five more were
verified in the week after). A test asserts the exact field set a re-parent writes, so this cannot
drift into a wider update without the test naming it, and the planner was run against a snapshot of
the real production rows to confirm every one of those 56 is re-parented rather than left behind.

#### `story_id` had to be widened, and 24 ids were already truncated

`student_tasks.story_id` was `varchar(60)`, and the provisioner truncates to fit while deriving the
row `id` from the **untruncated** string. That combination is a duplicate key by another name: two
logically distinct stories can be written as two rows carrying the same `story_id`, with no error.

Measured in production before this shipped: the longest domain `story_id` is exactly 60 characters
and **24 of them sit at the limit**, cut off mid-word — for instance
`product_experience.CAP.stylesheet_architecture_consolidation`, whose real id ends
`..._consolidation_proposal`. Nothing had collided, purely by luck of the naming.

A per-rung story id appends the rung to the capability's, which reaches 81 characters. Keeping the
60-char limit would have produced **221 pairs of distinct stories sharing one truncated id**. Of
the alternative naming schemes measured, the only one that avoided every collision did so by luck
too, and still stored a truncated identifier. So the column is widened to 120, which in Postgres is
a catalog-only change that alters no existing value.

#### The truncation also hid 17 stories from the migration itself

This is the finding that justified checking the plan against real rows rather than a fixture.

The migration matches an existing row to a generated story by `story_id`. Run against the test
fixtures it was clean, because those fixtures generate their ids at today's width and therefore
match by construction. Run against a read-only snapshot of the **actual production rows**, it
reported **17 stories as unrecognised** — it would have left them under a superseded release and
inserted a fresh duplicate of each beside them. Seventeen interns' stories, orphaned silently,
with the new rows looking perfectly correct.

They are not unrecognised. The database holds
`curriculum.CAP.certification_item_rubric_review_and_improvem` where the generator now produces
`..._improvement`. So the migration matches the wide id first and the 60-character form second, and
repairs the stored value as it re-parents.

The first attempt at that refused, correctly: four generated ids share the prefix
`curriculum.CAP.module_and_artifact_drafting_for_human_approv` — the capability story and its R0,
R1 and R4 rung stories. The ambiguity is only apparent, because the per-rung stories did not exist
while the column was 60 wide, so the candidates are narrowed to the kinds that did. The refusal
stays in place for a genuine collision between two pre-ladder stories.

#### The ladder's own guard had to be extended to R8

The "no story claims a capability this platform does not have" test caught the new generator on its
first run, on `learner_success.CAP.daily_at_risk_student_flagging.autonomy:R8`. It was right to:
R8 is agent-to-agent handoff, this document says that capability does not exist here, and the
generated story described the behaviour without saying so. Every R8 story now carries that
disclosure. Suppressing the story would have hidden a real gap and relaxing the guard would have
been worse than either.

### Phase 3 — Make promotion a decision

8. **Wire the promotion gate.** `evaluatePromotion()` has 22 refusal codes and zero database or
   route callers. It refuses a two-step jump, a missing scenario class, a threshold nobody accepted,
   evidence with no source, an approver who is also the proposer, and a machine identity. It guards
   nothing today.
9. **Tool requests** — shipped as AF7.1 alongside this document.

## The rule that keeps this honest

```
NON_PROMOTING_SIGNALS = ['story_completed', 'elapsed_time',
                         'successful_conversation', 'mocked_tests_passed']
```

Recorded in the promotion code, quoting the owner: *"Story completion, elapsed time, a successful
conversation or passing mocked tests must not automatically promote autonomy or authorize
production actions."*

So **finishing a release must never promote an agent.** Finishing a release makes it *eligible*. A
named human promotes it, one step, on evidence. If the migration got this wrong it would convert a
governance ladder into a progress bar, which is precisely the failure the ladder exists to prevent.

## Tools are already the throttle

`effectiveAuthority()` contains this branch: if `granted_tools` is empty and the capability is above
`R2`, the effective autonomy is **forced down to `autonomy:R2`**, reason `no_tool_grants`.

That means the owner already controls how far any agent can go, structurally, in code. What was
missing is any way to open the throttle without a deploy. AF7.1 adds the request half; the grant
half needs a write endpoint that records **who granted and when**, which nothing in the platform
does for tools today.

## R8, now that agent-to-agent is in scope

`autonomy:R8` is *"Coordinate necessary, authorized handoffs with other agents."* **That capability
does not exist in this platform at all** — the research story that asks about it says so verbatim.

It is therefore a platform build, not an intern deliverable. The natural home is the `platform`
domain, whose capabilities are orchestration, agent lifecycle and reliability — and whose builder is
the one furthest along. Handoff belongs with the person who has already mapped how agents are
contained, paused and reconciled.

## What this does not do

- Does not delete a story, a release, a status or a verification.
- Does not enable an agent, grant a tool or change an autonomy level. Every one of those is a
  separate, named, human act.
- Does not re-provision the ten projects. They exist; they are migrated in place.
- Does not decide the three unowned domains — `executive` (95 stories), `learner_success` (43) and
  `website` (34) still have no builder, and that is an owner decision this design deliberately
  leaves open.
