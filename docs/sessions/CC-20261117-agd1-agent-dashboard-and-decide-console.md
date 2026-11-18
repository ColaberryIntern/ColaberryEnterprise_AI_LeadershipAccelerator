# CC-20261117-agd1: the Agent Dashboard, and a decide console you can read

Seven asks from Ali on 17 Nov 2026, queued with `loop-architect` (run
`20261117-agent-dashboard`) and built as one PR because he asked for one: *"I want you to take all
the request I have given you and use the loop architect to queue them up and go through them one at
a time until you have completed everything. 1 pr and 1 deployment. I don't want to do the back and
forth."* The design was built first and approved before any product code was written.

## What he asked for, and what each one became

| Ask | What shipped |
|---|---|
| *"Change Request page and domain page should be built into the agent dashboard... removed from the left navigation"* | One **Agent Dashboard** at `/admin/agent-dashboard`. Four nav entries became ONE, not zero. |
| *"Both Draft this for me and Suggest one for me is throwing an error"* | Not a code bug: a half-landed deploy. Fixed by deploying `93a98352a`. |
| *"we need to do a better job of differentiating between a task and a tool"* | `task_key` on the contract, the form, and the console; CAPABILITY / TASK / TOOL columns. |
| *"When the request comes in make sure I can see an overview and click on it to get the highly formatted details... Conditional formatting, icons, emojis, visuals"* | The decide console's overview, cards and next-step chart. |
| *"allow me to add my own input... instead of just approving like the old design"* | Tool requests leave the Approve/Decline queue; the instruction box gets its first read-back. |
| *"If we are picking datasets we need to be able to see the data when we click on it"* | The dataset drill-in: shape, never rows. |
| *"Just like Marketing tab, we need 'Report a problem'"* | Its own endpoint on `dashboard`, on the hub and the console. |
| *"Also add a guided walkthrough so it's easy to understand how to use it"* | Five steps per audience, pointing at real elements by test id. |
| *"Try to convert Kalkidan and if you can't let's just delete"* | **Neither.** See below. |

## The deviation worth reading first

**"Removed from the left navigation" became four entries collapsing into one, not zero.** The
natural place to fold them is Agents, but that sub-list sits on section `agents`, and no Agent
Factory builder role carries `agents` or `internship` — measured against `mgmtRoles`, not assumed.
Deleting the four links outright would have left Victoria, Mihret, Ruth, Quincy, Sarbjit, Kalkidan
and Tashima with no route to their own work, the morning after being handed instructions telling
them to go and file tool requests. That is the AF11.9 failure one level up, in the navigation
instead of the gate.

So there is one entry, **Agent Dashboard**, on `dashboard`, which every role holds. All four routes
are preserved, so existing bookmarks still work. Cards that need `program` render as unavailable
with the reason, and whether they are reachable is answered by **asking the API** (a 403 is a real
answer) rather than by reading a role off the token, because a client-side copy of the rule is
wrong the moment it disagrees with the gate.

## The two bugs found while building, both mine

1. **`task_key` never reached the frontend.** It landed as REQUIRED on the contract and was absent
   from the type, the field map and the form. Every tool request filed after that commit would have
   been refused `task_key_missing`, and the seven builders would have met that this morning. Found
   by writing a test fixture, not by running the form.
2. **`columns_incomplete` compared the declared column count against the type map** rather than
   against the list returned, so a 225-column table truncated to 200 reported itself complete.

## What is on the screen now

**The Agent Dashboard** (`frontend/src/pages/admin/AgentDashboardPage.tsx`): an agent scope bar, a
KPI row, and three groups named CAPABILITY / TASK / TOOL, each header carrying its own definition.
Ali's distinction gets taught by using the page, not by a paragraph nobody reads.

**The decide console overview** (`DecideOverview.tsx`, `QueueCard.tsx`, `queueSignals.ts`). The
screenshot behind *"just approving like the old design"* was `/admin/change-requests`. The five
verbs, the ten-block case, the duplicate check and the instruction box have existed on
`/admin/tool-requests` since AF11.3 and Ali had never seen them, because nothing in the product led
from the queue he works out of to the console that can settle a grant. So the detail is unchanged
on purpose and the work went into the way in:

- **"Ready to decide" and "Held back"**, in that order, always adding up to what is waiting. The
  old screen could say how many requests existed. A queue of four with one decidable is not a queue
  of four, and one figure sent Ali to four decisions he could not make.
- **One chart**: horizontal ranked bars of what the waiting requests need next, each with its own
  number as a direct label. No pie, no second axis. Widths are a share of the largest bar rather
  than the total, so four requests of four kinds are four readable bars instead of four slivers.
- **Four tones from one map** shared with the cards, so nothing is drawn one way in the overview
  and another way in the row. Gray is unknown and unknown is never the safe end.
- **Per-card**: a readiness meter over ten real blocks, a risk strip of what approving it would let
  the agent do, and the age.
- **Tool requests LEAVE** the Approve/Decline queue, with a link rather than a silent
  disappearance: a count with no way through is the same dead end in a politer form.

**`suggestedStep` never suggests approving anything**, on any input, and a test asserts it across
six shapes. A console that said "looks good, approve" would be making the decision and calling it a
hint.

**The task, beside the request** (`TaskPanel.tsx`, `taskGrouping.ts`,
`GET /api/admin/agent-domain-tasks`). Reading a table, reading another system and writing a report
are three grants with three different blast radiuses, so they arrive as three requests. Deciding
the second without seeing the other two is deciding blind: approve the read, deny the write, and
the agent holds a permission for work it cannot finish. Three states that look alike are kept apart
by their own test ids, because they lead to different actions: no task, lookup failed, and one tool
is all this task needs. Never the word "granted" — a grant is a separate record.

**The rules already in force** (`InstructionsInForce.tsx`). `capability_instructions` is a log, so
the instruction box appends rather than replaces, and until now nobody could read what they were
appending to. AF11.14 has had an API since it shipped and no screen. Three states, never two: in
force, cleared, never set. A cleared instruction is a decision somebody made, not an absence.

**The dataset drill-in** (`datasetDetail.ts`, `DatasetDetailPanel.tsx`). Columns with the kind of
thing each holds, the row count, when it was scanned, what it joins to. It never returns a row:
`profile_summary` is not selected at all rather than selected and dropped, because a field that
never enters the process cannot be logged by accident or exposed by a later refactor, and nobody
can promise what a future profiler writes into it. A "semantic type" that is really a sampled value
is dropped to null, proved with a fixture carrying real-looking names and addresses. The panel is
titled "The shape of this table", not "The data", and says in its footer that no rows are shown and
none are available here — an unexplained absence reads as a thing that is broken. When a table
holds emails, names or phone numbers it says **"This table is about people"**, lifted out of a list
of forty column names.

The row count IS returned here although the list endpoint withholds it. The reversal is deliberate
and written down: the list's reason was about handing out business figures in bulk as a side effect
of typing in a search box; this is one named table at the moment somebody is deciding access to it,
and reading 300 rows and reading 300,000 are different requests.

**Report a problem** (`agentBugReportRoutes.ts`) is its own route on `dashboard`. Pointing the
button at the Marketing endpoint would have worked for exactly ONE builder in seven — `marketing`
is the only builder role that also carries `campaigns` — and the six who were refused would have
concluded it was them rather than us. Measured per role in the test.

**The walkthrough** (`AgentDashboardWalkthrough.tsx`): five steps per audience, each naming a
`data-testid` that already exists on the thing it is about, scrolling to it and outlining it. A
tour that explains the page in prose is a second copy of the page, written worse, that goes stale
the first time a card moves.

**Emoji became icons.** Ali asked for *"icons, emojis, visuals"*, meaning a card readable at a
glance. `frontendTypographyLint` refuses emoji in product copy and names the supported alternative.
That gate is right and the emoji carried nothing anyway: every one sat beside a word and an icon
already saying the same thing. The glance comes from the icon, the tone color and the word.

## AF10.9: the ladder lift, and the ticket that was wrong

`capabilityLadderLift.ts` reorders the four rungs to the top of each board and leaves one rung open
at a time. **The ticket's premise was wrong and I wrote it** — from a call transcript, without
measuring. The four-rung ladder already exists on all seven boards. Retitled, rewritten with a
CORRECTED banner, and correction comment 10520918210 posted. What is actually broken is that the
rungs are the LAST four stories on every board and six of seven have all four open at once.

`assertProgressPreserved` refuses any plan that downgrades a finished rung, so **Kalkidan's
verified rung 1 survives**, and a second test proves the guard is real by handing it a plan that
would undo it.

## Kalkidan's request: neither converted nor deleted

Read from production, read-only. `01805c02-c561-441c-9019-6e1cb43ab8a2`, filed 13 Nov, the ONLY row
in `agent_domain_change_requests`.

**It cannot be converted**, and not for a fixable reason. It is `kind: 'change'` with no detail row,
and three required fields have no answer anywhere in it: `capability_id` (the request says *"None of
the 47 admissions capabilities covers it"* — the capability does not exist yet), `judged_threshold`
and `judged_measured_from` (the request itself lists *"the points level for a top prospect"* under
"Still to confirm with the manager"). `needed_by` is not stated. The GHL reads are not in
`dataset_registry`, so `read_datasets_not_catalogued` would refuse them. Converting it would mean
inventing the three numbers the request explicitly says nobody has agreed yet.

**It should not be deleted either, and the reason the delete was offered has gone.** It is not a
malformed tool request clogging the console: it is a correct CHANGE request, and one capability
needing three tools, which is exactly what `kind: 'change'` is for. It never appeared on the tool
console (that queue filters `kind === 'tool'`) and after this PR it stays in the change queue where
two buttons are the right answer. Deleting it would throw away the only piece of real builder work
in the pipeline and Taiwo Oludimimu's agreed UC-03 priority.

**Left open, for Ali.** Deletion is irreversible and the condition that justified it does not hold.

## Verification

- Backend `tsc --noEmit` clean, **verified with a planted control error** on the new file.
- Frontend `tsc --noEmit` clean.
- Backend CI gate (`jest -c jest.ci.config.ts`): **47,214 passing**. Three suites red, all three
  CRLF artifacts of this Windows worktree on files this branch never touches
  (`generateReeseToolInventory`, `generateReeseBehaviourInventory`, `mountLearnerPortalRoutes` —
  each asserts committed text byte-for-byte against an LF render). Confirmed with `file` and
  `git diff --name-only`.
- Frontend tests: **10,308 passing**. The four red suites are the same CRLF class plus `/testEnv/`,
  which the CI config excludes by design.
- Frontend **build** gate (the separate one, `CI=true react-scripts build`): passes.
- `node scripts/lint-route-auth.js`: 176 admin route files, all guarded.
- `node scripts/secret-scan.js`: 8,965 files, clean.
- Six suites failing at the start of the gate run were **mine** and are fixed: the `task_key`
  fixtures in `toolRequestContract` and `agentChangeRequestService`, the route counts in
  `agentChangeRequestRoutes.access`, the import boundary in `agentChangeRequestNoTrigger`, and the
  rule map and count in `toolRequestFormFields`.
- `agentChangeRequestNoTrigger`'s import scan was **tightened**, not loosened: it now ignores
  type-only imports, because `import type` compiles to nothing and cannot reach the service, so
  spending an allowlist slot on one would dilute a list whose value is that every entry was argued
  for.

**Not verified:** nothing in this PR has been exercised in a browser against production data. There
is one real request in the system and it is a change request, so the tool console's overview has
never rendered a populated queue outside tests.

## What is still Ali's

- **Merge and deploy.** Both his click.
- **Sending the AF8.4 instructions** to the seven builders, Victoria first.
- **Kalkidan's request**: leave it in the change queue, or delete it anyway.
