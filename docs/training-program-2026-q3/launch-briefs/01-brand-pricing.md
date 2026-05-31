# Brand + Pricing Reference

**Locked decisions. Use these exact values across landing pages, sales material, emails, Stripe SKUs.**

---

## Brand

- **Program name:** AI Systems Architect Accelerator
- **Co-brand (after 2026-06-12):** Powered by Anthropic + Claude Code
- **One-line pitch:** "Bring your idea. We help you turn it into a real AI system."
- **Positioning statement:** "Learn from Anthropic. Build through Colaberry. Deploy in the real world."
- **Tagline alt:** "Create AI Systems. Build Real Businesses. Launch Real Products."

**Anti-positioning — never use these names:**
- Prompt Engineering
- AI Bootcamp
- Learn Claude
- ChatGPT Training

**Voice + tone:**
- Authoritative, executive, founder-coded (think Bloomberg + Salesforce, not consumer SaaS).
- Direct, not casual. 12th-grade reading level.
- No fluff phrases ("happy to help," "we're excited to," etc.).
- **No em-dashes anywhere.** Use commas or hyphens. This is a hard preflight rule.
- No emojis unless Ali explicitly approves a campaign that uses them.

---

## Audience (the launch wedge)

**LOCKED — career changer / working professional.** Highest viral video reach, no B2B sales motion required for launch, highest gross margin.

**Future cohort wedges (NOT for Cohort 1 marketing):** future consultant, enterprise employee, indie founder.

---

## Pricing (LOCKED)

| Product | Price | Notes |
|---|---|---|
| Architect Intensive (individual) | $499 | 4 separately-sold seminars per TWC compliance |
| Full Bundle (all 4 intensives) | $1,497 | Marketing discount on bundle, not a course prerequisite |
| Architect Network Membership | $79/mo or $790/yr | Graduate-only; community + events + ongoing access |
| Architect Pro | $149/mo | Graduate-only; adds mentorship + job support + portfolio review |
| Applied AI Consulting Lab | $499 one-time | Post-grad apprenticeship slot on real Colaberry projects |
| Claude Code license | **BYO** ($17–$20/mo, paid by student) | Never bundle; Anthropic pricing risk |

**Rejected pricing model:** $99/mo bundled with Claude Code (Anthropic pricing risk, licensing complexity, members already have Max/Teams subs).

**Refund policy (provisional — LOCKED for launch):** 7-day no-questions refund from purchase date. Day 8+, refunds case-by-case. After Week 2 of cohort start, no refunds.

---

## The 4 Architect Intensives

| # | Market name | Tech name | Weeks | Outcome (one-line) |
|---|---|---|---|---|
| 1 | Build Your AI Foundation | Claude Code Foundations | 1–3 | Working Architect Workspace + 3 reusable Skills + working Business Workflow Assistant |
| 2 | Create Your AI Team | Agent Engineering | 4–6 | Working multi-agent system in your project |
| 3 | Connect AI To The Real World | MCP & Enterprise Integration | 7–9 | First production MCP server connecting your project to real business data |
| 4 | Design AI That Scales | AI Systems Architecture | 10–12 | Production-readiness package: reliability, governance, architecture documentation |

Full outcome statements + artifact catalogs per intensive in the TWC-counsel-reviewed document `docs/training-program-2026-q3/TWC_INTENSIVE_OUTCOMES.md` (see `06-twc-context.md`).

---

## Industry tracks (student picks at Week 1)

Insurance / Healthcare / Education / Government / Recruiting / Real Estate / Freight / Manufacturing / Personal Brand / Small Business / Faith Based / Nonprofit / Custom.

---

## URL strategy

- **Marketing site:** `training.colaberry.com` (career changer / working professional funnel)
- **Per-intensive landing pages:** `training.colaberry.com/intensive/build-your-ai-foundation/` (one per intensive + bundle)
- **Student platform:** `enterprise.colaberry.ai`
- **Future alt brand domain (under consideration):** `aisystemsarchitect.colaberry.com`

---

## Marketing budget (LOCKED — proposed)

**$5K paid backstop for Founding Cohort launch:**
- $2K LinkedIn ads (career-changer targeting)
- $1K founder-network sponsorships (3 newsletters)
- $1K event hosting (1 Architect Demo webinar)
- $1K reserve for high-performing creative

**Zero-cost channels:**
- 5 Ali LinkedIn lives in launch Week 5
- 3 Anthropic-Partner-cohort testimonial videos
- Mailchimp campaign to past students / alumni / dropouts / never-signed-up (full alumni list)

**No auto-posts to LinkedIn.** Every social media post is human-approved before publish. CB drafts, humans approve.

---

## Visual identity

See `12-aleem-creative.md` for the full creative brief. Two-sentence summary:
- Clean, calm, authoritative. Bloomberg meets Salesforce, not consumer SaaS.
- Target audience: enterprise executives 35–60, paying for an architect-level certification.

---

## Stripe + legal

- **Legal entity:** Colaberry Inc. takes the $499 / $1,497 / membership revenue. No new LLC for launch.
- **Stripe SKUs:** 4 intensives + bundle + 2 graduate memberships + consulting lab. Wired in Week 5 (`backend/src/services/billingService.ts`, new file).

---

**Updating this brief:** If any of the LOCKED items above need to change, reply to Ali's tracking todo (`https://3.basecamp.com/3945211/buckets/7463955/todos/9945833396`) with "A3: actually use $99 bundled because..." (referencing the assumption ID from `04-decisions-locked.md`).
