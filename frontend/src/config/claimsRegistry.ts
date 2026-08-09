/**
 * claimsRegistry.ts — the single source of truth for every public marketing claim
 * on enterprise.colaberry.ai.
 *
 * WHY THIS EXISTS
 * A design audit (docs/enterprise-site-v2-preview/CLAIMS_AUDIT.md) found unverified
 * claims hardcoded as string literals across public pages: an Anthropic partner
 * designation with no evidence in the repo, a credential the code's own comments
 * concede is exam *preparation*, volume figures that contradict each other, and
 * three fabricated case studies with invented quotations. Scattered literals cannot
 * be governed — so public copy now resolves through this registry instead.
 *
 * TWO INDEPENDENT GATES
 *   1. verification — is the CLAIM true and evidenced?      (VerificationStatus)
 *   2. capability   — does the THING it describes exist?    (CapabilityStatus)
 *
 * A claim must pass BOTH to render publicly. They are separate because a perfectly
 * true sentence about an unbuilt feature is still a false impression: per the
 * build-then-show decision (BUILD_PLAN §0, option A), unbuilt capability must not
 * be described in the present tense.
 *
 * Use `publicClaim(key)` in components. It returns null when a claim may not ship,
 * so the failure mode is silence, never an unverified assertion.
 */

export type VerificationStatus =
  /** Evidenced, and the evidence is named in `evidenceSource`. */
  | 'VERIFIED'
  /** Plausible but unevidenced. Never renders publicly until someone verifies it. */
  | 'NEEDS_VERIFICATION'
  /** Legitimately hypothetical. Renders ONLY with a visible illustrative label. */
  | 'ILLUSTRATIVE'
  /** Unverifiable, misattributed, legally risky, or fabricated. Hard block. */
  | 'DO_NOT_PUBLISH';

export type CapabilityStatus =
  /** Shipped and reachable in production today. */
  | 'live'
  /** Exists partially, or only behind auth/admin. Describe carefully, never oversell. */
  | 'partial'
  /** Does not exist. Must not be described in the present tense. */
  | 'unbuilt'
  /** The claim is not about a product surface at all (e.g. a company fact). */
  | 'n/a';

export interface Claim {
  /** Stable lookup key. Never rename; retire instead. */
  readonly key: string;
  /** The exact words that may appear publicly. */
  readonly publicWording: string;
  readonly verification: VerificationStatus;
  readonly capability: CapabilityStatus;
  /** Where the proof lives. Required for VERIFIED; explains the gap otherwise. */
  readonly evidenceSource: string;
  /** Person accountable for keeping this true. */
  readonly owner: string;
  /** ISO date the status was last checked. */
  readonly lastVerifiedAt: string;
  /** Routes permitted to render it. `['*']` = anywhere public. */
  readonly approvedRoutes: readonly string[];
  /** When true, any figure shown alongside needs a visible sample-data marker. */
  readonly requiresSampleLabel: boolean;
  /** Why this status — kept so the next reader does not have to re-derive it. */
  readonly note?: string;
}

/* ────────────────────────────────────────────────────────────────────────────
   THE REGISTRY
   Seeded from CLAIMS_AUDIT.md. Pricing verified by probing the live site on
   2026-08-07 — deliberately NOT taken from the repo, which carries $1,788 while
   production shows $149/$199 per month and $1,200/$950 seat tiers.
   ──────────────────────────────────────────────────────────────────────────── */

export const CLAIMS: readonly Claim[] = [
  /* ── company facts ─────────────────────────────────────────────────────── */
  {
    key: 'company.name',
    publicWording: 'Colaberry Enterprise AI',
    verification: 'VERIFIED',
    capability: 'n/a',
    evidenceSource: 'Company name; self-evident.',
    owner: 'Ali',
    lastVerifiedAt: '2026-08-07',
    approvedRoutes: ['*'],
    requiresSampleLabel: false,
  },
  {
    key: 'positioning.primary',
    publicWording: 'Build the system. Build the people. Prove the capability.',
    verification: 'VERIFIED',
    capability: 'n/a',
    evidenceSource: 'Positioning statement, not a factual assertion.',
    owner: 'Ram',
    lastVerifiedAt: '2026-08-07',
    approvedRoutes: ['*'],
    requiresSampleLabel: false,
  },

  /* ── partner / credential: the highest-exposure items ──────────────────── */
  {
    key: 'anthropic.partner',
    publicWording: 'Anthropic / Claude Code partner',
    verification: 'DO_NOT_PUBLISH',
    capability: 'n/a',
    evidenceSource:
      'NONE FOUND. No contract, config, badge asset or authorization in the repo. ' +
      'Partner Network application recorded as submitted 2026-06-24; admission not evidenced.',
    owner: 'Ali',
    lastVerifiedAt: '2026-08-07',
    approvedRoutes: [],
    requiresSampleLabel: false,
    note:
      'Appears live at HomePage.tsx:126. Third-party trademark and programme asserted ' +
      'without located authorization. Use claim `anthropic.capability` instead until ' +
      'written confirmation exists.',
  },
  {
    key: 'anthropic.capability',
    publicWording: 'We build on Claude and Claude Code.',
    verification: 'VERIFIED',
    capability: 'live',
    evidenceSource: 'Statement of what we build with, not of affiliation.',
    owner: 'Ali',
    lastVerifiedAt: '2026-08-07',
    approvedRoutes: ['*'],
    requiresSampleLabel: false,
    note: 'Safe replacement for `anthropic.partner`.',
  },
  {
    key: 'credential.cca',
    publicWording: 'Certified Anthropic AI Systems Architect',
    verification: 'DO_NOT_PUBLISH',
    capability: 'partial',
    evidenceSource:
      'personaContent.ts:15-16 concedes internally that this is "(CCA-F prep)". ' +
      'The credential is issued by the certifying body, not by Colaberry.',
    owner: 'Ali',
    lastVerifiedAt: '2026-08-07',
    approvedRoutes: [],
    requiresSampleLabel: false,
    note: '32 occurrences on origin/main present this as a credential learners earn.',
  },
  {
    key: 'credential.cca.safe',
    publicWording:
      'Claude Certified Architect, Foundations — certification preparation, aligned to the ' +
      'official Claude architect domains. The credential is issued by the certifying body.',
    verification: 'VERIFIED',
    capability: 'live',
    evidenceSource: 'Accurate description of prep-course scope.',
    owner: 'Ali',
    lastVerifiedAt: '2026-08-07',
    approvedRoutes: ['*'],
    requiresSampleLabel: false,
  },

  /* ── track record: plausible, unevidenced ──────────────────────────────── */
  {
    key: 'trackrecord.careers',
    publicWording: '5,000+ careers launched',
    verification: 'NEEDS_VERIFICATION',
    capability: 'n/a',
    evidenceSource:
      'No source located. Also conflicts with MembershipLanding.tsx:33 ("10,000+ trained").',
    owner: 'Ali',
    lastVerifiedAt: '2026-08-07',
    approvedRoutes: [],
    requiresSampleLabel: false,
    note: 'Needs a defined counting method (enrolled? graduated? placed?) and a date range.',
  },
  {
    key: 'trackrecord.since2012',
    publicWording: 'Since 2012',
    verification: 'NEEDS_VERIFICATION',
    capability: 'n/a',
    evidenceSource: 'Almost certainly the founding year; not confirmed against incorporation records.',
    owner: 'Ali',
    lastVerifiedAt: '2026-08-07',
    approvedRoutes: [],
    requiresSampleLabel: false,
  },
  {
    key: 'trackrecord.wageimpact',
    publicWording: '$100M+ in wage impact generated',
    verification: 'NEEDS_VERIFICATION',
    capability: 'n/a',
    evidenceSource: 'No methodology located.',
    owner: 'Ali',
    lastVerifiedAt: '2026-08-07',
    approvedRoutes: [],
    requiresSampleLabel: false,
    note: 'Unsourced economic-impact figures are the least defensible category of claim.',
  },
  {
    key: 'research.95pct',
    publicWording: '95% of AI pilots fail',
    verification: 'NEEDS_VERIFICATION',
    capability: 'n/a',
    evidenceSource: 'Thesis of "Trust Before Intelligence" (Katamaraja). Must be attributed on-page.',
    owner: 'Ram',
    lastVerifiedAt: '2026-08-07',
    approvedRoutes: [],
    requiresSampleLabel: false,
    note: 'May ship once rendered as an attributed citation rather than a bare fact.',
  },
  {
    key: 'research.roi477',
    publicWording: 'a documented jump from 28 to 85, and 477% ROI in 90 days',
    verification: 'DO_NOT_PUBLISH',
    capability: 'n/a',
    evidenceSource: 'A case study INSIDE the book, not a Colaberry client outcome.',
    owner: 'Ram',
    lastVerifiedAt: '2026-08-07',
    approvedRoutes: [],
    requiresSampleLabel: false,
    note: 'Rendered next to platform copy it reads as our result. "Documented" makes it factual.',
  },

  /* ── pricing: verified against the LIVE site, not the repo ─────────────── */
  {
    key: 'pricing.free',
    publicWording: 'Free to start — no credit card',
    verification: 'VERIFIED',
    capability: 'live',
    evidenceSource: 'Live probe of enterprise.colaberry.ai/pricing, 2026-08-07.',
    owner: 'Ali',
    lastVerifiedAt: '2026-08-07',
    approvedRoutes: ['/pricing', '/', '/try'],
    requiresSampleLabel: false,
  },
  {
    key: 'pricing.individual.annual',
    publicWording: '$149/month, billed annually',
    verification: 'VERIFIED',
    capability: 'live',
    evidenceSource: 'Live probe, 2026-08-07.',
    owner: 'Ali',
    lastVerifiedAt: '2026-08-07',
    approvedRoutes: ['/pricing', '/'],
    requiresSampleLabel: false,
  },
  {
    key: 'pricing.individual.monthly',
    publicWording: '$199/month, month-to-month',
    verification: 'VERIFIED',
    capability: 'live',
    evidenceSource: 'Live probe, 2026-08-07.',
    owner: 'Ali',
    lastVerifiedAt: '2026-08-07',
    approvedRoutes: ['/pricing'],
    requiresSampleLabel: false,
  },
  {
    key: 'pricing.team',
    publicWording: 'Team — $1,200',
    verification: 'VERIFIED',
    capability: 'live',
    evidenceSource: 'Live probe, 2026-08-07.',
    owner: 'Ali',
    lastVerifiedAt: '2026-08-07',
    approvedRoutes: ['/pricing'],
    requiresSampleLabel: false,
  },
  {
    key: 'pricing.department',
    publicWording: 'Department — $950',
    verification: 'VERIFIED',
    capability: 'live',
    evidenceSource: 'Live probe, 2026-08-07.',
    owner: 'Ali',
    lastVerifiedAt: '2026-08-07',
    approvedRoutes: ['/pricing'],
    requiresSampleLabel: false,
  },
  {
    key: 'pricing.services',
    publicWording: 'Scoped on a call',
    verification: 'VERIFIED',
    capability: 'live',
    evidenceSource: 'Decision 2026-08-07: no public price for consulting engagements.',
    owner: 'Ali',
    lastVerifiedAt: '2026-08-07',
    approvedRoutes: ['*'],
    requiresSampleLabel: false,
  },
  {
    key: 'pricing.retired.4500',
    publicWording: '$4,500',
    verification: 'DO_NOT_PUBLISH',
    capability: 'n/a',
    evidenceSource: 'Offer retired 2026-07-13. Still present at AlumniChampionPage.tsx:131.',
    owner: 'Ali',
    lastVerifiedAt: '2026-08-07',
    approvedRoutes: [],
    requiresSampleLabel: false,
  },
  {
    key: 'pricing.repo.1788',
    publicWording: '$1,788 per seat, per year',
    verification: 'DO_NOT_PUBLISH',
    capability: 'n/a',
    evidenceSource:
      'Present in origin/main (PricingPage/HomePage/SponsorshipPage) but NOT on the live ' +
      'site. Live shows $149/$199 per month and $1,200/$950 tiers.',
    owner: 'Ali',
    lastVerifiedAt: '2026-08-07',
    approvedRoutes: [],
    requiresSampleLabel: false,
    note: 'Third confirmed production/origin-main divergence. Do not ship the repo figure.',
  },

  /* ── product surfaces: capability gate does the work here ──────────────── */
  {
    key: 'surface.readiness.rollup',
    publicWording: 'One dashboard shows organization AI readiness, movement and the evidence behind it.',
    verification: 'VERIFIED',
    capability: 'live',
    evidenceSource: 'frontend/src/services/orgApi.ts (OrgOverview); pages/portal/company/CompanyPage.tsx.',
    owner: 'Eng',
    lastVerifiedAt: '2026-08-07',
    approvedRoutes: ['*'],
    requiresSampleLabel: true,
  },
  {
    key: 'surface.free.workspace',
    publicWording: 'A free company workspace: the learner view and the manager view in one account.',
    verification: 'VERIFIED',
    capability: 'live',
    evidenceSource: 'frontend/src/pages/ManagementPreviewPage.tsx, routed at /try.',
    owner: 'Eng',
    lastVerifiedAt: '2026-08-07',
    approvedRoutes: ['*'],
    requiresSampleLabel: true,
  },
  {
    key: 'surface.fourview.console',
    publicWording: 'Four roles, one system — executive, builder, architect and proof views.',
    verification: 'VERIFIED',
    capability: 'unbuilt',
    evidenceSource: 'No match for "Executive View" in frontend/src. Confirmed unbuilt 2026-08-07.',
    owner: 'Eng',
    lastVerifiedAt: '2026-08-07',
    approvedRoutes: ['*'],
    requiresSampleLabel: true,
    note:
      'The SENTENCE is true of the intended product; the CAPABILITY does not exist. ' +
      'Build-then-show (decision A) blocks it on capability, not verification. This is ' +
      'exactly why the two gates are separate.',
  },
  {
    key: 'surface.opportunity.lab',
    publicWording: 'Map an AI opportunity in five steps and get a scored assessment.',
    verification: 'VERIFIED',
    capability: 'unbuilt',
    evidenceSource: 'No backend located. ExecutiveROICalculatorPage.tsx makes 0 /api/ calls.',
    owner: 'Eng',
    lastVerifiedAt: '2026-08-07',
    approvedRoutes: ['*'],
    requiresSampleLabel: true,
  },
  {
    key: 'surface.proof.room',
    publicWording: 'Every proof record carries its evidence class and the evidence behind it.',
    verification: 'VERIFIED',
    capability: 'unbuilt',
    evidenceSource: 'No evidence_class taxonomy in backend/src.',
    owner: 'Eng',
    lastVerifiedAt: '2026-08-07',
    approvedRoutes: ['*'],
    requiresSampleLabel: true,
  },

  /* ── fabricated content: hard blocks ───────────────────────────────────── */
  {
    key: 'casestudy.fabricated',
    publicWording: '(three case studies with invented client quotations)',
    verification: 'DO_NOT_PUBLISH',
    capability: 'n/a',
    evidenceSource:
      'CaseStudiesPage.tsx — the file header concedes entries are illustrative, but nothing ' +
      'on the rendered page says so. Still listed in sitemap.xml and still ingested by ' +
      'admissionsKnowledgeSyncAgent.ts:25 as fact.',
    owner: 'Ali',
    lastVerifiedAt: '2026-08-07',
    approvedRoutes: [],
    requiresSampleLabel: false,
    note: 'Delete the component, purge the sitemap entry, remove it from the agent knowledge source.',
  },
  {
    key: 'testimonial.undisclosed',
    publicWording: '(anonymous testimonials with hard dollar figures)',
    verification: 'DO_NOT_PUBLISH',
    capability: 'n/a',
    evidenceSource: 'PricingPage.tsx:127-133 and PilotExclusivePage.tsx:161. No consent located.',
    owner: 'Ali',
    lastVerifiedAt: '2026-08-07',
    approvedRoutes: [],
    requiresSampleLabel: false,
  },
  {
    key: 'thirdparty.networks',
    publicWording: '(Vistage, EOS, ActionCOACH, C12 Group, Magna, Scaling Up, Pinnacle)',
    verification: 'DO_NOT_PUBLISH',
    capability: 'n/a',
    evidenceSource: 'AIXceleratorLandingPage.tsx:60-67. Real trademarks, no stated relationship.',
    owner: 'Ali',
    lastVerifiedAt: '2026-08-07',
    approvedRoutes: [],
    requiresSampleLabel: false,
    note: 'Trademark use plus implied endorsement.',
  },
] as const;

/* ────────────────────────────────────────────────────────────────────────────
   ACCESSORS
   ──────────────────────────────────────────────────────────────────────────── */

const BY_KEY: ReadonlyMap<string, Claim> = new Map(CLAIMS.map((c) => [c.key, c]));

export function getClaim(key: string): Claim | undefined {
  return BY_KEY.get(key);
}

/** A claim may ship publicly only if BOTH gates pass. */
export function isPublishable(claim: Claim): boolean {
  const verificationOk = claim.verification === 'VERIFIED' || claim.verification === 'ILLUSTRATIVE';
  const capabilityOk = claim.capability !== 'unbuilt';
  return verificationOk && capabilityOk && claim.approvedRoutes.length > 0;
}

export function isApprovedForRoute(claim: Claim, route: string): boolean {
  return claim.approvedRoutes.includes('*') || claim.approvedRoutes.includes(route);
}

/**
 * Resolve a claim for public rendering.
 * Returns null when it must not ship — so a component that forgets to handle the
 * null renders nothing, rather than rendering an unverified assertion.
 *
 * In development an explanatory warning is logged; in production it fails silently.
 */
export function publicClaim(key: string, route?: string): string | null {
  const claim = BY_KEY.get(key);
  if (!claim) {
    if (process.env.NODE_ENV !== 'production') {
      console.warn(`[claims] unknown claim key "${key}" — nothing rendered.`);
    }
    return null;
  }
  if (!isPublishable(claim)) {
    if (process.env.NODE_ENV !== 'production') {
      console.warn(
        `[claims] "${key}" blocked — verification=${claim.verification}, ` +
          `capability=${claim.capability}. ${claim.note ?? ''}`,
      );
    }
    return null;
  }
  if (route && !isApprovedForRoute(claim, route)) {
    if (process.env.NODE_ENV !== 'production') {
      console.warn(`[claims] "${key}" is not approved for route "${route}".`);
    }
    return null;
  }
  return claim.publicWording;
}

/** Every claim currently barred from public rendering, with the reason. */
export function blockedClaims(): readonly Claim[] {
  return CLAIMS.filter((c) => !isPublishable(c));
}

/** Claims whose surrounding figures must carry a visible sample-data marker. */
export function requiresSampleLabel(key: string): boolean {
  return BY_KEY.get(key)?.requiresSampleLabel ?? false;
}
