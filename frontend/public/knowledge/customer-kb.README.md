# Customer Knowledge Base feed (`customer_kb.json`)

This directory publishes a **public, customer-facing** slice of the Colaberry
knowledge base for consumption by the marketing site **training.colaberry.com**.

- **Served at:** `https://enterprise.colaberry.ai/knowledge/customer_kb.json`
  (static file, same delivery path as `kb.json`; no auth, no token).
- **Consumed by:** the training site's build-time loader
  (`src/lib/training/knowledge.ts`), which fetches this URL via `KNOWLEDGE_KB_URL`,
  validates it, and **fails closed** to its committed snapshot on any error.
- **Contract:** `schema: "colaberry.customer-kb"`. The canonical, executable
  definition lives in the training repo at `src/lib/training/knowledge-schema.ts`.
  `scripts/validate-customer-kb.js` here mirrors it (zero-dependency) so this feed
  is validated on our side before it ships.

## The one rule

This file contains **only** content approved for public, prospect-facing use.
Internal domains (marketing, design) and any unverified or internal-only entry are
excluded by construction — the training site can never render internal content
because it never receives it.

## How to update

1. Edit `customer_kb.json` (add/adjust entries under the 5 customer categories:
   `program-format`, `admissions-cost`, `learning-curriculum`, `careers-outcomes`,
   `policies-trust`).
2. Validate: `node scripts/validate-customer-kb.js`
   (unique ids, category FKs, unique slugs per category, resolved `related` ids,
   public-https-only reference links, leak guards).
3. Commit + deploy (nginx image rebuild) — the training site picks it up on its
   next build.

## Claims discipline

Any pricing, refund, TWC-accreditation, outcome, or Anthropic-partnership claim
must be accurate and approved before it ships. TWC approval is attributed to the
**Colaberry School of Data Analytics (COA U5306)**; the AI Systems Architect
Accelerator's own TWC status is **not** asserted. Refund terms route to admissions
until finalized. See the review ledger that accompanied the first cut
(`claims-to-verify.md`).

## Roadmap (v2)

Today this feed is a curated, hand-maintained projection. The durable follow-up is
to generate it directly from the internal KB (`kb.json`) by adding `public` +
`customer_category` flags per entry and running an exporter (see the training repo's
`specs/training-site-migration/customer-kb/export-runbook.md`), so customer content
stays in sync with the single source of truth automatically.
