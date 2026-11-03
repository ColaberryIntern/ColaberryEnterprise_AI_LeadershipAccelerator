# DOC 08 — Test Plan, Failure Drills & Launch Runbook

| | |
|---|---|
| **Required by** | `docs/requirements/COLABERRY_LIVE_BASECAMP_BOOTSTRAP_v2.md` §3.1, consolidating its §15 |
| **Basecamp ticket** | L11.8 (this document) · L10.1–L10.7 (the work) |
| **Owner** | Ali Muwwakkil, with Piyush Prajapati on Test 4 |
| **Written** | 2026-11-03 |
| **Start here** | DOC 00 · the contract under test is DOC 02 |

> ## Do not jump from a dark feature flag to a public launch.

Six stages, in order. **The ladder is items 31–36 of the 48-point definition of done**, and
`docs/COLABERRY_LIVE_TRACEABILITY_MATRIX.md` carries each with its evidence and owner.

**Nothing on this ladder can be closed from the repository.** Every stage needs an event to have
happened — which is also why nine other board tickets move the moment one does. A session looking
for work should understand that before picking a test ticket up.

**The procedures live in `directives/`, not in this document.** This document is the plan, the
required evidence and the current state; the followable steps are:

| Directive | Covers |
|---|---|
| `directives/run-test-2-private-five-person-airing.md` | Test 2's run sheet: hard gates, the five roles, all ten checks with expected state |
| `directives/go-live-colaberry-live-broadcast.md` | Putting a broadcast on air: inputs, steps, outputs, verification, failure modes, safety constraints |
| `directives/rehearse-colaberry-live-airing-procedure.md` | A console-driven rehearsal of the operator procedure and the access decision. **It is not a ladder stage** — it carries its own table saying which stages it does and does not cover. It was once mislabeled "Test 3: Dress Rehearsal", which was wrong twice: Test 3 is the staff pilot and Test 4 is the dress rehearsal. |
| `docs/broadcast/ROLLOUT_RUNBOOK.md` | The operational levers and the flag ordering |

---

## Before any airing: the flag ordering

**This is the single most expensive thing to get wrong, and it has already cost one airing.**

`startBroadcastHealthLoop()` reads `BROADCAST_ENABLED` **once at boot** and returns `false` without
scheduling anything when it is off (`broadcastHealthLoop.ts:97`). The flag needs a container
recreate.

So turning it on **during** a class means: the health loop never schedules → nothing ever writes
`provider_health` → `go_live` refuses with `ProviderNotReady` for the whole show.

**That is what happened on 2026-10-20** and had to be hand-fed.

> **Enable the flag and restart before the airing. Never during one.** L5.3's criteria also require
> the flag back to `false` afterwards, so every airing begins and ends with it.

---

## Test 1 — provider smoke test

**Participants:** the minimum required technical staff.

**Prove:**

- Zoom produces RTMP;
- Cloudflare accepts it;
- HLS is created;
- signed playback works in Colaberry;
- **the grant renews**;
- seek and playback behavior are correct where applicable;
- the end state is correct.

**State: mostly passed.** Two airings exist in the Cloudflare account — a 13 October test and the
first private technical airing. **Grant *renewal over time* is not separately evidenced**, which is
the one check still outstanding and the one that matters most, because a 120-second TTL means a
40-minute class renews roughly twenty times.

---

## Test 2 — private five-person airing

**Prove, all ten:** viewer discovery · persistent player · **navigation does not restart the
video** · companion QR · poll · Prompt Drop · Builder pulse · reconnect behavior · end · replay
processing.

**State: an airing happened on 2026-10-20 and was never written up.**

That sentence replaced "Never run" on 2026-11-03, and the distinction is the most consequential one
on this ladder. L10.1's own body records preconditions verified on production on 18 October and
three fixes deployed, and **three tickets were raised from its findings** — L5.4, L5.5 and L7.4 each
cite *"FOUND BY TEST 2 (L10.1), 20 Oct 2026"*. The stage is not unexecuted.

**What does not exist is the write-up L10.1 asks for**: real bitrate, three viewers, the two
deferred defects.

**Whether that airing satisfies the ten checks is an open judgment only Ali can make, and six launch
tickets sit behind it.** Eight of the ten checks are built; Builder-pulse-to-viewers and reconnect
are partial (DOC 03, DOC 04).

**One caveat for reading its pulse data:** the check-in page's Build Mode was missing the
`Following` state until 2026-10-31, so following-rather-than-building is **under-reported in Build
Mode segments specifically** — not across the whole airing (DOC 04).

---

## Test 3 — internal staff pilot

**Participants: Piyush, Sohail and Aleem** — named, not "some staff".

**Evaluate:** content · UX · audio · video · lighting · camera · **graphics** · Prompt Drop timing ·
participation · **marketing CTA**.

**State: not run.** It needs R5's studio equipment and a Test 2 worth three people's time.

**Two of its ten evaluation criteria have nothing built to evaluate.** There is no broadcast graphics
layer of any kind (DOC 03 row 10) and the CTA is a projected slide with no field in `CompanionState`
(DOC 03 row 12). Scheduling this stage before those exist wastes three people's attention on two
criteria that can only come back "nothing to see".

---

## Test 4 — full dress rehearsal

**Use the actual studio and the actual live-class flow.** Include: cold open · Ali camera · slides ·
Claude / Claude Code · screen share · participant voice · prompt · poll · Builder Room · QR · CTA ·
end · replay.

**State: not run — and the only stage blocked by something no code can supply.** L10.3 waits on the
uninstalled studio (L6.2, L6.3) and on an operator manual for it that has not been written (L11.3,
DOC 13). **That is the longest dependency chain on the board.**

---

## Test 5 — failure drills

**Deliberately exercise all thirteen:**

| # | Failure mode | # | Failure mode |
|---|---|---|---|
| 1 | RTMP interruption | 8 | Phone reconnect |
| 2 | Reconnect | 9 | Replay-processing failure |
| 3 | Expired playback grant | 10 | Entitlement failure |
| 4 | Cloudflare failure | 11 | Invalid / private access |
| 5 | Zoom disruption | 12 | Unpublishing a replay |
| 6 | Viewer refresh | 13 | Provider API timeout |
| 7 | Route navigation | | |

**Confirm state is honest and no access fails open.**

**State: not run.** Several of the thirteen now have code and tests behind them — expired grant
renewal (L2.1), fail-closed entitlement (L3.3), provider timeout (the circuit breaker), and the
auto-end window with hysteresis (L7.4, which is why RTMP interruption is no longer an optional
check).

> **None of that discharges the stage.** L10.4's criterion is that every failure mode be
> **exercised**, not reasoned about. **A green suite is not evidence here.** This is the clearest
> case in the program of the difference between a test that proves code behaves and a drill that
> proves a system survives.

---

## Test 6 — production launch

**Do not mark this complete until there is proof of a real production airing.**

**State: not met.** It is **item 34 of the 48**.

The 2026-10-29 Open House was the intended first public airing and **did not stream.** The cause was
an unclosed R0 prerequisite rather than a missing feature: the host was signed in from something
other than the Zoom desktop client and had no way to start the stream. See DOC 02's Zoom
prerequisite — **ten minutes of Ali's time is what stands between the program and this stage's
first real attempt.**

---

## Launch checklist

Run in this order. Each line is a gate, not a suggestion.

1. **Flag on and container recreated** — before anything else, for the reason above.
2. **`HEAD` on the production box equals `origin/main`.** A dirty tree rebuilds stale code and
   reports success.
3. **No concurrent deploy running.** Two `compose up` invocations race and have produced Cloudflare
   521s and a shared-Postgres OOM cascade.
4. **Zoom custom RTMP confirmed on the teaching machine**, by the host, in the client they will use.
5. **Provider health green** — `go_live` will refuse with `ProviderNotReady` otherwise.
6. **`mark_content_started` issued** — `go_live` refuses with `ContentNotStarted` without it, because
   an unbounded preview window would otherwise give the class away.
7. **Access mode set deliberately**, and a private occurrence confirmed absent from ineligible
   discovery.
8. **The persistent QR tested from a phone** on the network that will be in the room.
9. **Studio validation complete** — DOC 05 step 12, including *Zoom mute does not mute OBS*.
10. **A named person watching the producer strip** who is not the presenter.
11. **After the show: flag back to `false`** (L5.3), replay processed, retention disposition chosen
    (DOC 07).

---

## Incident fallback

Design the failure path before the happy path. What to do when each thing goes wrong **during** a
class:

| Incident | Fallback |
|---|---|
| **Stream never starts** (`ProviderNotReady`) | The class still runs in Zoom. Teach it; do not spend the room's time debugging. Record locally in OBS — the MKV is the editor's master regardless, so the session is not lost. |
| **RTMP drops mid-class** | `live → reconnecting → live` preserves occurrence identity; reconnect is not a restart. The auto-end window has hysteresis so a brief drop does not end the show. |
| **Replay processing fails** | `processing → ended` is a legitimate transition meaning *aired, no replay*. **Do not dress it up as `replay_ready`.** The local OBS recording is the recovery path for the edit. |
| **Cloudflare unavailable** | No fallback that serves media. **Do not improvise an unsigned or public-unlisted URL** — that is how a paywall is given away permanently. Fail closed, tell the room, continue in Zoom. |
| **A viewer cannot get in** | Check entitlement before infrastructure. Paid status never unlocks a private cohort — that is correct behavior, not a bug. |
| **Clock disagreement** | The instructor's pace bar and the producer's rundown read from different starts (DOC 03). Trust `content_started_at`. |
| **"Cancel this airing" pressed by mistake** | **There is no recovery.** `cancelled` is terminal, the session cannot be given a second occurrence, and re-scheduling writes nothing and reports nothing. Create a new session. |

---

## Post-launch validation

**L10.6** — post-launch verification, metrics and retrospective. Required:

- the airing's real metrics, from the heartbeat path L4.9 wired (code shipped, never exercised);
- the replay published, with its retention disposition recorded (DOC 07);
- the clip markers exported and ranked for the editor;
- every ticket raised from the airing's findings, cited the way L5.4, L5.5 and L7.4 cite Test 2;
- the retrospective, written while the airing is fresh.

**L10.7 — prove the paywall — is the highest-consequence outstanding verification in the program.**
Entitlement has **never once been exercised** against a real paywalled airing. The fail-closed
guarantee is the most important claim in DOC 02 and the least production-proven thing in the system.

---

## Required evidence, per stage

Evidence has to be checkable by someone who was not there. "The test passed" is not evidence.

| Stage | Required evidence |
|---|---|
| **Test 1** | Cloudflare input and recording IDs; a signed playback URL that worked; **a renewal observed over time**, not just a first grant; the final editorial state |
| **Test 2** | Measured bitrate; viewer count with names; the ten checks each marked with what was seen; the two deferred defects; tickets raised with the `FOUND BY TEST 2` citation |
| **Test 3** | The three staff named and present; a score per evaluation criterion; explicit "nothing to evaluate" where that is the honest answer |
| **Test 4** | Studio photos; the operator manual followed as written, with every place it was wrong; the full flow cold open through replay |
| **Test 5** | **One record per failure mode, each saying how it was induced** — thirteen rows, no gaps, and a green test suite cited for none of them |
| **Test 6** | Proof of a real production airing: the occurrence ID, the recording, real viewers, the replay |
| **Post-launch** | Metrics, the replay URL, the retention decision, the clip export, the retrospective |

**And the standing rules from `CLAUDE.md` that apply to all seven rows:** name the artifact with a
path or URL; paste full URLs rather than bare ticket numbers; attach external configuration evidence
with secrets removed; and **never let a passing test stand in for a stage whose criterion is that
something be exercised.**

---

## Current state, in one table

| Stage | Ticket | State |
|---|---|---|
| Test 1 — provider smoke test | — | **Mostly passed**; grant renewal over time unevidenced |
| Test 2 — private five-person airing | **L10.1** | **Aired 2026-10-20, never written up.** Six launch tickets behind it. |
| Test 3 — internal staff pilot | **L10.2** | Not run; two criteria have nothing to evaluate |
| Test 4 — full dress rehearsal | **L10.3** | Not run; blocked on L6.2, L6.3, L11.3 — the longest chain on the board |
| Test 5 — failure drills | **L10.4** | Not run; four of thirteen have code, which discharges nothing |
| Test 6 — production launch | **L10.5** | **Not met.** Item 34. 2026-10-29 did not stream. |
| Post-launch verification | **L10.6** | Not started |
| **Prove the paywall** | **L10.7** | **Not done — and it is the one that matters most** |

**The write-up of the airing that already happened (L10.1) is the cheapest thing on this ladder and
unblocks the most.** It needs no airing, no studio and no hardware — only the record of what was
seen on 2026-10-20, and Ali's judgment on whether it cleared the ten checks.
