/**
 * AF3.1 Release Zero — derive one domain agent's identity config from the domain registry.
 *
 * ## What this is, and what it deliberately is not
 *
 * The ticket asks for "a repeatable path that creates one domain agent carrying the same
 * inspectable surface Reese has, created but not activated". The path already exists: the
 * `build-platform-agent` skill plus `seedAgentIdentity()`. What was missing is the DERIVATION —
 * turning a `domain_key` into the config that path takes, without anyone hand-editing ten of
 * them.
 *
 * This module is derivation only. It is pure: no database, no network, no writes. The caller
 * decides whether to preview it or commit it, and `previewDomainAgent.js` only ever previews.
 *
 * ## The three things R0 must NOT do
 *
 * Out of scope per the ticket, and enforced here rather than remembered:
 *
 *   enabled          false      an agent created enabled is a live actor nobody approved
 *   autonomy_level   observe    the floor; R0 grants no autonomy
 *   tools_granted    []         empty; capability grants are AF7.1 and require a manager
 *
 * `assertReleaseZeroSafe()` below re-checks all three on the derived object, so a future edit
 * that loosens one fails loudly instead of shipping a live agent.
 */

/** The ten domains, with the human-readable shape each agent needs. Mirrors the registry. */
const DOMAIN_PROFILES = {
  marketing: { display: 'Marketing', category: 'marketing', intent: 'Owns the marketing surface: brands, content, campaigns, publishing and the performance read behind them.' },
  curriculum: { display: 'Curriculum', category: 'program', intent: 'Owns the curriculum surface: cohorts, components, composer, capabilities and cert prep.' },
  admissions: { display: 'Admissions', category: 'lead_ingestion', intent: 'Owns lead intake: sources, ingest logs, routing rules and import.' },
  internship: { display: 'Internship', category: 'internship', intent: 'Owns the AI Internship application queue and the review it carries.' },
  sales: { display: 'Sales', category: 'revenue', intent: 'Owns the revenue surface: pipeline, opportunities, payments and the funnel read.' },
  platform: { display: 'Platform', category: 'system', intent: 'Owns the platform surface: tickets, reports, settings, events and automation health.' },
  product_experience: { display: 'Product Experience', category: 'product', intent: 'Owns the product surface: the brands and websites the platform publishes to, and the checks across them.' },
  learner_success: { display: 'Learner Success', category: 'student_success', intent: 'Owns the learner surface: progress, intervention and the student story.' },
  executive: { display: 'Executive', category: 'executive', intent: 'Owns the executive read: the war room, the trust surface and the narrative above them.' },
  website: { display: 'Website', category: 'marketing', intent: 'Owns the public website surface and what it publishes.' },
};

/** Release Zero's hard floor. Not defaults — invariants, re-asserted after derivation. */
const RELEASE_ZERO = Object.freeze({
  enabled: false,
  autonomy_level: 'observe',
  tools_granted: [],
  reports_to_type: null,
  reports_to_id: null,
});

const slug = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

/**
 * Derive the full identity config for one domain.
 *
 * `agentName` is PascalCase with a `DomainAgent` suffix so it is obvious in a registry of 257
 * what kind of thing it is; `email` is the idempotency key everything downstream resolves on,
 * which is why it is derived from the domain key and not from the display name — a display name
 * is the sort of thing somebody renames.
 */
function deriveDomainAgent(domainKey, opts = {}) {
  const profile = DOMAIN_PROFILES[domainKey];
  if (!profile) {
    throw new Error(`Unknown domain "${domainKey}". Known: ${Object.keys(DOMAIN_PROFILES).join(', ')}`);
  }
  const pascal = domainKey.split('_').map((w) => w[0].toUpperCase() + w.slice(1)).join('');
  const agentName = `${pascal}DomainAgent`;

  const config = {
    agentName,
    email: `${slug(domainKey)}-agent@colaberry.com`,
    displayName: `${profile.display} Agent`,
    role: 'ai_staff',
    communityRole: 'mentor',
    // Honest placeholders, copied from Reese's own values. A staff identity row needs these
    // columns; inventing friendlier-looking values would misrepresent a non-transactional row.
    enrollmentDefaults: {
      company: 'Colaberry',
      payment_status: 'paid',
      payment_method: 'invoice',
      payment_mode: 'live',
      enrollment_type: 'standard',
      portal_enabled: false,
    },
    pilotCohortGate: false,
  };

  const registryEntry = {
    agent_name: agentName,
    display_name: config.displayName,
    agent_type: 'ai_staff_mentor',
    category: profile.category,
    description: profile.intent,
    domain_key: domainKey,
    ...RELEASE_ZERO,
  };

  return { domainKey, profile, config, registryEntry, ...opts };
}

/**
 * Re-assert Release Zero's floor on a derived plan.
 *
 * Separate from the derivation on purpose. The invariants matter more than the code that
 * produces them, and a check that runs on the OUTPUT catches a bad edit to the input constants
 * as well as a bad edit to the deriving function.
 */
function assertReleaseZeroSafe(plan) {
  const r = plan.registryEntry;
  const problems = [];
  if (r.enabled !== false) problems.push(`enabled must be false, got ${JSON.stringify(r.enabled)}`);
  if (r.autonomy_level !== 'observe') problems.push(`autonomy_level must be "observe", got ${JSON.stringify(r.autonomy_level)}`);
  if (!Array.isArray(r.tools_granted) || r.tools_granted.length !== 0) {
    problems.push(`tools_granted must be empty, got ${JSON.stringify(r.tools_granted)}`);
  }
  if (r.reports_to_id) problems.push('R0 sets no reporting line; that is AF4.3');
  if (problems.length) {
    throw new Error(`Release Zero invariants violated for ${plan.domainKey}:\n  - ${problems.join('\n  - ')}`);
  }
  return true;
}

module.exports = { DOMAIN_PROFILES, RELEASE_ZERO, deriveDomainAgent, assertReleaseZeroSafe };
