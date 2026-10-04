# Operate the Growth Journey OS

**Status: the system is DARK.** Every flag defaults off, all three crons ship disabled,
and nothing has ever contacted a person through this path. This directive is how it is
read, switched on one notch at a time, and switched off again.

Reading state: `directives/read-growth-journey-state.md`. Reason codes:
`docs/GROWTH_JOURNEY_REASON_CODES.md`. The workspace for non-engineers:
`docs/GROWTH_JOURNEY_TRAINING_GUIDE.md`.

---

## 1. Purpose

The Growth Journey OS decides what should happen next for one person in one brand's
journey, records that decision, and — only when an operator has explicitly enabled it —
executes it. This directive is for the people who hold those switches.

Two facts shape everything below.

**`GROWTH_JOURNEY_EXECUTION_ENABLED` is the only flag that can cause a person to be
contacted.** Every other switch makes the system read, classify, decide and queue. That
one makes it act. It is off, and turning it on is the DRI's decision, not a step here.

**An absence is never a zero.** `0%` means every handoff was refused; an absent rate
means none was created. The whole surface keeps those apart — so when you read a number
here, read the reason beside it.

---

## 2. Inputs

| Input | Where |
|---|---|
| Six journey switches | backend environment, parsed once in `backend/src/config/env.ts` |
| Ten Explorer switches — one master + nine features, two of the nine consulted by the ladder | `backend/src/config/explorerGrowthFlags.ts` |
| Global kill switch | one `system_settings` row, key `system_kill_switch` |
| Scoped pauses and rollouts | `growth_journey_execution_controls`, written only through §5 |
| Agent on/off | `ai_agents` registry rows, toggled in Admin → Agents |
| Queue capacity and assignees | 24 queue policy rows, seeded inert at boot |
| Holdout experiment policy | a `holdout_experiment` row per brand; **none exists today** |
| Admin access | an admin token **plus** a `tenant_memberships` row — see §8 |

**Required before any operator move:** the backend is up (§12), you hold an admin token,
and `tenant_memberships` covers the brand you intend to touch. Without that row the
journey reads refuse (§8) — the most common reason this workspace looks broken when it is
not.

---

## 3. The switches

All six default **off**. Only the exact string `'true'` enables one — `'TRUE'` and `'1'`
are off. The resolved set is frozen at boot, so a change needs a restart.

| Switch | Env var | What it allows |
|---|---|---|
| master | `GROWTH_JOURNEY_ENABLED` | Off ⇒ every capability is off regardless of its own flag, and every journey route 404s except `/status/*` |
| signal ingest | `GROWTH_JOURNEY_SIGNAL_INGEST_ENABLED` | Write journey signals for non-Explorer subjects. Safe to enable first |
| classification | `GROWTH_JOURNEY_CLASSIFICATION_ENABLED` | Source / brand / intent / path classification. Reads and records; acts on nothing |
| decisions | `GROWTH_JOURNEY_DECISIONS_ENABLED` | Governed shadow decision. Decides and records; contacts nobody |
| handoffs | `GROWTH_JOURNEY_HANDOFFS_ENABLED` | Materialise a handoff row and a ticket. A row in a queue — **not** a notification, **not** a contact |
| execution | `GROWTH_JOURNEY_EXECUTION_ENABLED` | **The only flag that can cause a person to be contacted.** Off until specifically approved |

Read them through `resolveGrowthJourneyFlags()` / `isGrowthJourneyCapabilityEnabled()`
only; never a sub-flag directly. A guard test enforces this.

**The registry's `flags` block says what an operator SET, not what may run.** The master
ANDs into every capability, so `decisions: true` with `master: false` means decisions are
off. For what will actually happen, use the probe, which reports *effective* flags.

Two Explorer switches feed the ladder: `EXPLORER_IN_APP_NUDGE_ENABLED` for `in_app` and
`EXPLORER_ALI_OUTREACH_ENABLED` for `ali_outreach`. A channel can be fully enabled on the
journey side and still sit in shadow because its Explorer flag is off — the reason reads
`explorer_flag_off:<flag>`.

---

## 4. The execution ladder

For every brand × programme × channel the system resolves one mode and one reason. The
planner asks this and so does the probe, so the probe is what the next run will do rather
than an estimate. Modes, least to most active: `off` → `observe` → `shadow` → `review` →
`limited`. First stop wins:

| # | Stop | Mode | Reason |
|---|---|---|---|
| 1 | master flag off | `off` | `flag_master_off` |
| 2 | execution flag off | `shadow` | `flag_execution_off` |
| 2 | decisions flag off | `observe` | `flag_decisions_off` |
| 3 | Explorer flag off for the channel | `shadow` | `explorer_flag_off:<flag>` |
| 4 | channel not executable (`sms`, `voice`) | `off` | `channel_not_authorized` |
| 5 | global kill switch on | `off` | `kill_switch` |
| 5 | kill switch unreadable | `off` | `kill_switch_unreadable` |
| 6 | a pause covers this scope | `off` | `pause:<dims>`, e.g. `pause:brand+channel` |
| 7 | no rollout for this scope | `shadow` | `no_rollout` |
| 7 | channel is review-only (`ali_outreach`) | `review` | `review_only_channel` on a `limited` rollout, else `rollout` |
| 7 | rollout present | `review` / `limited` | `rollout` |
| 7 | subject not in the cohort | `shadow` | `not_in_cohort` |
| 7 | the day's limit is spent | `review` | `daily_limit_reached` |

**The kill switch fails CLOSED here and open almost everywhere else.** This resolver
treats an unreadable switch as ON; the lenient reader behind the send gate treats it as
off. Deliberate — guessing "not killed" is the wrong way to be wrong in the one place
that starts work.

A non-clean stop also produces a **hold**, which reaches work already in flight. A
cleared rollout, a changed cohort and a spent daily limit deliberately do **not** hold;
they stop new work only.

---

## 5. Steps — the operator moves

Every move is a `POST` under `/api/admin/growth-journey`, needs an admin token, and is
rate-limited to **120 requests per minute per caller**. Every schema is `.strict()`: an
unexpected key is a 400, not a silently ignored field.

With the master flag off these all return **404**, meaning "switched off or not yours" —
never "that id does not exist". Indistinguishable on purpose, so an id cannot be probed.

### 5.1 Pause — stop one scope

`POST .../execution/pauses` with
`{ "brand_id": "<uuid>", "channel": "email", "reason": "why, 1-500 chars" }`.

A pause may name a brand, programme, channel, subject or any combination, but **must name
at least one**. An all-wildcard pause is refused twice — by the schema and again in the
service layer: *"a pause with no scope would be a second global kill switch; use the
system kill switch instead."* A pause with no brand must name the tenant and requires
platform super-admin.

`channel` ∈ `email`, `in_app`, `ali_outreach`. `subject_ref` is `lead:<id>` or
`enrollment:<id>`.

A pause **reaches work already in flight** — the right lever when something is going out
that should not be.

Clear with `POST .../execution/pauses/:id/clear` and body `{}` — a clear carries nothing,
a second returns `200 already_cleared` and writes nothing, and rows are cleared rather
than deleted, so who paused what survives.

### 5.2 Rollout — widen one scope

`POST .../execution/rollouts` with `{ "brand_id": "<uuid>", "program_id": "<uuid>",
"channel": "email", "mode": "review", "reason": "why" }`.

`brand_id` and `program_id` are **required** — no dimension may be wildcarded — and any
rollout requires platform super-admin.

- `mode: "review"` carries neither a cohort nor a daily limit.
- `mode: "limited"` requires **both** `cohort_lead_ids` (1–50 ids, de-duplicated, each
  must resolve) and `daily_limit` (1–25).

**`ali_outreach` is not a rollout channel.** Ali's own outreach is review-only by
construction: pausable from this surface, not startable from it.

Clearing a rollout drops the scope back to **shadow** on the next executor run. It does
**not** cancel work already enrolled — use a pause for that.

A second active control for one scope is a **409** from a database index, not a
read-then-write, so two operators racing cannot both win.

### 5.3 Handoff — accept, disposition, release

A handoff is a row in a human queue. Creating one notifies nobody.

| Move | Call | From states |
|---|---|---|
| Accept | `POST .../handoffs/:id/accept` (empty body) | `queued`, `assigned` |
| Disposition | `POST .../handoffs/:id/disposition` | `accepted` only |
| Release | `POST .../handoffs/:id/release` | `assigned`, `accepted` |

Disposition takes `disposition` ∈ `qualified`, `not_ready`, `nurture`, `no_contact`,
`disqualified`, `converted`; a `reason` of **at least 8 characters**; optional
`cooldown_days` (1–90). `not_ready` and `nurture` return the subject to the AI with a
14-day cooldown by default; `qualified` holds it 30. An illegal transition is a named
**409**, not a silent no-op.

### 5.4 Classification override

`POST .../classifications/:id/override` with
`{ "lock": true, "reason": "at least 8 characters", "primary_path": "..." }`.

`lock` is required — you must say whether your override pins the classification against
re-classification. This is the only override on the surface.

---

## 6. Reading the system

Four read-only ways to see what this system is doing, all safe against production. Each is
a section of **`directives/read-growth-journey-state.md`**, which also says why picking
the wrong one is how a dark system reads as broken:

| Read | Answers | Section |
|---|---|---|
| The probe | what the next run will actually do, per scope | §1 — run this first |
| Readiness | what is left before it can be switched on | §2 |
| Health | what happened in a window, as counts and reasons | §3 |
| Liveness | whether the process and database are up — `GET /health`, **never `/api/health`** | §4 |

## 7. The setup script

```sh
node dist/scripts/growthJourneyExecutionSetup.js register-campaigns
node dist/scripts/growthJourneyExecutionSetup.js create-flow-drafts
```

Dry run by default. A write needs `--confirm-production` **and** `--expect-count N`
matching the plan's write count exactly; any refusal in the plan aborts the run with exit
2. It refuses a production-looking `DATABASE_URL` without the flag. Nothing here activates
a campaign, approves one, or touches a sequence's `is_active`.

---

## 8. The membership seed, and the LOCK-OUT rule

```sh
node dist/scripts/seedTenantMemberships.js --roster roster.json --dry-run
node dist/scripts/seedTenantMemberships.js --roster roster.json \
  --confirm-production --acknowledge-lockout <N>
```

**The first membership row written closes the migration ramp for everybody at once.**
Before it, legacy admin screens fall back to cross-tenant reads and log it; after it, an
admin with no row is denied. No flag to remember, no way to linger in the permissive
state.

So it prints how many admins will hold **no** membership after the write and refuses
`--confirm-production` unless `--acknowledge-lockout` names that exact number; a stale
number from an older roster does not count. It also refuses when a platform super-admin's
admin row is linked to a different identity, because that write would grant them nothing
and close the ramp with the operator behind it. Super-admins go first, and emails are
counted, never printed.

### The part the script's own header does not tell you

Its header says that while `tenant_memberships` is empty "every admin reads every
tenant". **That is true of the legacy screens and NOT of the journey reads.**

The ramp lives in `adminTenantScope` / `intelligenceScopeForAdmin`
(`backend/src/modules/tenancy/adminScopeBridge.ts`). The journey reads do not use it —
`growthJourneyController.scopedContext` calls `contextFromAdminRequest` directly, and
`buildRequestContext` (`modules/tenancy/tenantAuthorization.ts:128-131`) will not grant a
brand without a resolved tenant. With the table empty there is none, so **naming a
`brand_id` is a hard 403.** The readiness item states the operative rule:
*"no tenant memberships exist, so every brand-scoped journey read returns nothing for
every admin."*

**Operator consequence:** select a brand in the workspace before memberships are seeded
and every tab fails. It is not broken, it is fail-closed. Seed memberships first.

Two comments in this codebase assert opposite consequences of the same empty table. If
you are reading one of them, this section is the reconciliation.

---

## 9. The digest

All three schedules, since "when does it next run?" should be answerable here (all UTC,
all shipping `enabled: false`): `GrowthJourneyShadowDecisions` `20 4 * * *`;
`GrowthJourneyExecutor` `*/15 14-22 * * 1-5`; `GrowthJourneyHandoffDigest`
`30 12 * * 1-5`.

The digest mails **staff only** about open handoffs assigned to them, and carries no lead
name, address or message body.

Gates in order: a disabled registry row is a logged skip; then the master and handoffs
flags; then "nothing open ⇒ no mail"; then a once-per-mailbox-per-Central-date slot claim;
then the guarded sender, which re-checks the kill switch. Per-assignee skips are named:
`no_admin_row`, `ai_operated`, `already_sent`, `failed`. It lives outside
`services/growthJourney/` because a scanner forbids importing the mail service there.

---

## 10. The kill switch

One `system_settings` row, key `system_kill_switch`. **There is exactly one global switch,
by design** — a second is "two switches that can disagree silently".

Activating it sets the row `true`, pauses every `active` campaign, disables every
`ai_agents` row in the outbound categories (covering the executor and the digest), blocks
every send at the safety gate's **step 0** before campaign, lead, consent, brand or
recipient are read, and logs a `CRITICAL_SYSTEM_EVENT`.

What it does **not** do — each of these has caught someone:

- **It does not disable `GrowthJourneyShadowDecisions`**, which is category `behavioral`,
  not `outbound`. Nightly decisions keep being recorded. They contact nobody, so this is
  intended — but do not read a quiet kill switch as a stopped system.
- **Deactivating it re-enables nothing.** Campaigns stay paused and agents stay disabled
  until someone turns them back on by hand.
- **It does not scope.** There is no per-brand or per-channel kill switch; pauses are that.
- **It does not by itself cancel work in flight.** The journey's hold does that.
- **An absent row reads as off in both readers**, so off and never-set are
  indistinguishable until the row exists. It is seeded at boot, and a present row — on or
  off — is never overwritten.

---

## 11. Outputs

- `growth_journey_execution_controls` rows, cleared and never deleted.
- Handoff state changes, and `tickets` rows.
- Execution receipts, each transition writing one `event_ledger` row
  `growth_journey.execution.<status>`.
- One `growth_journey.execution.refused` row per planner refusal, carrying the reason
  code — ids and codes only; the operator's free-text reason stays on the control row and
  never enters a ledger payload.
- `growth_journey.execution.control_set` / `.control_cleared` for operator moves.
- Staff digest mail (§9).

No ledger payload, API response, receipt or log line carries an email address. Values
that might are passed through helpers returning `'unknown'` for empty and `'redacted'`
for anything containing `@`, with a flag saying which. **`'unknown'` is a machine
placeholder, not something a person typed.**

---

## 12. Verification

In order. Each has an observable signal, not an impression.

1. **Backend up:** `docker exec accelerator-backend node -e "fetch('http://localhost:3001/health').then(r=>console.log('health',r.status))"` → `health 200`. Allow 60–90 s after a deploy; a 502 inside that window is timing. **Not `/api/health`** — see `read-growth-journey-state.md` §4.
2. **Mounted and dark:** `GET /status/registry` with an admin token → 200 with
   `flags.master === false`, while `GET /participations` with the same token → 404. That
   *pair* is the evidence — it proves the status router sits above the gate, which a 200
   alone does not.
3. **Unauthenticated:** `GET /status/registry` with no token → 401.
4. **No address anywhere:** search any journey response for `@` → no hit.
5. **The three reads agree it is dark:** readiness `next_move` names the first blocked
   item; the probe reports `flag_master_off` for every scope; health shows `crons[]` all
   `disabled`, `receipts[]` empty and `truncated` empty.
6. **Kill-switch row exists:** readiness item `kill_switch_row` is `true`. If `false`,
   off and never-set are indistinguishable.

---

## 13. Troubleshooting by reason string

Almost everything this system declines to do, it declines **by name**. The full index,
grouped by symptom, is `docs/GROWTH_JOURNEY_REASON_CODES.md`. The five you will meet most
often:

| Reason | Meaning | Move |
|---|---|---|
| `flag_master_off` | the master switch is off | set `GROWTH_JOURNEY_ENABLED=true`, restart |
| `kill_switch` | the global switch is on | deactivate, then re-enable campaigns and agents **by hand** |
| `pause:<dims>` | a scoped pause covers this | find it in the controls list and clear it |
| `no_rollout` | no rollout for this scope | create one (§5.2) |
| `no_denominator` | nothing to divide by — an absence, **not** a zero | nothing to fix |

A composed reason is **cut, never rejected** — several columns cap at 64 characters, so a
long one arrives truncated. For `'unknown'` and `'redacted'`, see §11.

---

## 14. Edge cases and failure modes

- **A `null` is never a `0`.** One rendered as the other is a bug worth stopping for.
- **A truncated read is a floor** — its counts *and* its ages understate.
- **A 404 here is ambiguous by design** (off, not yours, or absent). Check
  `status/registry`, which is never gated, before concluding a route is missing.
- **A 403 on a brand-scoped read usually means no membership row** (§8).
- **An interrupted `CREATE INDEX CONCURRENTLY` leaves an invalid index** that
  `IF NOT EXISTS` then skips forever — **and nothing in this system catches it.** The
  `ledger_indexes` readiness item queries `SELECT indexname FROM pg_indexes` and checks
  only that the three *names* appear; an invalid index appears there like any other.
  `ensureMultiTenantSchema.ts:393` says a check should read `pg_index.indisvalid` for
  these three, but **no such check is implemented anywhere in the repo.** So a green
  `ledger_indexes` does not rule out this hazard, and no other gate will: query
  `pg_index.indisvalid` yourself before trusting it.
- **Unknown capacity does not block** — only `full` suppresses assignment.
- **A future timestamp reads as `stale`, not `fresh`.**
- **The nightly decisions cron keeps running under the kill switch** (§10).

---

## 15. Rollback

Reach for the smallest lever that covers the blast radius.

| # | Lever | Scope | Reaches work in flight? |
|---|---|---|---|
| 1 | A scoped **pause** | one brand / programme / channel / subject | **Yes** |
| 2 | **Clear a rollout** | one scope, back to shadow | No |
| 3 | A **holdout policy** row set `paused` | arm assignment for that brand | n/a |
| 4 | A **queue policy** row paused or re-capped | one queue's assignment | n/a |
| 5 | **Agent registry toggle** (Admin → Agents) | one cron | No — future runs |
| 6 | **`GROWTH_JOURNEY_EXECUTION_ENABLED=false`** + restart | all execution | No |
| 7 | **`GROWTH_JOURNEY_ENABLED=false`** + restart | everything; all routes 404 | No |
| 8 | **The global kill switch** | every send system-wide | Yes, at the send gate |

Turning a cron on or off is the registry toggle plus the flags — **never a redeploy.**

**Reverting the code is the last resort.** Revert the PR and redeploy from the registry.
The schema needs no rollback: every DDL statement in this phase is additive,
`IF NOT EXISTS` and free of `DROP`; the two new decision columns are nullable and inert;
the three ledger indexes additive; and a control row is cleared rather than deleted, so
operator history survives. Deploy only through the documented script, never two at once.

---

## 16. Safety constraints

- **Nothing in this directive sends anything** except the staff digest in §9.
- `GROWTH_JOURNEY_EXECUTION_ENABLED` is the DRI's switch; do not enable it here.
- **SMS and voice are refused by name**, not merely unimplemented — they exist in the
  channel vocabulary so they can be rejected as `channel_not_authorized`, and neither
  operator schema accepts them.
- `ali_outreach` can be **paused** here and cannot be **started** here.
- Every write is `.strict()`, idempotent and bounded (§5 has the numbers). A pause with
  no brand, and every rollout, require platform super-admin.
- **No email address may appear** in a ledger payload, API response, receipt, packet or
  log line.
- The all-wildcard pause is refused in two independent places. **Do not add a third global
  switch** — if you want one, you want the kill switch.
- Never seed memberships without the lock-out acknowledgement matching the live count.

---

## Related

- `directives/rotate-jwt-secret.md` — token rotation, and the same `/health` rule.
- `docs/sessions/CC-20260812-k4m9.md` — the build record for every phase of this system.
