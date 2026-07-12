# Working Assumptions Log — AI Systems Architect Accelerator

**Locked:** 2026-05-30 (CC-20260530-execute)
**Status:** Working assumptions. Override by replying with corrections; downstream work proceeds on these defaults until you do.

This file lets every piece of downstream work — code, marketing, sales, legal — proceed without waiting on a strategic answer. Each assumption captures: what was locked, what alternative was considered, and what changes if you override.

---

## A1. Brand name

**LOCKED:** AI Systems Architect Accelerator (with co-brand "Powered by Anthropic + Claude Code" once Partner Network status is confirmed).

**Alternatives considered:** Claude Systems Architect Program / Enterprise AI Architect Accelerator / AI Workforce Architect Program / AI Operations Architect Certification Path / Applied AI Systems Engineering Program.

**If you override:**
- Landing page slugs change (currently planning `/intensive/build-your-ai-foundation`, etc., under the `aisystemsarchitect.colaberry.com` or `enterprise.colaberry.com/architect` path).
- Stripe product names need to be edited.
- Partner Network co-branding ask needs to be re-formulated.
- Email templates from this point forward use the new name.

---

## A2. Launch wedge persona

**LOCKED:** Career changer / working professional. Other personas (future consultant, enterprise employee, indie founder) become Cohort-2 wedges.

**Why:** Broadest viral-video reach, no B2B sales motion required for launch, highest gross margin, highest word-of-mouth velocity.

**If you override:**
- Marketing copy rewritten for the new persona's emotional drivers.
- Sales motion needs B2B outbound capability if persona shifts to enterprise employee.
- Pricing positioning may shift (enterprise track tolerates higher prices).

---

## A3. Pricing model

**LOCKED:** $499 per intensive × 4 / $1,497 bundle / $79/mo Architect Network or $790/yr / $149/mo Architect Pro / $499 Applied Consulting Lab. BYO Claude Code.

**Rejected:** $99/mo bundled with Claude Code (Anthropic pricing risk, licensing complexity, members who already have Claude/Max/Teams).

**If you override:**
- Stripe SKU configuration changes.
- Cost-of-delivery model changes (we'd be on the hook for Claude licensing).
- Margin model changes.

---

## A4. Cohort structure

**LOCKED:** 12 weeks total. Monday Architecture Day (2hr) + Thursday Build Day (2hr). Sold as 4 stackable 3-week Intensives (TWC compliance). Lego model — one project across 12 weeks, not 12 separate projects.

**Alternative considered:** 24-week / 4-week / fully async.

**If you override:** Curriculum schema and per-week artifact catalog rewrite.

---

## A5. Cohort cadence and size

**LOCKED (provisional, subject to capacity test):**
- **Cohort cadence:** Two 2026 cohorts. Cohort 1 orientation 2026-07-23 / classes start 2026-07-27, Cohort 2 starts 2026-11-02. (Cohort 3 removed, 2026-06-19.)
- **Cohort size cap:** **40 students** for Cohort 1 (Founding Cohort). Allows close mentor attention without overwhelming the 4 AI agents. Can raise to 50 in Cohort 2 if the platform holds.

**If you override:**
- Revenue model changes (current conservative scenario assumes 100 students/year = 4 quarterly cohorts × 25).
- Mentor capacity model changes.
- Marketing pacing changes.

---

## A6. LLM choice for training-platform agents

**LOCKED:** OpenAI GPT-4o family for v1 (matching the @CB and intern-nudge precedent). Swap to Claude API once Anthropic API key is plumbed in prod env.

**Why:** OpenAI key already in prod env. Anthropic API key not yet provisioned. v1 ships, v1.1 swaps.

**If you override:** Need to provision `ANTHROPIC_API_KEY` in prod env, then swap the model + tool format in the 4 agents.

---

## A7. Cohort kickoff date and Architect Expo date

**LOCKED:**
- Enrollment opens: **Friday 2026-07-10**
- Cohort 1 orientation: **Thursday 2026-07-23**; classes start: **Monday 2026-07-27**
- Cohort 1 ends + Architect Expo: **~Friday 2026-10-16** (12 weeks × Mon/Thu)

**If you override:** Whole 41-day plan shifts.

---

## A8. Mentor sourcing for Architect Pro tier

**LOCKED:** Hybrid — first cohort uses internal Colaberry staff (the 10-person Anthropic Partner cohort) as mentors, paid at staff rates. Cohort 2+ adds paid alumni mentors at $50/hr. No external contractors at launch.

**Why:** Lower cost, tighter quality control, mentors already know the curriculum (they're the ones who finished the Anthropic courses).

**If you override:** Need contractor sourcing pipeline + 1099 setup.

---

## A9. Cohort 1 launch marketing spend

**LOCKED (proposed, subject to your CFO call):** $5K paid backstop for the Founding Cohort launch. Allocation:
- $2K LinkedIn ads (career-changer targeting)
- $1K founder-network sponsorships (3 newsletters)
- $1K event hosting (1 Architect Demo webinar for prospects)
- $1K reserve for high-performing creative

**Plus zero-cost:** 5 Ali LinkedIn lives in week 5 + 3 Anthropic-Partner-cohort testimonial videos.

**If you override:** Just tell me a number; I'll re-allocate.

---

## A10. Stripe legal entity

**LOCKED (default):** Colaberry Inc. takes the $499 / $1,497 / membership revenue. New training-program LLC NOT created for launch.

**Why:** No need to spin up new entity for the first cohort. Revisit if revenue scales.

**If you override:** Need entity formation (3-5 days), bank account setup (1-2 days), Stripe re-setup (1 day).

---

## A11. Refund policy (placeholder)

**LOCKED (provisional):** **7-day no-questions refund from purchase date.** After day 7, refunds case-by-case. After Week 2 of cohort start, no refunds.

**Why:** Standard for online education. Aligns expectations. Cohort 2 should revisit after Cohort 1 data.

**If you override:** Tell me the policy and I'll update the enrollment page + Stripe.

---

## A12. Capstone evaluation rubric (placeholder)

**LOCKED (provisional, draft):** 5 dimensions × 0–4 points = max 20 points.
- **Architecture clarity** (system diagram, data flow, security)
- **Working integration** (MCP + 1 real data source + 1 agent)
- **Reliability layer** (validation, retry, error handling)
- **Governance layer** (audit log, approval flow, escalation path)
- **Business case** (problem framing, value, who pays)

Pass = 12/20. Honors = 17/20. Tied to Architect Readiness Score.

**If you override:** Draft your rubric or comment.

---

## A13. Architect Expo format

**LOCKED (provisional):** **Hybrid.** Live virtual via Zoom + recorded. In-person optional for Austin-based students (Colaberry Plano office). Recordings published with student consent.

**If you override:** Tell me virtual-only or in-person-only and I'll redesign logistics.

---

## A14. Skilljar progress sync architecture

**LOCKED:** **Manual cert upload at Week 12 + scheduled API polling daily** for in-flight progress. Webhook receiver added in v1.1 if Skilljar supports it.

**Why:** Skilljar's webhook support is uneven. Daily polling is bulletproof.

**If you override:** No-op for launch; matters for v1.1.

---

## A15. Mid-cohort Anthropic blueprint-change workflow

**LOCKED:** **No mid-cohort blueprint changes for Cohort 1.** Anthropic Intelligence Layer L1-L3 detects changes nightly; for Cohort 1 we publish a "Coming in Cohort 2" notice in the community. After Week 12 we update the curriculum.

**Why:** Constant mid-cohort churn destroys delivery confidence. Anthropic's first cert is stable; we'll see how often it actually changes.

**If you override:** Higher-touch curriculum change-management process; designed in v1.1.

---

## A16. Project Marketplace governance (deferred to v1.1)

**LOCKED:** Read-only marketplace at launch. Students "express interest." Manual assignment by Ali for Cohort 1. Formal governance ships in v1.1 (post-launch, ~Aug).

**Why:** Real client projects have liability, vetting, contracts, compensation. Cannot solve in 41 days.

**If you override:** No-op for launch.

---

## A17. Message Board target for intern weekly report

**LOCKED (provisional):** Keep posting to "Sprint Pres / New Project" board (4450326153). If you want a different one, tell me; I'll switch.

---

## Override mechanism

**To override any assumption:**
1. **Reply to this doc** (in the BC todo 9945833396) with the assumption ID (e.g. "A3: actually use $99 bundled because…") and the new value.
2. Or tag `@CB System` in any Basecamp thread with: `@CB System override assumption A3 to <new value> because <reason>`.
3. CB will update this file, propagate changes to downstream work, and confirm in the thread.

**If silent, downstream work proceeds on these locks.**
