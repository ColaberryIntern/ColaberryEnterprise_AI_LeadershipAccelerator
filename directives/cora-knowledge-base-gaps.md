# Cora Knowledge Base — Content Gaps & Ali Inputs Required

**Status:** Cora migration code-complete (2026-06-16). Knowledge base built from codebase source.
**Blocked on:** Ali providing the items below before Cora can answer these inquiry types accurately.
**Owner:** Ali Muwwakkil
**Raised by:** Kes (CC-20260616-c0r4)

---

## Priority 1 — Blockers (Cora cannot go live without these)

### 1. Next Cohort Date(s)
**Gap:** Cora has no cohort dates. The enrollment page fetches them live from the DB, but Cora's system prompt is static.
**If someone asks:** "When does the next cohort start?" → Cora currently has no answer.
**Ali needs to provide:**
- Upcoming cohort name and start date
- Decision: should Cora state specific dates, or always direct to the enrollment page?

---

### 2. Refund and Cancellation Policy
**Gap:** Cora replies "contact us for our current terms" — a placeholder. The actual policy is not in the codebase anywhere.
**Ali needs to provide:**
- Notice period required for cancellation
- Whether full/partial refunds are offered and under what conditions
- Whether participants can defer to a future cohort instead of cancelling

---

### 3. Payment Plans / Installment Options
**Gap:** The enrollment form shows "credit card" or "invoice" — no mention of installment pricing anywhere. Cora currently has no answer for this.
**Ali needs to provide:**
- Do installment plans exist? If yes: structure (e.g. 2 payments, 50/50)?
- Are payment plans available for all tiers or only group/corporate?

---

### 4. Advisory Services Pricing
**Gap:** The Advisory page describes 5 services with formats and ideal timing, but zero pricing. Cora can describe the services but cannot answer "how much does a Roadmap Workshop cost?"
**Services affected:**
- AI Roadmap Workshops (2-day session)
- Enterprise AI Architecture Design (4–8 week engagement)
- AI Agent Implementation Projects (8–16 week engagement)
- AI Governance Advisory (3–6 week engagement)
- AI Talent Deployment (ongoing / project-based)
**Ali needs to decide:** Provide price ranges per service, OR always direct to a strategy call for advisory pricing (Cora says "pricing is scoped per engagement — book a strategy call").

---

## Priority 2 — Scope Decisions (quick calls Ali can make)

### 5. Pilot Programs
**Gap:** Three pilot pages exist in the codebase (PilotAITeamPage, PilotExclusivePage, PilotZeroRiskPage).
**Ali needs to confirm:**
- Are these still active offers?
- If yes: what are they, how do they differ from the $4,500 program, and should Cora know about them?
- If retired: confirm so Cora can say "we don't have a pilot program currently" if asked.

---

### 6. Vertical-Specific Landing Pages
**Gap:** Six role/industry-specific landing pages exist (AIArchitectLandingPage, AIWorkforceDesignerPage, AIXceleratorLandingPage, FreightBrokerageLandingPage, UtilityCoopLandingPage, UtilityIOULandingPage).
**Ali needs to confirm:**
- Are these the same $4,500 program with different positioning, or separate products?
- If someone from a utility company asks "is there a program for energy sector leaders?" — what should Cora say?

---

### 7. In-Person Markets
**Gap:** The program is described as "hybrid; in-person available in select markets" but no markets are named anywhere in the code.
**Ali needs to provide:**
- Which cities/markets currently offer in-person options?
- OR: confirm Cora should always direct this to a strategy call.

---

### 8. Alumni / Champion Program
**Gap:** An Alumni Champion page exists. Cora has no information about post-program alumni engagement.
**Ali needs to provide:**
- What is the alumni program? (network access, referral program, ongoing learning?)
- Should Cora surface this when participants ask "what happens after the accelerator?"

---

### 9. Agency / Partner Program
**Gap:** An Agency Partner page exists. Should Cora know about this if a consulting firm asks about bringing Colaberry to their clients?
**Ali needs to confirm:**
- Is this an active reseller/referral pathway?
- What does Cora say if a consulting firm or staffing agency inquires?

---

## Priority 3 — Enrichment (improves response quality, not blockers)

### 10. Named Testimonials or Case Studies
**Gap:** The existing testimonial is fully anonymized ("VP of Technology", "Financial Services", "1,000+ employees"). Cora can reference it but can't give a concrete example.
**Ali needs to provide:**
- 1–2 real case study summaries Cora can reference (what the participant built, which industry, what outcome)
- OR confirm that Cora should always point to the case studies page rather than quoting examples

---

### 11. Government / Federal Program
**Gap:** A `gov-bid-intake.md` directive exists, suggesting a government-sector offering.
**Ali needs to confirm:**
- Is there an active government/federal program?
- What should Cora say if a federal agency or government contractor inquires?

---

## How to provide inputs

Reply directly on the Basecamp ticket linked to this directive, or send to support@colaberry.com (Kes will import into the knowledge base). Once Ali provides Priorities 1 and 2, Cora can go live.

---

## Files that will be updated when inputs arrive

- `backend/src/services/inbox/coraKnowledgeBase.ts` — add/update Q&A pairs per input
- `directives/cora-knowledge-base-gaps.md` — this file; check off items as resolved

---

*Last updated: 2026-06-16 | Session CC-20260616-c0r4*
