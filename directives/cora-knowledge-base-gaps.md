# Cora Knowledge Base — Content Gaps & Ali Inputs Required

**Status:** Cora migration code-complete (2026-06-16). Ali inputs partially applied 2026-06-16 (CC-20260616-k4m9). Payment-schedule decisions applied 2026-08-03 (CC-20260803-q7v2).
**Owner:** Ali Muwwakkil
**Raised by:** Kes (CC-20260616-c0r4)

**⚠️ Architecture note (2026-08-03):** this file predates two later changes and some of its detail below is historical, not current. (1) Cora's system prompt is now built from the DB-backed `cora_kb_entries` table (KB Ops, BC #10036783688), not the static `coraKnowledgeBase.ts` this file was originally written against — that file, its `coraKnowledgeBaseQA.ts` companion, and the Google Sheet sync script that fed it (`syncCoraKbFromSheets.ts`) were all confirmed dead code (zero live callers) and deleted 2026-08-03. (2) Cora and Cory are now split personas (BC #10109319420) — Cora handles support@, Cory handles admissions/sales content. See "Files updated when inputs arrive" below for the current file list.

**Remaining blockers before go-live:** the Gmail send token (see "Gmail send token" below — the env var is misnamed, not missing), and the **dispatch-routing gap** for out-of-scope email (see "Scope decision" below). Keep `CORA_DRY_RUN=true` until these are resolved. #2 and #4 are resolved.

---

## Scope decision (2026-06-17, Ali) — Accelerator-only + smart routing

Cora's inbox (support@colaberry.com) receives mostly **legacy bootcamp** email (Data Analytics Bootcamp, IPBC/Job Readiness, Data Science internships, existing-student billing, course tech support, employment verification, tax), but the new KB is **Accelerator-only**. Decision: Cora answers ONLY Accelerator questions; for legacy topics it never quotes a price/date it doesn't have and gives the safe handoff/redirect (admissions follow-up; verification → everify@colaberry.com; tax → no 1098 + receipt in account, EIN 45-4223538 on request). **Go-live is gated on this.**

- **Done (PR #25):** scope guard in the system prompt + escalation triggers; shadow cases 8–10 verify Cora does NOT quote the Accelerator price to a bootcamp student.
- **Source rubric:** legacy Cora operating sheet (Google Sheet `1C69lDig4CoCnqqlAe_8_75eEg8PiPOaBAgjUWp9Yz_A`). Ali: "use it as a source… figure out how we deal with it." Routing owners kept: Taiwo (IPBC/billing), Shveta (DA admissions), everify@ (verification). All old prices/dates intentionally NOT carried over.
- **⚠️ Open — dispatch-routing gap (coordinate with Kes / PR #24):** rule 0c sends ALL support@ mail to Cora's AUTOMATION path, which replies + archives. For out-of-scope mail where Cora says "the team will follow up," that promise is hollow if the archived email is never surfaced to a human. Proper fix: classify → out-of-scope mail goes to a human-review state instead of send-and-archive. This belongs to the #24 inbox pipeline.

## Gmail send token (2026-06-17 finding)

`GMAIL_COLABERRY_REFRESH_TOKEN` (what `coraAgentService` + `replyDraftService` require) is **not set in prod**. The closest existing var, `GMAIL_REFRESH_TOKEN`, resolves to **ali@colaberry.com** with `gmail.modify` scope (**can send**) and is what `inboxSyncService` already uses. **Done (PR #25):** `sendCoraReplyViaGmail` now falls back to `GMAIL_REFRESH_TOKEN` when the `GMAIL_COLABERRY_*` vars are absent.

**⚠️ Send-as finding (2026-06-17, verified via Gmail API):** the only authorized send-as identity on that mailbox is **ali@colaberry.com**. **support@colaberry.com is NOT a verified send-as alias** — support@ mail just forwards into ali@'s inbox. So as-is, Cora will send replies **as ali@colaberry.com**, not support@. To send as support@, add it as a verified "send-as" alias in that Gmail account (Settings → Accounts → "Send mail as"), or accept ali@ as the sender. Decision for Ali.

---

## Priority 1 — Blockers (Cora cannot go live without these)

### 1. Next Cohort Date(s) — ✅ RESOLVED 2026-06-16
**Decision (Ali):** Next cohort starts **7/23**. Source of truth is the `Cohort` model on enterprise.colaberry.ai, managed at `/admin/accelerator`; these cohorts are linked to the training.colaberry.com classes.
**How it was implemented:** Cora no longer hardcodes a date. `coraAgentService.getNextCohortForCora()` reads the earliest open cohort via `cohortService.listOpenCohorts()` at send time and injects a "Current cohort schedule" section into the system prompt (`buildCoraSystemPrompt(nextCohort)`). If no open cohort is in the DB, Cora directs the sender to the enrollment page rather than guessing.
**Action still required (DATA, not code):** ensure a cohort row with `start_date = 2026-07-23`, `status = 'open'` exists in the **prod** DB via `/admin/accelerator` (the seed currently lists an Aug 2026 cohort). Until that row is the earliest open cohort, Cora will surface whatever the current earliest open cohort is.

---

### 2. Refund and Cancellation Policy — ✅ RESOLVED 2026-08-03 (the $50 seat-deposit piece; general subscription refund/cancellation terms were separately already live)
**Gap (original):** Cora replied "contact us for our current terms" — a placeholder. The $50 Open House seat-deposit refund/no-show behavior specifically was undocumented anywhere in the KB.
**Decision (Ali, 2026-08-03, on the payment-schedule ticket):** If a student reserved a seat with the $50 deposit and did not attend their live class, the $50 is fully refundable, or they can apply it as a credit toward the cohort of their choice. If a reserved seat's start date passes without the student completing enrollment, the reservation lapses automatically and the $50 becomes a credit on the account rather than a charge — no manual follow-up required to prevent a stray charge.
**Also decided (same ticket):** access to curriculum (the Classroom tab) never starts before the cohort start date, regardless of when the deposit or first payment was made; the first subscription charge lands on the cohort start date, and each following charge lands on that same date each following month.
**Implemented in:** `backend/src/seeds/seedKbData.ts` (two new `cora_kb_entries` rows: "How does the $50 seat deposit work..." and "Can I get my seat deposit back..."), `frontend/public/knowledge/sales/kb-data.js` (two new sales-KB Q&A entries, `refunds-guarantee`/`pricing-billing` categories), `frontend/public/knowledge/data/compliance-kb.js`, `frontend/public/knowledge/sales/app.js` (Cory chatbot fallback), `backend/src/controllers/salesHubCoryController.ts` (Cory's RAG-grounding `PINNED_FACTS`).
**Separately found, not part of this decision:** the general monthly/annual subscription refund policy (monthly cancels anytime no partial refund; annual has a 14-day money-back window from kickoff, then non-refundable but stays active/locked) was already live and marked approved in `frontend/public/knowledge/sales/kb-data.js` as of 2026-07-20 — this predates and is independent of today's deposit decision. Several other files (`README.md`, `app.js`, `compliance-kb.js`, `salesHubCoryController.ts`) still carried stale "drafted, pending approval" language for that *general* policy; brought into consistency with `kb-data.js` today since it was directly adjacent to this ticket's edits. If that general policy is in fact still unapproved, flag it back — it was not re-confirmed by Ali on this ticket, only found already marked "grounded"/"Approved policy" in the live source.
**BC todo [10003806235](https://app.basecamp.com/3945211/buckets/47502609/todos/10003806235)** (Taiwo, general refund/cancellation policy) — check whether this is now satisfied by the above or still tracks something distinct.

**⚠️ UPDATE 2026-08-06 — the $50 deposit itself is now RETIRED, not just its refund policy.** Decision (Ali, relayed via Dhee, 2026-08-04, [BC #10164663348](https://app.basecamp.com/3945211/buckets/47502609/todos/10164663348)): the $50 Open House seat-deposit option is permanently removed. Reserving a spot now means paying the standard membership plan price directly — no separate discounted deposit. The access-timing rule above (curriculum never starts before cohort start date) still applies and now also gates actual code, not just KB copy — see [BC #10160497402](https://app.basecamp.com/3945211/buckets/47502609/todos/10160497402) and `hasCohortStarted()` in `backend/src/services/cohortService.ts`. The refund/no-show terms decided above still apply, but only to deposits paid *before* this retirement — new deposits cannot be created. Updated in the same files listed above, plus `backend/src/services/admissionsKnowledgeSeed.ts`, all three `docs/synthflow-*-prompt.md` files, and `directives/run-open-house-live-experience.md`'s "Claim slide" step was deliberately left as-is (flagged to Ali on the ticket instead) since no Open House is currently scheduled.

---

### 3. Payment Plans / Installment Options — ✅ RESOLVED 2026-06-16; $4,500 pay-in-full option retired 2026-08-03
**Decision (Ali, 2026-06-16):** Enrollment is **subscription-first** via enterprise.colaberry.ai: **$149/month on the annual plan**, or **$199/month month-to-month**.
**Decision (Ali, 2026-08-03):** the **$4,500 pay-in-full option is retired — remove it from everything** (KB, rubrics, prompts). It belonged to the old "Executive AI Build Accelerator" / "Enterprise AI Leadership Accelerator" program identity, which is itself retired (see architecture note at the top of this file — its static KB files were dead code and deleted; its Maya-facing admissions KB, `admissionsKnowledgeSeed.ts`, is still live and scheduled for retirement in the follow-up voice-agent-prompts pass). The live subscription pricing (`seedKbData.ts`, the sales KB) never carried the $4,500 option, so no code change was needed there beyond the file deletions above.

---

### 4. Advisory Services Pricing — ✅ RESOLVED (default: direct to strategy call)
**Gap:** The Advisory page describes 5 services with formats and ideal timing, but zero pricing.
**Resolution:** No advisory prices were provided, so Cora keeps the safe default — it can describe the services but, for any advisory pricing question, it directs the sender to book a strategy call ("pricing is scoped per engagement"). Cora never quotes an advisory number. If Ali later wants Cora to give ranges, provide them and reopen this item.
**Services (for reference):** AI Roadmap Workshops (2-day), Enterprise AI Architecture Design (4–8 wk), AI Agent Implementation (8–16 wk), AI Governance Advisory (3–6 wk), AI Talent Deployment (ongoing).

---

## Priority 2 — Scope Decisions — ✅ RESOLVED 2026-06-16 (keep out of Cora)

**Decision (Ali):** Leave all P2 offerings (pilots, vertical landing pages, in-person markets, alumni/champion, agency/partner) in the codebase as-is, but **keep them out of Cora's knowledge** until Ali decides what to do with each. Cora does not proactively mention any of them. The escalation triggers already route partnership/reseller proposals to a human.

**Implemented:** removed the only P2 claim that was actually in Cora's mouth — the "in-person available in select markets" wording in `CORA_PROGRAM.format` and in the format/remote Q&A. Cora now describes the program as live virtual only. Pilots, verticals, alumni, and partner programs were never in the KB, so nothing else to remove.

- **5. Pilot Programs** — out of Cora. If asked, Cora answers about the standard program / escalates.
- **6. Vertical-Specific Landing Pages** — out of Cora. Treated as positioning for the same program.
- **7. In-Person Markets** — removed from Cora; program presented as live virtual.
- **8. Alumni / Champion Program** — out of Cora's proactive answers.
- **9. Agency / Partner Program** — out of Cora; reseller/partnership inquiries escalate to a human.

*(Reopen any of these by giving Cora the specific facts to state.)*

---

## Priority 3 — Enrichment (improves response quality, not blockers)

### 10. Named Testimonials or Case Studies — ⏳ IN PROGRESS
**Status (Ali, 2026-06-16):** A dedicated Case Study page is being created. Until it ships, Cora references the existing anonymized testimonial and points to the case studies page rather than quoting named examples. When the page is live, add 1–2 case study summaries to the KB and link the page.

---

### 11. Government / Federal Program — ⛔ STILL OPEN (low priority)
**Gap:** A `gov-bid-intake.md` directive exists, suggesting a government-sector offering. Cora currently has no gov-specific content; federal/government inquiries fall under the generic "outside scope → team will follow up" path, which is safe.
**Ali needs to confirm:** whether there is an active government/federal program and what Cora should say.

---

## How to provide remaining inputs

Reply on the linked Basecamp ticket (BC #9948562389) or send to support@colaberry.com. **Remaining for go-live:** #2 refund policy, plus the PR #24 deploy blockers (Gmail refresh token in prod; keep `CORA_DRY_RUN=true` until verified).

---

## Files updated when inputs arrive

**Current (post KB Ops migration, DB-backed):**
- `backend/src/seeds/seedKbData.ts` — `cora_kb_entries` seed rows (course/cohort facts, Q&A, pricing, deposit/refund). Additive `findOrCreate` by `question_pattern` — re-run `npx ts-node src/seeds/seedKbData.ts` against the target DB after any edit to actually apply new rows; editing existing rows' text here does NOT update already-seeded DB rows (use the `/admin/knowledge-ops` UI or a one-off corrective script for that).
- `backend/src/services/inbox/coraPersonaRouter.ts` — persona routing + `buildPersonaSystemPromptFromDB`, reads `cora_kb_entries` live at send time
- `backend/src/services/kbService.ts` — DB read layer
- `backend/src/services/inbox/coraAgentService.ts` — reads next cohort from DB at send time
- `backend/src/scripts/testCoraEmail.ts` — shadow-test cases
- `directives/cora-knowledge-base-gaps.md` — this file

**Historical (deleted 2026-08-03, dead code — do not recreate):**
- ~~`backend/src/services/inbox/coraKnowledgeBase.ts`~~, ~~`coraKnowledgeBaseQA.ts`~~, ~~`backend/src/scripts/syncCoraKbFromSheets.ts`~~

---

*Last updated: 2026-08-03 (CC-20260803-q7v2) | Originally built: 2026-06-16, Sessions CC-20260616-c0r4 (build), CC-20260616-k4m9 (Ali inputs applied)*
