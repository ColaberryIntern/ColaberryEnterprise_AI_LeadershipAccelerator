# Locked Decisions

**17 working assumptions locked 2026-05-30. Every downstream brief, todo, and Stripe SKU proceeds on these defaults. Override any of them by replying on the tracking todo (`https://3.basecamp.com/3945211/buckets/7463955/todos/9945833396`) with the assumption ID and the new value.**

---

## A1. Brand name
**LOCKED:** AI Systems Architect Accelerator (co-brand "Powered by Anthropic + Claude Code" after 2026-06-12).
**If override:** Landing page slugs change. Stripe product names need to be edited. Partner co-branding ask re-formulated.

## A2. Launch wedge persona
**LOCKED:** Career changer / working professional.
**If override:** Marketing copy rewritten for new persona's emotional drivers. Sales motion needs B2B outbound if shifting to enterprise employee.

## A3. Pricing model
**LOCKED:** $499 per intensive × 4 / $1,497 bundle / $79/mo Architect Network or $790/yr / $149/mo Architect Pro / $499 Applied Consulting Lab. BYO Claude Code.
**Rejected:** $99/mo bundled with Claude Code (Anthropic pricing risk).
**If override:** Stripe SKU rewire + margin model changes.

## A4. Cohort structure
**LOCKED:** 12 weeks. Mon Architecture Day + Thu Build Day (2hr each). Sold as 4 stackable 3-week Intensives (TWC compliance). Lego model — one project across 12 weeks.

## A5. Cohort cadence + size
**LOCKED (provisional):** Quarterly cadence — Cohort 1 starts 2026-07-13, Cohort 2 starts 2026-10-12, Cohort 3 starts 2027-01-11. **Cohort 1 size cap: 25 students (Founding Cohort).** Can raise to 50 in Cohort 2 if the platform holds.

## A6. LLM choice for training-platform agents
**LOCKED:** OpenAI gpt-4o family for v1 (matches `@CB` precedent — OpenAI key already in prod env). Swap to Claude API once `ANTHROPIC_API_KEY` is provisioned.

## A7. Cohort kickoff + Architect Expo dates
**LOCKED:** Enrollment opens Fri 2026-07-10. Cohort 1 kickoff Mon 2026-07-13. Cohort 1 ends + Architect Expo Fri 2026-10-02.
**If override:** Whole 41-day plan shifts.

## A8. Mentor sourcing for Architect Pro tier
**LOCKED:** Hybrid. Cohort 1 uses internal Colaberry staff (the 10-person Anthropic Partner cohort) at staff rates. Cohort 2+ adds paid alumni mentors at $50/hr. No external contractors at launch.

## A9. Cohort 1 launch marketing spend
**LOCKED (proposed):** $5K paid backstop. $2K LinkedIn ads + $1K newsletter sponsorships + $1K event hosting + $1K reserve.
**Plus zero-cost:** 5 Ali LinkedIn lives Week 5 + 3 Anthropic-Partner-cohort testimonial videos.

## A10. Stripe legal entity
**LOCKED:** Colaberry Inc. takes revenue. No new training-program LLC for launch.
**If override:** Entity formation (3–5d) + bank account (1–2d) + Stripe re-setup (1d).

## A11. Refund policy
**LOCKED (provisional):** 7-day no-questions refund from purchase. Day 8+, case-by-case. After Week 2 of cohort start, no refunds.

## A12. Capstone evaluation rubric
**LOCKED (provisional):** 5 dimensions × 0–4 points = 20 max. Architecture clarity / Working integration / Reliability layer / Governance layer / Business case. Pass = 12/20. Honors = 17/20.

## A13. Architect Expo format
**LOCKED (provisional):** Hybrid. Live Zoom + recorded. In-person optional for Austin-based students (Colaberry Plano office). Recordings published with student consent.

## A14. Skilljar progress sync architecture
**LOCKED:** Manual cert upload at Week 12 + scheduled API polling daily for in-flight progress. Webhook receiver added in v1.1 if Skilljar supports it.

## A15. Mid-cohort Anthropic blueprint-change workflow
**LOCKED:** No mid-cohort blueprint changes for Cohort 1. Anthropic Intelligence L1-L3 detects changes nightly; we post a "Coming in Cohort 2" notice in the community. Update curriculum after Week 12.

## A16. Project Marketplace governance
**LOCKED:** Read-only marketplace at launch. Students "express interest." Manual assignment by Ali for Cohort 1. Formal governance ships in v1.1 (~Aug).

## A17. Message Board target for weekly intern report
**LOCKED (provisional):** Keep posting to "Sprint Pres / New Project" board (4450326153).

---

## Override mechanism

1. Reply to the tracking todo (`https://3.basecamp.com/3945211/buckets/7463955/todos/9945833396`) with `A3: actually use X because Y`.
2. **Or** tag `@CB System` anywhere in Basecamp with `override assumption A3 to X because Y`.

CB will update `docs/training-program-2026-q3/ASSUMPTIONS_LOG.md`, propagate the change to all affected downstream briefs + tasks, and confirm in-thread. Silent = locks remain in effect.

---

**Source:** `docs/training-program-2026-q3/ASSUMPTIONS_LOG.md`.
