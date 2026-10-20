/**
 * C6.9 - the brief schema and the gate that makes it honest.
 *
 * ## Why a guard and not a generator
 *
 * The ticket's named failure is "generating plausible-sounding account facts", and it
 * requires that "every line needs a source link". That requirement is the whole problem:
 * nothing in this backend can source an account claim. There is no web-search dependency in
 * `backend/package.json`, and the one agent runtime that could research has `WebFetch` and
 * `WebSearch` on a hard deny-list (`claudeAgentSdkProvider.ts:106`) because unbounded egress
 * is a denied capability. A generator built on top of that would produce fluent, unsourced
 * prose, which is precisely the failure named.
 *
 * So the deliverable is the SCHEMA and the GATE rather than the generator. The research is
 * done by a Claude Code session, which is this repo's own documented model of how research
 * happens (`runMyDayPromptService.ts` literally writes "Use WebSearch" into a prompt for a
 * human operator). The gate is what stops an unsourced line from shipping, and it works the
 * same whether a person or a model wrote the brief.
 *
 * Modeled on `c67Guards.js:82`, which already enforces exactly this for C6.7's openings and
 * has been holding since.
 */

/** Confidence in a sourced line. NOT_VERIFIED is publishable; it just cannot be asserted. */
const CONF = {
  HIGH: { k: 'HIGH', note: 'Verbatim on a page the account itself publishes' },
  MED: { k: 'MEDIUM', note: 'Credible third party, named' },
  NONE: { k: 'NOT VERIFIED', note: 'Could not confirm. Hold the line, do not assert it.' },
};

/** The eight sections the ticket names, in the order a reader needs them. */
const SECTIONS = [
  { key: 'aiActivity', label: 'What they are doing with AI', sourced: true },
  { key: 'whyNow', label: 'Why now', sourced: true },
  { key: 'likelyBuyer', label: 'Likely buyer', sourced: true },
  { key: 'likelyInitiative', label: 'Likely initiative', sourced: true },
  { key: 'relevantProof', label: 'Relevant proof of ours', sourced: false },
  { key: 'opening', label: 'Conversation opening', sourced: true },
  { key: 'risk', label: 'Risk', sourced: false },
];

/** A line that asserts something about the ACCOUNT must carry a URL and a date. */
function assertEveryClaimIsSourced(brief) {
  for (const section of SECTIONS.filter((s) => s.sourced)) {
    const line = brief[section.key];
    // An absent section, and one explicitly marked unavailable, are both
    // assertAbsencesAreExplicit's business. Demanding a source URL for a section that
    // honestly says "we could not find this" would push the author toward inventing one,
    // which is the exact failure the gate exists to prevent.
    if (!line || line.available === false) continue;
    if (!line.text) throw new Error(`${brief.account}: ${section.key} has no text`);
    if (!/^https?:\/\//.test(line.source || '')) {
      throw new Error(`${brief.account}: ${section.key} asserts "`
        + `${String(line.text).slice(0, 60)}..." with no source URL`);
    }
    if (!line.seen) {
      throw new Error(`${brief.account}: ${section.key} has a source but no date it was read`);
    }
    if (!line.confidence || !CONF[line.confidence]) {
      throw new Error(`${brief.account}: ${section.key} has no confidence level`);
    }
  }
  return true;
}

/**
 * A missing section must say it is missing and why.
 *
 * Borrowed from `evidencePacket.ts`: "a packet that omits a field silently is the thing a
 * reviewer cannot tell from a packet that answered it". An account we could find nothing
 * about is a real and useful answer; a brief that quietly has six sections instead of seven
 * is not.
 */
function assertAbsencesAreExplicit(brief) {
  for (const section of SECTIONS) {
    const line = brief[section.key];
    if (line === undefined) {
      throw new Error(`${brief.account}: ${section.key} is absent. Use `
        + `{ available: false, reason } rather than omitting it.`);
    }
    if (line && line.available === false && !line.reason) {
      throw new Error(`${brief.account}: ${section.key} is marked unavailable with no reason`);
    }
  }
  return true;
}

/**
 * Nothing in a brief may assert a figure about US that the claim registry does not carry.
 *
 * Takes the publishable wordings so the caller supplies the registry rather than this file
 * reaching for it, which keeps the guard usable in a test.
 */
function assertOurClaimsMatchRegistry(brief, publishableWordings) {
  const ours = [brief.relevantProof, brief.opening]
    .filter((l) => l && l.text).map((l) => l.text).join(' ');
  const figures = ours.match(/\$[\d,]+|\b\d[\d,]*(?:\.\d+)?\s?%|\b\d{1,3},\d{3}\b/g) || [];
  for (const figure of figures) {
    if (!publishableWordings.some((w) => String(w).includes(figure))) {
      throw new Error(`${brief.account}: cites the figure "${figure}", which is not in the `
        + 'claim registry. No row, no claim.');
    }
  }
  return figures.length;
}

/** Two briefs that could be swapped between accounts are a template, not research. */
function assertNotInterchangeable(briefs, maxOverlap = 0.4) {
  const words = (b) => new Set(
    String((b.opening && b.opening.text) || '').toLowerCase().match(/[a-z]{4,}/g) || [],
  );
  for (let i = 0; i < briefs.length; i += 1) {
    for (let j = i + 1; j < briefs.length; j += 1) {
      const a = words(briefs[i]);
      const b = words(briefs[j]);
      if (!a.size || !b.size) continue;
      const shared = [...a].filter((w) => b.has(w)).length;
      const overlap = shared / Math.min(a.size, b.size);
      if (overlap > maxOverlap) {
        throw new Error(`${briefs[i].account} and ${briefs[j].account} share `
          + `${Math.round(overlap * 100)}% of their opening vocabulary. One is a template.`);
      }
    }
  }
  return briefs.length;
}

/** Run every gate over a set of briefs. Returns a count, throws on the first failure. */
function validateBriefs(briefs, publishableWordings = []) {
  for (const brief of briefs) {
    if (!brief.account) throw new Error('a brief has no account name');
    assertAbsencesAreExplicit(brief);
    assertEveryClaimIsSourced(brief);
    assertOurClaimsMatchRegistry(brief, publishableWordings);
  }
  assertNotInterchangeable(briefs);
  return briefs.length;
}

module.exports = {
  CONF,
  SECTIONS,
  assertEveryClaimIsSourced,
  assertAbsencesAreExplicit,
  assertOurClaimsMatchRegistry,
  assertNotInterchangeable,
  validateBriefs,
};
