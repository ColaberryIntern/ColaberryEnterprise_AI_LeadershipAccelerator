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
  /**
   * Rests on the business owner's direct, first-hand knowledge rather than on a
   * query anyone can re-run. Publishable, because the owner is a real and
   * accountable source — but deliberately NOT labelled VERIFIED, so that an
   * audit can tell the two apart at a glance.
   *
   * Use this only where the owner's knowledge genuinely exceeds the records, and
   * say so in `evidenceSource`: name the traceable figure, the gap, and who
   * attested to it. It is not a way to launder an unevidenced number — a claim
   * nobody can stand behind is still NEEDS_VERIFICATION.
   */
  | 'OWNER_ATTESTED'
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
    /*
     * A product fact rather than an outcome claim: how long the path is. Safe
     * because it describes what we run, not what it achieved for anyone.
     */
    key: 'program.duration',
    publicWording: '12 weeks',
    verification: 'VERIFIED',
    capability: 'live',
    evidenceSource:
      'curriculum_blueprints carries week blueprints 0-12, and the live site states a ' +
      '"12-week path to Architect" on enterprise.colaberry.ai/program (read 2026-08-12).',
    owner: 'Eng',
    lastVerifiedAt: '2026-08-12',
    approvedRoutes: ['*'],
    requiresSampleLabel: false,
  },
  {
    /*
     * Company tenure, replacing the programme-length tile at Ali's direction.
     *
     * OWNER_ATTESTED rather than VERIFIED: no query in this repo returns a
     * founding date. What supports it is Colaberry's own brand guide, which
     * states the company has been "proven since 2012" -- that is the company
     * asserting its own history, which is exactly what OWNER_ATTESTED is for.
     *
     * The wording is deliberately CONSERVATIVE. 2012 to 2026 is fourteen years,
     * so "12+ years" understates it and cannot be overtaken by the calendar the
     * way a fixed "Since 2012" would drift out of step with a stale page.
     *
     * Note for whoever revisits this: the literal string "Since 2012" is on the
     * homepage's blocked list and HomeV2.test.tsx fails the build if it appears.
     * This claim does not use it, and should not be rewritten into it.
     */
    key: 'company.tenure',
    /*
     * The FIGURE only. "Consulting and Training 12+ years" was measured at 33
     * characters and wrapped to two lines in a quarter-width column at every
     * size down to 17px, so it could never sit on one line the way the other
     * three tiles do. The words move to the tile label, which is how the other
     * three are already built -- "1,000+ hires" over "tracked hires plus those
     * we know of". Same claim on screen, read as one sentence, and the figure
     * can now be set at a size that matches the band.
     */
    publicWording: '12+ years',
    verification: 'OWNER_ATTESTED',
    capability: 'live',
    evidenceSource:
      'Colaberry brand guide (colaberry-design-system/BRAND.md, read 2026-08-18) states the '
      + 'company is "proven since 2012". Owner-attested company history; 2012 to 2026 is '
      + 'fourteen years, so the published "12+" is deliberately conservative.',
    owner: 'Ali',
    lastVerifiedAt: '2026-08-18',
    approvedRoutes: ['*'],
    requiresSampleLabel: false,
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
      'Measured 2026-08-13 and the wording does not survive it. CCPP shows 8,588 distinct ' +
      'students enrolled, 2,844 certified, and 691 with a HiredDate. "Careers launched" ' +
      'most naturally means the last of those, which is 691 -- so "5,000+ careers launched" ' +
      'overstates the outcome by roughly an order of magnitude, even though 5,000+ would be ' +
      'an understatement of ENROLMENT. Also still conflicts with MembershipLanding.tsx:33 ' +
      '("10,000+ trained").',
    owner: 'Ali',
    lastVerifiedAt: '2026-08-13',
    approvedRoutes: [],
    requiresSampleLabel: false,
    note:
      'Superseded rather than fixed. Use trackrecord.students (enrolment) or ' +
      'trackrecord.certified (completion), both VERIFIED with their method stated. ' +
      'A hires figure would need HiredDate provenance checked first.',
  },
  {
    key: 'trackrecord.since2012',
    publicWording: 'Teaching this since 2012',
    verification: 'VERIFIED',
    capability: 'n/a',
    evidenceSource:
      'CCPP dbo.ADF_ClassSignups, read-only query 2026-08-13: earliest StartDate is ' +
      '2012-04-07 and earliest InsertDate is 2012-06-02, with enrolments recorded in every ' +
      'year from 2012 to 2026. Independently corroborated by Ali Muwwakkil, who built ' +
      'app.colaberry.com and taught the first classes.',
    owner: 'Ali',
    lastVerifiedAt: '2026-08-13',
    approvedRoutes: ['*'],
    requiresSampleLabel: false,
  },
  {
    /*
     * The counting method is IN the wording, which is what `trackrecord.careers`
     * lacked. "Students enrolled" is a fact about our records; "careers
     * launched" is a claim about outcomes, and the two differ by an order of
     * magnitude (see that claim's note).
     */
    key: 'trackrecord.students',
    // Rounded DOWN from the verified 8,588 at Ali's direction 2026-08-15. Rounding
    // down keeps a verified claim verified: the true figure exceeds what we print.
    publicWording: '8k+ data students',
    verification: 'VERIFIED',
    capability: 'n/a',
    evidenceSource:
      'CCPP dbo.ADF_ClassSignups, read-only query 2026-08-13: COUNT(DISTINCT StudentID) = ' +
      '8,588 across 13,964 signup rows, spanning StartDate 2012-04-07 to 2026-07-16. ' +
      'Definition: distinct people who enrolled in a class, not graduates and not hires.',
    owner: 'Ali',
    lastVerifiedAt: '2026-08-13',
    approvedRoutes: ['*'],
    requiresSampleLabel: false,
    note: 'Re-run the query before quoting; the figure grows. Last read 2026-08-13.',
  },
  {
    key: 'trackrecord.certified',
    // Rounded DOWN from the verified 2,844 at Ali's direction 2026-08-15.
    publicWording: '2,500+ certified',
    verification: 'VERIFIED',
    capability: 'n/a',
    evidenceSource:
      'CCPP dbo.ADF_ClassSignups, read-only query 2026-08-13: COUNT(DISTINCT StudentID) ' +
      'where CertifiedDate IS NOT NULL = 2,844.',
    owner: 'Ali',
    lastVerifiedAt: '2026-08-13',
    approvedRoutes: ['*'],
    requiresSampleLabel: false,
  },
  {
    /*
     * THE ONE CLAIM ON THIS SITE THAT EXCEEDS ITS DATABASE FIGURE, and it is
     * recorded that way on purpose rather than dressed up as a query result.
     *
     * CCPP can verify 691. `HiredDate` is populated only when a student reported
     * back, so it is structurally an undercount -- it measures who told us, not
     * who got hired. Ali, who built app.colaberry.com and taught these classes
     * from 2012, attests to at least 300 further hires known to him and never
     * recorded, which puts the real figure at ~1,000 and rising.
     *
     * So the evidence class is OWNER_ATTESTED, not VERIFIED: it rests on the
     * owner's direct knowledge of the business, which is a real basis, but not
     * the same basis as a query anyone can re-run. Anyone auditing this later
     * should know which of the two they are looking at. I raised the gap before
     * publishing; Ali approved it explicitly on 2026-08-15 with that reasoning.
     */
    key: 'trackrecord.hired',
    publicWording: '1,000+ hires',
    verification: 'OWNER_ATTESTED',
    capability: 'n/a',
    evidenceSource:
      'CCPP dbo.ADF_ClassSignups, read-only query 2026-08-13: COUNT(DISTINCT StudentID) ' +
      'where HiredDate IS NOT NULL = 691 -- a floor, since HiredDate is set only when a ' +
      'student reported back. Ali attests 2026-08-15 to at least 300 additional hires known ' +
      'to him and never recorded, and approved publishing 1,000+ on that basis.',
    owner: 'Ali',
    lastVerifiedAt: '2026-08-15',
    approvedRoutes: ['*'],
    requiresSampleLabel: false,
    note:
      'Owner-attested, not query-verified. The 691 in CCPP is the traceable floor; the ' +
      'published figure includes ~300 unreported hires Ali knows of directly.',
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
    /*
     * The attributed form of the book's thesis.
     *
     * `research.book95` carries the same statistic and stays BLOCKED, because as
     * a bare fact in our own voice it is unevidenced. Its registry note says it
     * "may ship once rendered as an attributed citation rather than a bare
     * fact" -- this key is that citation. What is verified here is not that 95%
     * of pilots fail; it is that the book says so, and that the book and its
     * author exist. Both are checkable from the published cover.
     */
    key: 'book.trust.attributed',
    publicWording:
      'Trust Before Intelligence, by Colaberry CEO Ram Katamaraja, asks why 95% of AI pilots ' +
      'fail and what the 5% do differently.',
    verification: 'VERIFIED',
    capability: 'n/a',
    evidenceSource:
      'Published cover art at enterprise.colaberry.ai/img/book-cover.jpg, read 2026-08-12: ' +
      '"A BOOK BY RAM KATAMARAJA, CEO of Colaberry Inc." and "WHY 95% OF AI PILOTS FAIL / ' +
      'HOW 5% SUCCEED". The claim is about what the book argues, not about the statistic.',
    owner: 'Ram',
    lastVerifiedAt: '2026-08-12',
    approvedRoutes: ['*'],
    requiresSampleLabel: false,
    note: 'Must stay attributed. Stripping the attribution turns it back into research.book95.',
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
    /*
     * The story-build pipeline. VERIFIED because it is running in production and
     * every element of the wording was checked against the code that implements
     * it, not against a description of it.
     *
     * The wording is deliberately narrow. It says the platform PLANS, PROMPTS
     * and VERIFIES. It does not say the platform builds, because it does not:
     * `renderDocs.ts` emits markdown and JSON, and `repoWriter.ts` is
     * path-allowlisted to docs/**, CLAUDE.md and .colaberry/** and throws on any
     * other path. A claim that the platform writes the code would be false and
     * trivially disprovable by any customer who opened their own repo.
     */
    key: 'surface.storybuild',
    publicWording:
      'A build plan generated from your idea, written into your own repository, and verified ' +
      'against your commits.',
    verification: 'VERIFIED',
    capability: 'live',
    evidenceSource:
      'backend/src/services/sbp/ (34-file pipeline: intake -> decompose -> planGate -> ' +
      'planRepair -> materializeTasks -> renderDocs -> repoWriter). Live in production behind ' +
      'SBP_PIPELINE_ENABLED (on since 2026-08-10) and PROJECT_API_ENABLED. Verification rule ' +
      'in docs/BUILD_VERIFICATION_CONTRACT.md: a story is verified when every acceptance ' +
      'criterion is passed in .colaberry/progress.json AND a commit exists that changed at ' +
      'least one file and names the story. 20 published builds in the July 2026 cohort as of ' +
      '2026-08-17; screenshot captured from one of them.',
    owner: 'Ali',
    lastVerifiedAt: '2026-08-17',
    approvedRoutes: ['*'],
    requiresSampleLabel: false,
    note:
      'Must never be reworded to say the platform builds the project or writes code. Scope is ' +
      'plan, prompt and verify. Also barred: OAuth/GitHub-App/one-click wording (it is a ' +
      'proof-of-push challenge on a repo the builder brings), and any claim that tests verify ' +
      'the work (CI passing is explicitly not the bar). The loop is days old in production, so ' +
      'no "battle-tested" or scale claims.',
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

/**
 * Statuses that may appear on the public site.
 *
 * OWNER_ATTESTED is publishable because the owner is a real, accountable source
 * — but it is tracked as its own status rather than folded into VERIFIED, so
 * "what can we prove with a query?" and "what does Ali stand behind?" stay
 * separable. The Proof Room counts on that distinction.
 */
const PUBLISHABLE_VERIFICATION: readonly VerificationStatus[] = [
  'VERIFIED',
  'OWNER_ATTESTED',
  'ILLUSTRATIVE',
];

/** A claim may ship publicly only if BOTH gates pass. */
export function isPublishable(claim: Claim): boolean {
  const verificationOk = PUBLISHABLE_VERIFICATION.includes(claim.verification);
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
