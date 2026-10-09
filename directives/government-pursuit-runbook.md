# Government Pursuit Runbook — discovery → qualify → build → submit

**Audience:** the gov-contracts team (hunters, writers, the DRI). **Owner:** Ali (DRI). **Status key:** ✅ live · ⏸️ built, held pending coordinator sign-off · 🔜 designed, not built.

This is the end-to-end process for taking a government opportunity from discovery to a submitted proposal, and banking the work either way. It mirrors the "AI Project Factory" model: one opportunity becomes a **Proposal** track (what they want) and a **Build** track (what we build), under one government delivery project.

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
1. **Gov Opportunities** → pick a promising row (fit is advisory, not a verified match).
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
