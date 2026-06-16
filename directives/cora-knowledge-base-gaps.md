# Cora Knowledge Base — Content Gaps & Ali Inputs Required

**Status:** Cora migration code-complete (2026-06-16). Ali inputs partially applied 2026-06-16 (CC-20260616-k4m9).
**Owner:** Ali Muwwakkil
**Raised by:** Kes (CC-20260616-c0r4)

**Remaining blockers before go-live:** #2 (refund policy — now in motion, assigned to Taiwo, BC todo [10003806235](https://app.basecamp.com/3945211/buckets/47502609/todos/10003806235), due 2026-06-19) and the two deploy blockers in PR #24 (`GMAIL_COLABERRY_REFRESH_TOKEN` in prod env; turn off `CORA_DRY_RUN` only after verification). #4 is resolved by directing to a strategy call.

---

## Priority 1 — Blockers (Cora cannot go live without these)

### 1. Next Cohort Date(s) — ✅ RESOLVED 2026-06-16
**Decision (Ali):** Next cohort starts **7/23**. Source of truth is the `Cohort` model on enterprise.colaberry.ai, managed at `/admin/accelerator`; these cohorts are linked to the training.colaberry.com classes.
**How it was implemented:** Cora no longer hardcodes a date. `coraAgentService.getNextCohortForCora()` reads the earliest open cohort via `cohortService.listOpenCohorts()` at send time and injects a "Current cohort schedule" section into the system prompt (`buildCoraSystemPrompt(nextCohort)`). If no open cohort is in the DB, Cora directs the sender to the enrollment page rather than guessing.
**Action still required (DATA, not code):** ensure a cohort row with `start_date = 2026-07-23`, `status = 'open'` exists in the **prod** DB via `/admin/accelerator` (the seed currently lists an Aug 2026 cohort). Until that row is the earliest open cohort, Cora will surface whatever the current earliest open cohort is.

---

### 2. Refund and Cancellation Policy — 🔄 IN MOTION (sourcing from Taiwo)
**Gap:** Cora replies "contact us for our current terms" — a placeholder. The actual policy is not in the codebase anywhere. **Current behavior:** Cora escalates all refund/cancellation requests to Ali (does not attempt to resolve), which is safe but means it cannot answer policy questions.
**Status (2026-06-16):** Assigned to **Taiwo Oludimimu** (Admissions Operations) to upload the finalized refund/cancellation agreement — Basecamp todo [10003806235](https://app.basecamp.com/3945211/buckets/47502609/todos/10003806235) (Accelerator → Sales & Admissions, due 2026-06-19). Once the document lands, load its terms into `coraKnowledgeBase.ts` (refund Q&A) and flip this item to RESOLVED. Until then, Cora keeps escalating — do not ship a guessed policy.
**Needed from the document:**
- Notice period required for cancellation
- Whether full/partial refunds are offered and under what conditions
- Whether participants can defer to a future cohort instead of cancelling

---

### 3. Payment Plans / Installment Options — ✅ RESOLVED 2026-06-16
**Decision (Ali):** Enrollment is now **subscription-first** via training.colaberry.com: **$149/month on the annual plan**, or **$199/month month-to-month**. Pay-in-full at **$4,500** remains available as an alternative.
**How it was implemented:** `CORA_PROGRAM`, `CORA_PRICING`, the cost Q&A, and a new payment-plan Q&A all lead with the subscription and list $4,500 as the pay-in-full option. Pricing response rule #3 updated so Cora may state these specific numbers; group/corporate pricing still routes to "contact us."

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

- `backend/src/services/inbox/coraKnowledgeBase.ts` — Q&A, pricing, system prompt, live cohort injection
- `backend/src/services/inbox/coraAgentService.ts` — reads next cohort from DB at send time
- `backend/src/scripts/testCoraEmail.ts` — shadow-test cases (added payment-plan + cohort-date)
- `directives/cora-knowledge-base-gaps.md` — this file

---

*Last updated: 2026-06-16 | Sessions CC-20260616-c0r4 (build), CC-20260616-k4m9 (Ali inputs applied)*
