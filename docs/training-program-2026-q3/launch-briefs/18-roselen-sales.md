# Brief: Roselen — Sales / Admissions

**You are:** Roselen, Sales human-in-the-loop. You own the sales conversation, enrollment closing, and the customer-facing parts of admissions. Taiwo owns the operational layer behind you (subscriptions, reporting, retention).

> **STATUS: BLOCKED.** Roselen is not yet on Basecamp account 3945211. Ali is provisioning. Until then:
> - Sales tasks land as `unassigned` in the Sales & Admissions list
> - CB drafts all sales material so it's ready the day you're activated
> - Taiwo covers admissions operations
> - This brief is committed and ready for handoff

---

## Read first

- `00-program-overview.md`
- `01-brand-pricing.md`
- `02-launch-timeline-41d.md`

---

## Your scope at launch

### Sales call workflow

You'll handle inbound + qualified outbound conversations with prospects who:
- Came through the `training.colaberry.com` funnel and didn't convert at the landing page
- Came from the Anthropic Partner Network referral channel
- Came from the Mailchimp alumni campaign Sohail runs
- Booked an Open House and want to talk before enrolling

CB has drafted sales call workflow + objection handling material. Find it in:
- `Sales & Admissions` list on the Basecamp project — every task has a brief link

### Enrollment process

Once a prospect says yes:
- They go to `training.colaberry.com` and complete Stripe checkout
- Stripe metadata captures: intensive(s), cohort, industry track, referral source
- Webhook → CCPP → `enterprise.colaberry.ai` student account provisioned
- Welcome email sequence kicks off (Sohail's drafts, Taiwo's tracking)

You don't process the payment yourself — Stripe handles it. Your job is to close the conversation.

### Lead follow-up

When a prospect doesn't convert:
- Add to your follow-up cadence (CB can draft sequences)
- Hand-off back to Sohail's email drip if needed
- Mark in the CRM (CCPP) why they didn't convert — feeds back into Sohail's marketing strategy

### Sales material

CB drafts; you direct + approve:
- Founding Cohort one-pager
- Intensive-by-intensive deep dives
- Objection handling sheet (price, time commitment, prerequisites, Stripe refund policy)
- Founding Cohort urgency framing ($1,497 bundle for $1,497 — "first cohort price holds")

### Critical-path

- **Day 1 after Basecamp activation** — read this brief + draft material in `Sales & Admissions` list
- **Week 5 (Jul 5-10) and onward** — sales calls active as prospects come through the funnel
- **2026-07-13 (Mon)** — Cohort 1 kickoff, your conversion focus shifts to Cohort 2

---

## Approvals

- **Material approval:** Sohail + Ali on copy + positioning
- **Discount / payment plan approvals:** Ali (don't promise discounts beyond the Founding Cohort price without checking)

---

## How to drive your area in Claude Code (once on Basecamp)

1. **Open Claude Code + this brief + `01-brand-pricing.md` + `13-sohail-marketing.md`.**
2. **Pick a todo from the Sales & Admissions list** in Basecamp.
3. **Ask Claude:** "Here's the brief. Here's the prospect context. Draft [call script / objection response / follow-up email]."
4. **CB drafts; you refine + send.**

---

## Where to find more

- Brand + pricing canon: `01-brand-pricing.md`
- Marketing partner (Sohail): `13-sohail-marketing.md`
- Admissions ops partner (Taiwo): `16-taiwo-admissions.md`

**Source:** Ali's 2026-05-31 directives (Roselen scope, sales lead role, prepare for human-in-the-loop on sales side); TRAINING_INTEGRATION_PLAN.md Section 4.
