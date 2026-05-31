# Brief: Taiwo — Admissions Operations

**You are:** Taiwo Oludimimu, Admissions Operations. You own enrollment monitoring, retention tracking, subscription growth, student lifecycle reporting. Roselen (when on BC) owns the human sales conversation; you own the operational layer behind it.

---

## Read first

- `00-program-overview.md`
- `01-brand-pricing.md`
- `02-launch-timeline-41d.md`

---

## Your scope at launch

### Enrollment monitoring

Stripe wires up Week 5 (Kes builds `backend/src/services/billingService.ts`). Once live:
- Daily report: enrollments today / week-to-date / vs Cohort 1 target (25 students)
- Per-intensive breakdown (Build Your AI Foundation vs Create Your AI Team etc.)
- Per-channel breakdown (Mailchimp vs landing-page direct vs partner referral vs Anthropic referral)
- Refund + churn tracking

CB can generate this report daily — give CB the column list + thresholds for "alert Ali" and CB takes it from there.

### Subscription tracking

Two graduate-only memberships (post-Cohort-1, so this becomes critical in Q4 2026):
- Architect Network Membership ($79/mo or $790/yr)
- Architect Pro ($149/mo, includes mentorship)

You report monthly:
- New subscriptions / cancellations / net new
- MRR + ARR trends
- Retention curve by cohort

### Retention + student lifecycle

For Cohort 1 (kickoff 2026-07-13):
- Weekly progress monitoring per student (paired with SuccessCoachAgent's automated nudges)
- Identify at-risk students (no GitHub activity X days, no lab submission, no community engagement)
- Hand at-risk students to AI SuccessCoach for nudge → human follow-up if AI nudge doesn't land in 48hrs
- Track who graduates, who drops, why

### Reporting cadence

| Frequency | Report | Delivery |
|---|---|---|
| Daily (post-enrollment-open) | Enrollment dashboard | Email Ali + post to Approval Queues if any threshold tripped |
| Weekly | Cohort progress per student | Send to Ali + Jackie + Kes |
| Monthly | Subscription + MRR trends | Send to Ali |
| Per cohort end | Cohort retrospective (who finished, NPS, capstone scores) | Send to Ali + Swati |

CB drafts the report formats; you direct what goes in.

### Critical-path deadlines

- **2026-06-17 (Wed)** — Subscription tracking system setup confirmed (works against Stripe / CCPP test data)
- **2026-06-19 (Fri)** — Lifecycle + retention monitoring system live (works against test cohort)
- **2026-07-10 (Fri)** — Daily enrollment report live (first day post-enrollment-open)
- **2026-07-13 (Mon)** — Cohort 1 weekly progress reporting starts

---

## Approvals

- Operational reports + thresholds you can set autonomously; loop Ali in on the "what gets escalated" call.
- **Strategic decisions** (e.g., "we should change refund policy from 7-day to 14-day"): Ali via Approval Queues.

---

## How to drive your area in Claude Code

1. **Open Claude Code + this brief.**
2. **Pick a todo from the Sales & Admissions list** in Basecamp.
3. **Ask Claude:** "Here's the brief. Here's the report I need to build [enrollment dashboard / retention curve / subscription tracker]. Draft the SQL + the report format."
4. **CB User can execute** the SQL against CCPP if it's a CB-tier task.
5. **Tag `@Taiwo`** for operational questions; `@Roselen` (once on BC) for sales call coordination; `@Ali` for strategic shifts.

---

## Where to find more

- Pricing canon: `01-brand-pricing.md` (especially A11 refund policy)
- Sales partner brief (Roselen): `18-roselen-sales.md`
- Curriculum context (cohort lifecycle): `11-swati-curriculum-twc.md`

**Source:** TRAINING_INTEGRATION_PLAN.md Section 4 (admissions ops scope); ASSUMPTIONS_LOG A11 refund, A5 cohort size; Ali's 2026-05-31 directives (subscription growth, retention).
