import { Router } from 'express';
import { z } from 'zod';
import { requireAdmin, requireSection } from '../../middlewares/authMiddleware';
import {
  answerFrontDoor,
  catalogCoverage,
  featuresForDomain,
} from '../../services/agentDomain/productFeatureCatalog';

/**
 * AF11.9 — the builder's front door, as an API.
 *
 * Two reads and no writes. This endpoint answers "can the product already do this?" and nothing
 * else: it files no request, records no answer and grants nothing. The AF11.7 field it informs is
 * written by the request the builder goes on to file, and the grant is AF11.4's.
 *
 * That is worth stating because the obvious next step — have the front door record its own answer
 * — would create a second place the `tried_in_product` field comes from, and the two would
 * disagree the first time a builder changed their mind after using the feature.
 *
 * ## THE ASK IS `dashboard`; THE BROWSE LIST IS `program`. The first version got this wrong
 *
 * Both routes shipped `requireAdmin` under a single `program` row, and that reasoning checked the
 * section gate without checking the ROLE TABLE. `mgmtSectionGate` is deny-by-default and the row
 * was correctly placed, so the gate behaved exactly as designed — but **no Agent Factory builder
 * role carries `program`**. `mgmtRoles.ts` grants it to `curriculum`, `admin` and `owner` only;
 * `marketing`, `platform` and `product_experience` each hold `dashboard` plus their own department.
 *
 * So the front door 403'd for every builder it was built for, and `AddCapabilityFrontDoor` renders
 * a failed lookup as *"Could not check the catalog just now"* — the deliberate soft fallback, which
 * meant the breakage looked like a transient hiccup instead of a permanent 403.
 *
 * `/ask` now sits on `requireSection('dashboard')`, the same grant the filing route and the dataset
 * picker use, and gets its own narrower `PATH_SECTION` row placed BEFORE the broad one (first match
 * in array order wins). The browse list stays `requireAdmin` + `program`: it enumerates the whole
 * curated catalog across domains, which is a program-wide read, while `/ask` answers one question
 * about one candidate for one domain.
 */

const router = Router();

const AskSchema = z.object({
  candidate: z.string().trim().min(1, 'Say what you want the agent to be able to do.').max(300),
  domain_key: z.string().trim().min(1, 'Which domain is this for?').max(80),
});

/**
 * GET — can the product already do this?
 *
 * Returns one of three answers and the route each one implies. A candidate nothing matches comes
 * back `not_built`, which is the honest answer from a deliberately incomplete catalog: see
 * `productFeatureCatalog.ts` for why the matcher refuses to guess.
 */
router.get(
  '/api/admin/agent-domain-product-features/ask',
  requireSection('dashboard'),
  (req, res) => {
    const parsed = AskSchema.safeParse(req.query);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Bad request.' });
      return;
    }
    const answer = answerFrontDoor({
      candidate: parsed.data.candidate,
      domainKey: parsed.data.domain_key,
    });
    res.json({ answer, coverage: catalogCoverage() });
  },
);

/**
 * GET — everything the product already does in one domain.
 *
 * The browse list behind the front door, so a builder can see what is there before describing
 * what they want. `coverage` rides along so an unmapped domain reads as unmapped rather than as
 * a product that does nothing.
 */
router.get(
  '/api/admin/agent-domain-product-features',
  requireAdmin,
  (req, res) => {
    const domain = String(req.query.domain_key ?? '').trim();
    if (!domain) {
      res.status(400).json({ error: 'Which domain is this for?' });
      return;
    }
    const coverage = catalogCoverage();
    res.json({
      domain_key: domain,
      features: featuresForDomain(domain),
      // TRUE only when somebody has curated this domain. An empty list from a mapped domain and
      // an empty list from an unmapped one are different facts and the screen says so.
      domain_is_mapped: coverage.domains.includes(domain),
      coverage,
    });
  },
);

export default router;
