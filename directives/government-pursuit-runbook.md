# Government Pursuit Runbook — discovery → qualify → build → submit

**Audience:** the gov-contracts team (hunters, writers, the DRI). **Owner:** Ali (DRI). **Status key:** ✅ live · ⏸️ built, held pending coordinator sign-off · 🔜 designed, not built.

This is the end-to-end process for taking a government opportunity from discovery to a submitted proposal, and banking the work either way. It mirrors the "AI Project Factory" model: one opportunity becomes a **Proposal** track (what they want) and a **Build** track (what we build), under one government delivery project.

---

## The daily rhythm

One email goes out at 7:30 AM Central, to Ali and Ram (setting `gov_pursuit_notification_email`, comma-separated). It and the **Gov Opportunities** board come from the same code (`govDiscoveryBoard.ts`), so they list the same bids in the same stages. It opens with a note summarizing the report, then the current projects with interns, then the bids. No bid appears twice.

| When | Who | What happens |
|---|---|---|
| Overnight | Opportunity Pulse | Scrapes Bonfire and scores titles. The feed keeps bids closing 10+ days out, capped at 50. |
| 6:15 AM | Accelerator | Catch-up: retries unfinished AI checks and backfills up to 10 older ZIPs. |
| 7:30 AM | Accelerator | Hides fit under 60, off-target titles and AI passes, then sends the email. |
| A few minutes | **You** | **📦 Upload the ZIP** section: download each ZIP from Bonfire, upload it on the board. |
| After each upload | Accelerator | Extraction, capability fit, summary, buyer questions and a go/no-go run on their own and are saved. |
| Next morning | **You** | **⭐ Vetted** section: open it, read the proposal, confirm the real requirements, then approve, build and assign. |
| On assignment | Accelerator | The bid leaves the board and the email, and appears under **Interns > Gov Contracts**. |

**Stages:** Awaiting ZIP → AI analyzing → ⭐ AI vetted, or Needs your read → Approved → assigned. An AI pass is hidden at the next 7:30 run and listed under **Hidden** on the board, with Restore. A restored row is never hidden again.

**The rails:**
- ⭐ is the AI's recommendation, not an approval. Establishing requirements and second-admin approval stay with people, and the AI can't do either.
- An AI pass only hides a bid with no human progress. Established requirements, a requested approval or an approval all protect it.
- The AI only hides with evidence: a quote found in the solicitation, or under 25% capability coverage. Anything else is "Needs your read".
- A vetted or approved bid that leaves the feed stays listed from its saved details until its close date passes.
- If the Opportunity Pulse feed is down or comes back empty, the sweep does nothing: no hide and no email. A missing morning email means check the board.
- If saved data can't be read that morning, the sweep hides nothing and the email says the list may be incomplete.
- A failed send isn't retried, because a retry can send twice. That morning's hides aren't itemized in the next email, but they stay on the **Hidden** list.
- A bid with no fit score stays on the upload list, marked "Fit unknown". With the sweep off, low-fit and off-target bids stay listed too, since nothing would put them on **Hidden**.
- Risk narrative and build plan remain buttons: the risk score needs operator inputs, and the build plan belongs after approval.
- The AI is calibrated for a software firm (`govAiGoNoGo.ts`, 2026-11-05). It passes only for a wall at submission (a security authorization required to submit, a pass/fail minimum of past projects, a set-aside, local presence) or non-software work. Paperwork, post-award certifications, support and hosting aren't walls. When unsure, it leans pursue.
- The email reports how often the AI's call matched Ali's (`govAiAgreement.ts`): approve, RFI or assign counts as pursue, and no-bid or Ali's own hide counts as pass. Once there are 20 to 30 decided bids, feed them to the prompt as examples so it calls bids the way Ali would.

**If the email didn't arrive:** check the board first. The sweep sends nothing on a broken or empty feed. Then check the logs for `gov_opp_sweep_sent` or `gov_opp_sweep_send_failed`, and the setting `gov_opp_sweep_run_log` (`lastRun` is today once it ran). To send once more today, set that `lastRun` to another value. The next run then claims the slot and sends again, so don't do it twice.

**To undo:** one row, **Hidden → Restore** on the board. Many rows after a bad AI run, `node dist/scripts/restoreGovAiHides.js --since=YYYY-MM-DD` (a dry run until `--execute`). To stop new AI runs, `ENABLE_GOV_AI_VETTING=false`. To stop the email and all hides, `ENABLE_GOV_OPP_SWEEP=false`.

---

## The flow at a glance

| # | Step | What you do | Status |
|---|---|---|---|
| 1 | **Discover** | Browse **Gov Opportunities**; use fit/priority (advisory) + Details to triage. | ✅ live |
| 2 | **Qualify** | Click **Qualify** on a row → the ZIP workspace opens for that opportunity. | ✅ live |
| 3 | **Capture requirements** | **Open qualification** → upload the Bonfire ZIP → **Extract** → confirm the real ones → **Establish**. | ✅ live |
| 4 | **Assess fit & risk** | Read **What they want vs what we offer** (matcher) and **Gaps / potential disqualifiers** (eligibility/blocking). Decide: *Needs evidence* / *No bid*. | ✅ live |
| 5 | **Attest evidence & approve the pursuit** | Record the ZIP as evidence of record; when requirements are established, evidenced and cleared, **approve the bid pursuit** (approver ≠ reviewer). | ✅ live |
| 6 | **Spin up the two projects** | On approval, create the gov delivery project with its **Proposal** + **Build** tracks (established requirements flow into both). | ⏸️ built, ships dark — activates on `ENABLE_GOV_INGESTION` |
| 7 | **Authorize + run the build** | Authorize a bounded build, then run it to produce a working pilot/PoC **+ screenshots**. | ⏸️ held (builder activation) |
| 8 | **Submit** | Submit the proposal with the build screenshots as proof. | 🔜 not built |
| 9 | **Bank the capability** | Win or lose, add the built capability to **Our Services** → more matchable next time. | 🔜 not built |

---

## Step-by-step (what a person does)

### 1–4 (live today)
1. **Gov Opportunities** → pick a promising row (fit is advisory, not a verified match). A pursuit assigned to an active intern leaves this list and appears under **Interns > Gov Contracts** instead; unassigning the intern brings the row back. A bid closing within 10 days also leaves this list, because the source feed cuts it off, so find active pursuits in the left panel rather than here.
2. **Qualify →** opens the ZIP workspace. The **Discovery details** card shows why it surfaced, estimated value (unverified), the close date + days left, the preliminary overview, and an **Open source posting** link to Bonfire.
3. Download the solicitation ZIP from Bonfire, then **Open qualification** → upload it in **Extract requirements** → **Extract** → tick the real requirements, set applicability/due stage → **Establish selected**. They appear under **Requirements by due stage**.
4. Review **What they want vs what we offer** and **Gaps / potential disqualifiers**. The gaps panel is advisory — it surfaces eligibility gates (SAM registration, set-asides, clearances, certs, bonding…) and blocking items to **verify or resolve before bidding**; it is never a verified pass/fail. Record **Needs evidence** (keep working) or **No bid** (pass).

### 5 — Attest evidence & approve the pursuit (live)
- Record the uploaded ZIP as the **evidence of record** (a server-side hash; the bytes are never stored).
- Approval is **gated**, scoped to what a pursuit decision actually warrants (it authorizes **research**, not a submission): at least one applicable requirement established, the ZIP attested, the **approver ≠ reviewer**, and **no disqualifier** — nothing of unknown applicability, and no "not applicable" dismissed without evidence. An empty requirement set never passes.
- Applicable submission requirements that merely lack evidence are **open items**, not blockers: they are surfaced ("N still need evidence") and carried into the build, and the **full evidence bar is enforced at bid submission (step 8)**, not here. This split keeps the pursuit decision honest without demanding bid-ready evidence before any work is done.

### 6 — Two projects (built; ships dark)
- On approval, the system creates (idempotently) one **government delivery project** with a **Proposal** track (the customer's established requirements) and a **Build** track (our solution); the established requirements are written into the compliance matrix on both tracks (`evidence_state: unassessed` — nothing fabricated). *Coordinator-approved and built; ships behind `ENABLE_GOV_INGESTION` (default off) and activates when that flag is flipped on. Creating the project does NOT authorize a build — that stays the separate step-7 gate.*

### 7 — Authorize + run the build (held)
- Record a **bounded build authorization** (scope + resource limit), then run the build to produce the demo + screenshots. *The autonomous builder stays parked; it runs only on an explicit, separate go.*

### 8–9 — Submit & bank (future)
- The **full evidence bar is enforced here**: every applicable submission requirement must be evidenced (the `canApproveBid` bar) before a bid can be submitted — the open items from the pursuit stage are closed out now.
- Attach the build screenshots to the proposal and submit. Win or lose, the built capability is added to **Our Services**.

---

## Daily tracking & Bonfire sync

Once a ZIP has been uploaded and we've **decided to bid**, the opportunity moves into **active tracking**:
- **Daily discovery-feed sync** — ✅ built (narrow v1), ships dark behind `ENABLE_GOV_DAILY_SYNC`. A daily job re-checks the **live v1 discovery feed** for pursued opportunities and flags a **changed close date** or a **drop from the feed**, refreshing the countdown baseline; the workspace surfaces "last checked" + any flagged change. It **never auto-advances a decision** — it prompts a human re-review.
- **Change alerts** — ✅ the workspace surfaces the sync's flag (deadline moved / dropped from feed), alongside the existing canonical "source changed → renewed review" gate.
- **Honest limits (NOT built — blocked on integrations):** **amendments, Q&A, addenda** need the **undeployed OP v2 feed** (there is no programmatic Bonfire access — the ZIP is downloaded by hand); **pre-bid / Q&A meeting dates** are not modeled in any feed (they live only in the manually downloaded ZIP). These arrive only when OP v2 is deployed and/or a Bonfire capability exists.
- **Countdown** — ✅ a live **Submission deadline** countdown is on the workspace (days to close, with the close date). Honest about precision: the discovery feed is date-only, so the exact cutoff *time* is still pending a richer feed.

---

## Governance (why some steps are off)

Steps 6–7 and the daily Bonfire sync touch capabilities the coordinator explicitly **held**: ingestion, pursuit/build authorization, and builder activation. They are **designed and ready**; they switch on only with the coordinator's sign-off, and the autonomous builder runs only on a separate, explicit go. Nothing in this flow fabricates evidence, marks anything "verified" that isn't, or weakens a gate — advisory views are labeled advisory, and approval stays a deliberate, evidenced, separation-of-duties decision.
