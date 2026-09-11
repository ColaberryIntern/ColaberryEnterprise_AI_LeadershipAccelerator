/**
 * brandGovernance — does a piece of content obey its brand's rules? Pure. Rules come IN.
 *
 * WHY RULES ARE A PARAMETER AND NOT A CONSTANT. The existing brandComplianceService hardcodes
 * its banned phrases as module constants, which was fine for one brand's internal Basecamp
 * comments and is exactly wrong for public content across several brands: Colaberry Enterprise
 * and Colaberry Training do not share a voice, an offer list, or a set of claims they are
 * allowed to make, and a constant cannot be different per brand or change without a deploy.
 * So this module holds NO rules. It holds the checks, and every check reads the rules it is
 * handed. A test asserts that the same content passes under one rule set and fails under
 * another, which is the property "read from data" actually means.
 *
 * WHY EVERY VIOLATION IS REPORTED, NOT THE FIRST. An operator fixing content needs the whole
 * list. Returning one at a time turns a two-minute edit into a loop of submit, fail, fix,
 * submit.
 *
 * NEVER INVENT (spec 8.4). Testimonials, outcomes, accreditation, pricing, statistics,
 * deadlines, partnerships, guarantees. Those are the categories prohibited-claim patterns are
 * expected to encode per brand; this module does not pretend to detect them by magic, it
 * applies whatever patterns the brand recorded.
 */

export interface ProtectedTerm {
  /** The one correct form, e.g. "Colaberry". */
  canonical: string;
  /** Forms that are WRONG and must be flagged, e.g. ["Cola Berry", "ColaBerry", "Colaberri"]. */
  rejectedForms: readonly string[];
  /** If true, "colaberry" is a violation even though the letters match. */
  caseSensitive: boolean;
}

export interface RequiredDisclosure {
  id: string;
  /** Text that must appear (case-insensitive substring). */
  text: string;
  /** When it is required. */
  when: 'always' | 'paid' | 'ai_generated' | 'offer';
}

export interface ProhibitedClaim {
  id: string;
  /** A regex SOURCE string, applied case-insensitively. Stored as data, compiled at check time. */
  pattern: string;
  reason: string;
}

export interface ApprovedOffer {
  id: string;
  label: string;
  /** The exact CTA copy that has been approved. */
  cta: string;
}

export interface RequiredApprover {
  role: string;
  /** Content kinds this approver must sign off, e.g. ["paid", "pricing"]. */
  forContent: readonly string[];
}

export interface BrandGovernanceRules {
  version: number;
  voice: { tone: string; guidance: string };
  approvedOffers: readonly ApprovedOffer[];
  requiredDisclosures: readonly RequiredDisclosure[];
  prohibitedClaims: readonly ProhibitedClaim[];
  protectedTerms: readonly ProtectedTerm[];
  audienceExclusions: readonly string[];
  allowedLinkDomains: readonly string[];
  requiredApprovers: readonly RequiredApprover[];
}

export interface ContentUnderReview {
  body: string;
  /** Disclosure text attached to the content, if any. */
  disclosure: string;
  /** Absolute URLs the content links to. */
  links: readonly string[];
  isPaid: boolean;
  aiGenerated: boolean;
  /** Does the content present an offer or CTA? */
  hasOffer: boolean;
  /** Content kinds, for approver routing: e.g. ["paid", "pricing"]. */
  kinds: readonly string[];
  /** AI provenance, required when aiGenerated. */
  ai?: { model: string | null; promptVersion: string | null; templateVersion: string | null; humanApproved: boolean };
}

export type ViolationKind =
  | 'prohibited_claim'
  | 'missing_disclosure'
  | 'protected_term'
  | 'link_domain'
  | 'unapproved_cta'
  | 'ai_provenance'
  | 'ai_unapproved';

export interface Violation {
  kind: ViolationKind;
  /** Which rule fired, so the operator can find and, if wrong, fix the RULE. */
  ruleId: string;
  message: string;
  /** Whether this blocks publishing or merely warns. */
  severity: 'block' | 'warn';
}

export interface GovernanceResult {
  ok: boolean;
  rulesVersion: number;
  violations: Violation[];
  /** Roles that must approve this content, derived from its kinds. */
  requiredApproverRoles: string[];
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function hostnameOf(url: string): string | null {
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return null;
  }
}

/**
 * Is `host` `domain` or a subdomain of it? `learn.colaberry.com` is under `colaberry.com`;
 * `colaberry.com.evil.test` is NOT, which a bare endsWith would get wrong.
 */
function underDomain(host: string, domain: string): boolean {
  const d = domain.toLowerCase();
  return host === d || host.endsWith(`.${d}`);
}

export function checkContent(content: ContentUnderReview, rules: BrandGovernanceRules): GovernanceResult {
  const violations: Violation[] = [];
  const body = content.body ?? '';
  const haystack = `${body}\n${content.disclosure ?? ''}`;

  // ── Prohibited claims ─────────────────────────────────────────────────────────────────────
  for (const claim of rules.prohibitedClaims) {
    let re: RegExp;
    try {
      re = new RegExp(claim.pattern, 'i');
    } catch {
      // A malformed pattern is a RULE defect. Reported as a violation against the rule id so
      // it gets fixed, rather than silently skipped so the claim it was meant to catch sails
      // through.
      violations.push({ kind: 'prohibited_claim', ruleId: claim.id, severity: 'block', message: `Rule ${claim.id} has an invalid pattern and could not be applied: fix the rule.` });
      continue;
    }
    if (re.test(body)) {
      violations.push({ kind: 'prohibited_claim', ruleId: claim.id, severity: 'block', message: claim.reason });
    }
  }

  // ── Required disclosures ──────────────────────────────────────────────────────────────────
  for (const d of rules.requiredDisclosures) {
    const applies =
      d.when === 'always' ||
      (d.when === 'paid' && content.isPaid) ||
      (d.when === 'ai_generated' && content.aiGenerated) ||
      (d.when === 'offer' && content.hasOffer);
    if (!applies) continue;
    if (!haystack.toLowerCase().includes(d.text.toLowerCase())) {
      violations.push({ kind: 'missing_disclosure', ruleId: d.id, severity: 'block', message: `Required disclosure missing: "${d.text}" (required when: ${d.when}).` });
    }
  }

  // ── Protected terms ───────────────────────────────────────────────────────────────────────
  for (const term of rules.protectedTerms) {
    for (const bad of term.rejectedForms) {
      // Case-insensitive so "cola berry" is caught by the rejected form "Cola Berry" - but a
      // hit that IS the canonical spelling is never a violation. Without that guard the
      // rejected form "ColaBerry" (wrong only by case) flags every correct "Colaberry", which
      // is the bug the first version of this file shipped with.
      const re = new RegExp(`\\b${escapeRegex(bad)}\\b`, 'gi');
      for (const m of body.matchAll(re)) {
        // A hit whose LETTERS match the canonical form is a case question, not a spelling
        // one, and belongs to the caseSensitive branch below (a warning). Blocking it here
        // would make "colaberry" a spelling error, which it is not - and would let the two
        // rules disagree about the same word.
        if (m[0].toLowerCase() === term.canonical.toLowerCase()) continue;
        violations.push({ kind: 'protected_term', ruleId: term.canonical, severity: 'block', message: `"${m[0]}" is not an accepted spelling; use "${term.canonical}".` });
      }
    }
    if (term.caseSensitive) {
      // Every case-insensitive hit that is not the exact canonical form is a case violation.
      const re = new RegExp(`\\b${escapeRegex(term.canonical)}\\b`, 'gi');
      for (const m of body.matchAll(re)) {
        if (m[0] !== term.canonical) {
          violations.push({ kind: 'protected_term', ruleId: term.canonical, severity: 'warn', message: `"${m[0]}" should be written "${term.canonical}".` });
        }
      }
    }
  }

  // ── Link domains ──────────────────────────────────────────────────────────────────────────
  if (rules.allowedLinkDomains.length > 0) {
    for (const link of content.links) {
      const host = hostnameOf(link);
      if (!host) {
        violations.push({ kind: 'link_domain', ruleId: 'allowedLinkDomains', severity: 'block', message: `Link is not a valid absolute URL: ${link}` });
        continue;
      }
      if (!rules.allowedLinkDomains.some((d) => underDomain(host, d))) {
        violations.push({ kind: 'link_domain', ruleId: 'allowedLinkDomains', severity: 'block', message: `Link domain "${host}" is not on this brand's allowed list.` });
      }
    }
  }

  // ── Approved CTAs ─────────────────────────────────────────────────────────────────────────
  if (content.hasOffer && rules.approvedOffers.length > 0) {
    const usesApproved = rules.approvedOffers.some((o) => body.toLowerCase().includes(o.cta.toLowerCase()));
    if (!usesApproved) {
      violations.push({ kind: 'unapproved_cta', ruleId: 'approvedOffers', severity: 'warn', message: 'Content presents an offer but uses none of the approved CTAs.' });
    }
  }

  // ── AI provenance (spec 8.4) ──────────────────────────────────────────────────────────────
  if (content.aiGenerated) {
    const ai = content.ai;
    if (!ai || !ai.model || !ai.promptVersion) {
      violations.push({ kind: 'ai_provenance', ruleId: 'aiProvenance', severity: 'block', message: 'AI-generated content must record the model and prompt version that produced it.' });
    }
    if (!ai?.humanApproved) {
      violations.push({ kind: 'ai_unapproved', ruleId: 'aiProvenance', severity: 'block', message: 'AI-generated content has not been approved by a human.' });
    }
  }

  // ── Required approvers ────────────────────────────────────────────────────────────────────
  const requiredApproverRoles = Array.from(new Set(
    rules.requiredApprovers
      .filter((a) => a.forContent.some((k) => content.kinds.includes(k)))
      .map((a) => a.role),
  ));

  return {
    ok: violations.every((v) => v.severity !== 'block'),
    rulesVersion: rules.version,
    violations,
    requiredApproverRoles,
  };
}
