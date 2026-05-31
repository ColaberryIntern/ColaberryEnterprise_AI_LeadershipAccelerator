# Brief: Tejesh — `training.colaberry.com`

**You are:** Sai Tejesh, Website Lead for the public marketing site. You own `training.colaberry.com` end-to-end: structure, code, content migration, SEO, deployment. CB drafts copy; Aleem designs; you build.

---

## Read first

- `00-program-overview.md`
- `01-brand-pricing.md`
- `02-launch-timeline-41d.md`

---

## Your scope at launch

### What `training.colaberry.com` is

The **public marketing site** for the AI Systems Architect Accelerator. Career changer / working professional audience (LOCKED — A2). This is the funnel: visitor → landing page → enrollment → handoff to `enterprise.colaberry.ai` (Kes's platform).

### The migration brief (from Ali's 2026-05-31 directive)

We're doing away with the old Data Analytics program. The website was already migrated to Claude Code so we could build fast. Now we're redesigning it for the new AI Systems Architect class.

**Keep:**
- Testimonials
- Naming + branding hooks
- Reviews
- Blog posts (we'll add new ones, not throw away old ones unless they conflict)
- SEO equity (existing rankings shouldn't drop)

**Swap:**
- DA-positioning → AI Systems Architect positioning
- Any "data analytics" prose → "AI systems architect" / "build real AI systems" prose
- Career changer / working professional audience framing throughout

### Pages you ship

| Page | Description | Due |
|---|---|---|
| Home | Hero + positioning + 4 intensives at-a-glance + testimonial reel + footer | 1st draft 2026-06-05 (Fri) |
| Intensive landing × 4 | One per intensive (`/intensive/build-your-ai-foundation/` etc.) | 1st draft 2026-06-05 (Fri) |
| Bundle landing | $1,497 bundle page | 1st draft 2026-06-05 (Fri) |
| About | Colaberry credentials, team, Anthropic Partner Network status | 1st draft 2026-06-12 (Fri) |
| Blog index | Existing structure, swap in new AI-systems blog posts as Sohail produces | 1st draft 2026-06-05 (Fri) |

### Pricing + enrollment flow integration

Stripe wired by Kes via `backend/src/services/billingService.ts` (Week 5). You build the **enrollment UI** that calls the Stripe checkout. Hard gate for launch — no enrollment, no launch.

### SEO + content

Hold and grow existing SEO equity. Don't 301 anything without a redirect plan. Don't drop blog posts. Swap headlines + body copy but keep URL structure where possible.

### Critical-path deadlines

- **2026-06-05 (Fri)** — 1st draft of all key pages live (visible to Aleem for design review).
- **2026-06-21 (Sat → Fri Jun 19)** — final website (Aleem + Ali signed off).
- **2026-07-10 (Fri)** — site live + first paid enrollment opens.

### How `training.colaberry.com` connects to `enterprise.colaberry.ai`

After a visitor enrolls, they hand off to `enterprise.colaberry.ai` (Kes's platform). Stripe webhook → CCPP write → student account provisioned on the platform → email with login link.

The handoff contract:
- Stripe metadata on the purchase carries: intensive(s) bought, cohort number, industry track (if selected), referral source.
- Webhook fires `backend/src/services/billingService.ts` → creates CCPP records → kicks off welcome sequence.

You collaborate with Kes on the webhook contract; you don't own his platform.

---

## Approvals

- **Design approval:** Aleem + Ali for every page before it goes live.
- **Marketing approval:** Sohail + Ali on copy + positioning.
- **Strategic decisions:** Ali only via Approval Queues.

---

## How to drive your area in Claude Code

1. **Open the `training.colaberry.com` codebase + this brief + `01-brand-pricing.md`** in Claude Code.
2. **Pick a todo from the Website - training.colaberry.com list** in Basecamp.
3. **Ask Claude:** "Here's the brief. Here's the canonical brand. Here's the page spec. Build the React component / page structure."
4. **CB User drafts code.** You review, refine, ship.
5. **Tag `@Sai Tejesh` for technical/build questions.** Tag `@Aleem` for design questions. Tag `@Sohail` for copy questions.

---

## Where to find more

- Brand + pricing canon: `01-brand-pricing.md`
- Aleem's creative system: `12-aleem-creative.md`
- Sohail's marketing strategy: `13-sohail-marketing.md`
- Kes's platform (your handoff target): `10-kes-ai-systems.md`

**Source:** TRAINING_INTEGRATION_PLAN.md Sections 3.11, 4 (Website Team scope); Ali's 2026-05-31 directives (training.colaberry.com positioning, keep testimonials/reviews/blogs, swap DA→AI Systems).
