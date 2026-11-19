/**
 * productFeatureCatalog — what the PRODUCT can already do, as opposed to what a tool is
 * registered to do. PURE, no I/O.
 *
 * AF11.9. Ali, 16 Nov 2026: *"1st Sarbjit would need to create a landing page in the app to see
 * how it works and make sure she can build it how she wants. If that functionality does not
 * exist, she has to put the request in."*
 *
 * ## THE GAP THIS CLOSES, AND WHY AF11.2 CANNOT CLOSE IT
 *
 * AF11.2's duplicate check compares a request against **registered tools** — the names compiled
 * into the backend and listed at `/admin/tools`. That is a different question from "can the
 * product already do this?", and the difference is worth money.
 *
 * Measured on main, 17 Nov 2026: `backend/src/routes/admin/landingPageRoutes.ts` registers TEN
 * routes across nine paths, including create, revise, preview, publish and unpublish, and the
 * preview renders the real page through the same code the public route uses. **No agent has been
 * granted any of it**, so it is not a registered tool, and AF11.2 would wave a "build me a
 * landing page tool" request straight through to a build. We would have paid to build something
 * we already own.
 *
 * ## WHY THIS LIST IS CURATED AND NOT DERIVED, said plainly
 *
 * There is no index of product features. Deriving one from route files would produce a list of
 * HTTP endpoints, and an endpoint is not a capability: `PATCH /api/admin/landing-pages/:id` and
 * "draft a landing page from a brief" are not the same claim, and a builder reading the first
 * cannot tell whether the second is possible.
 *
 * So this is a hand-written list, each entry carrying the route file that backs it and the date
 * somebody checked. A short correct list beats a generated wrong one: a front door that says
 * "already in the app" about something that is not there sends a builder to a screen that does
 * not exist, and they will not trust the next answer either.
 *
 * **It is deliberately incomplete, and the API says so.** `coverage` reports how many domains
 * have been curated, so a builder in a domain nobody has got to yet is told "we have not mapped
 * your domain yet" rather than "nothing exists", which are very different facts.
 *
 * ## THE FOUR STATES ARE THE WHOLE POINT
 *
 * They are not a label on a feature; they decide the path before a request is written:
 *
 *   - `in_app`  the feature is there and works, and there is a SCREEN. The answer is never
 *               "write a request": go use it, confirm it does what you need, then ask for the
 *               agent to be GRANTED the thing you just used. Routes to AF11.4.
 *   - `partly`  the endpoint exists and whether an agent may ever call it is a separate
 *               decision. Publishing a landing page puts something on the public internet.
 *               Routes to Ali as a ruling, not a build.
 *   - `api_only` the platform HAS the endpoint and there is no screen over it, so the builder
 *               cannot do it by hand at all. Routes to a SCREEN request, which is a far smaller
 *               build than the capability behind it.
 *   - `not_built` a genuine build request. Routes to the AF11.7 scope sheet.
 *
 * `partly` is the state that earns its keep. Without it every risky feature is either waved
 * through as "already there" or rebuilt as "not there", and the question that actually matters —
 * may an agent do this unsupervised — never gets asked.
 *
 * ## WHY `api_only` WAS ADDED, 18 NOV 2026, and what it stopped us doing
 *
 * Curating the four unmapped domains turned up a case the three states could not describe
 * honestly. `admissionsRoutes.ts` registers nine routes, two of them writes against the
 * admissions knowledge base. `AdminAdmissionsTab.tsx` calls seven of the nine and **every call it
 * makes is a read** — the two write endpoints have no screen anywhere in the frontend.
 *
 * Both available answers were wrong, in opposite and expensive directions:
 *
 *   - `in_app` would have sent a builder to a door that does not exist. The front door's own
 *     rendering offers *"Go and use it"* as a link to `product_route`, and the whole ladder starts
 *     with doing the thing by hand. There is nothing to click, so the first stage would stall with
 *     no explanation and the next answer the page gave would not be believed either.
 *   - `not_built` would have put a capability we already own into a scope sheet, which is the
 *     exact loss this file was written to prevent, just one layer further in.
 *
 * The real answer is "we own the hard part and we are missing the easy part", and that is worth
 * saying out loud because it is a different SIZE of build. It is also the state that fills the
 * gap queue with cheap wins rather than only expensive ones.
 *
 * It is the one state whose `implies_tried_in_product` is not null. Everywhere else the product
 * having a feature is deliberately NOT the builder having used it, because trying it is what
 * produces the answer. Here trying it is impossible, so `exists_unused` is a measured fact about
 * the product rather than a guess about the builder.
 */

import type { ToolProductState } from '../../db/ensureAgentDomainToolRequestSchema';

/** One thing the product can do, in a builder's words rather than in endpoints. */
export interface ProductFeature {
  /** Stable id, so a request can record which feature it was checked against. */
  readonly feature_key: string;
  /** `domain_key` on `agent_domain_projects`. */
  readonly domain_key: string;
  /** What a builder would call it. */
  readonly label: string;
  /** What it actually does, in one line, so "already there" can be checked rather than believed. */
  readonly what_it_does: string;
  /**
   * The split, and the AF11.7 field it writes.
   *
   * `in_app` and `partly` both mean the product has it AND there is a screen; they differ in
   * whether an AGENT may be let near it without a separate ruling. `api_only` means the platform
   * owns the endpoint and nobody built a screen, so the builder cannot do it by hand yet.
   */
  readonly state: 'in_app' | 'partly' | 'api_only';
  /**
   * Where to go and use it. A front door that cannot point at the door is a sign, not a door.
   *
   * CHECKED BY A TEST against the real router, because two of the five original entries pointed
   * at `/admin/landing-pages`, which has never been a route — the page is at
   * `/admin/marketing/landing-pages`. The file warned about exactly this failure in prose and
   * then shipped it twice, which is the argument for checking it instead of proof-reading it.
   *
   * On an `api_only` feature this is the page the screen BELONGS ON, which does exist; it is the
   * control on it that does not. `product_route_note` says what is missing.
   */
  readonly product_route: string;
  /**
   * The bit a URL cannot carry: which tab to click, or what is absent. Null when the route lands
   * the builder exactly where they need to be.
   *
   * Admissions needed this. Its surface is a tab inside `/admin/ai-settings` whose selection is
   * local component state with no query parameter, so the honest instruction is the route plus
   * the tab's name, and a route alone would drop somebody on the Overview tab.
   */
  readonly product_route_note: string | null;
  /** The route file that backs the claim, so the next reader can check it rather than trust it. */
  readonly backed_by: string;
  /** When a human last checked that this is true. A claim with no date goes stale invisibly. */
  readonly verified_on: string;
  /**
   * Why it is `partly`, and null when it is not.
   *
   * On an `api_only` feature this carries what the SCREEN has to let somebody do, because that is
   * the request Ali is being handed and "build a screen" is not a specification.
   */
  readonly ruling_needed: string | null;
  /**
   * The phrases that identify this feature, written out rather than inferred from the label.
   *
   * INFERRING FROM THE LABEL WAS THE FIRST ATTEMPT AND IT WAS WRONG. Requiring every word of
   * "Draft a landing page" to appear meant "create a landing page from a brief" did not match,
   * because the builder said "create" and the label said "draft" — so the front door told
   * somebody to write a scope sheet for a feature sitting right there. A label is written for a
   * reader; the words a builder will actually type are a separate thing and are listed here.
   *
   * A phrase matches when EVERY word in it appears in the candidate, and the LONGEST matching
   * phrase wins, so "publish a landing page" resolves to publishing rather than to drafting.
   */
  readonly matches: ReadonlyArray<string>;
}

/**
 * The curated list. LANDING PAGES FIRST, because that is the worked case in the ticket and the
 * one that proved the gap.
 *
 * Adding an entry is a claim that somebody opened the product and used the thing. Put the date in
 * `verified_on` and the route file in `backed_by`, or leave it out.
 */
export const PRODUCT_FEATURES: ReadonlyArray<ProductFeature> = Object.freeze([
  {
    feature_key: 'marketing.landing_page.draft',
    matches: ['landing page', 'landing pages'],
    domain_key: 'marketing',
    label: 'Draft a landing page',
    what_it_does:
      'Create a landing page, have a name suggested, revise it, and preview the real rendered '
      + 'page before anybody sees it.',
    state: 'in_app',
    // CORRECTED 2026-11-18. This said `/admin/landing-pages`, which is not and never has been a
    // route; `adminRoutes.tsx` mounts the page at `/admin/marketing/landing-pages`. A test now
    // checks every route in this file against the router.
    product_route: '/admin/marketing/landing-pages',
    product_route_note: null,
    backed_by: 'backend/src/routes/admin/landingPageRoutes.ts (create, suggest-name, revise, patch, preview, list)',
    verified_on: '2026-11-18',
    ruling_needed: null,
  },
  {
    feature_key: 'marketing.landing_page.publish',
    matches: ['publish landing page', 'unpublish landing page', 'publish page'],
    domain_key: 'marketing',
    label: 'Publish a landing page',
    what_it_does: 'Put a drafted landing page on the public internet, and take it down again.',
    // PARTLY, and this is the entry that shows why the middle state exists. The endpoint works
    // perfectly. Whether an AGENT may call it is a different question with a different answer.
    state: 'partly',
    // CORRECTED 2026-11-18, same wrong route as the entry above.
    product_route: '/admin/marketing/landing-pages',
    product_route_note: null,
    backed_by: 'backend/src/routes/admin/landingPageRoutes.ts (publish, unpublish)',
    verified_on: '2026-11-18',
    ruling_needed:
      'Publishing puts a page on the public internet under the Colaberry name. Whether an agent '
      + 'may do that without a person pressing the button is your ruling, not a build.',
  },
  {
    feature_key: 'marketing.campaign.send',
    matches: ['send campaign', 'campaign send', 'email campaign'],
    domain_key: 'marketing',
    label: 'Build and send a campaign',
    what_it_does: 'Create a campaign, preview the copy, and send it to a list.',
    state: 'partly',
    product_route: '/admin/campaigns',
    product_route_note: null,
    backed_by: 'backend/src/routes/admin/campaignRoutes.ts (73 routes)',
    verified_on: '2026-11-17',
    ruling_needed:
      'Sending reaches real people and cannot be taken back. Drafting and previewing are already '
      + 'usable; whether an agent may press send is a separate decision.',
  },
  {
    feature_key: 'product_experience.case_study.studio',
    matches: ['case study', 'case studies'],
    domain_key: 'product_experience',
    label: 'Build a case study',
    what_it_does:
      'Draft a case study from artifacts, pull quotes and charts out of it, and preview the '
      + 'rendered page.',
    state: 'in_app',
    product_route: '/admin/case-studies',
    product_route_note: null,
    backed_by: 'backend/src/routes/admin/caseStudyStudioRoutes.ts (18 routes)',
    verified_on: '2026-11-17',
    ruling_needed: null,
  },
  {
    feature_key: 'platform.tool_catalog.read',
    matches: ['tool catalog', 'which tools', 'tools granted'],
    domain_key: 'platform',
    label: 'See which tools an agent holds and whether it can use them',
    what_it_does:
      'Read the 47-tool catalog with, for each agent, whether the tool is registered, granted, '
      + 'and usable right now.',
    state: 'in_app',
    product_route: '/admin/tools',
    product_route_note: null,
    backed_by: 'backend/src/routes/admin/agentEffectiveAccessRoutes.ts',
    verified_on: '2026-11-17',
    ruling_needed: null,
  },

  // ===============================================================================================
  // THE FOUR UNMAPPED DOMAINS, curated 18 Nov 2026.
  //
  // Before this, seven of the ten domains were unmapped, so the front door answered `not_built`
  // with the "nobody has mapped this domain" caveat to four of the seven builders — Kalkidan,
  // Ruth, Tashima and Victoria. That answer was honest and useless: it sent every candidate in
  // those domains towards a scope sheet, which is the one outcome this file exists to prevent.
  //
  // HOW EACH ENTRY BELOW WAS CHECKED, so the next reader knows what `verified_on` is worth here.
  // Three things were read for every claim: the backend route file, to confirm the endpoint is
  // registered; `frontend/src/routes/adminRoutes.tsx`, to confirm a screen is mounted at
  // `product_route`; and the frontend call sites, to confirm the screen actually calls the
  // endpoint rather than merely existing near it. That last check is the one that produced the
  // `api_only` state, and it is the check a glance at the route file would have skipped.
  //
  // What was NOT done: nobody signed in and clicked through. That is a weaker standard than the
  // file's header asks for, and it is recorded here rather than hidden behind a date.
  // ===============================================================================================

  // ---- admissions (Kalkidan Bezabeh; manager Taiwo Oludimimu) ----
  {
    feature_key: 'admissions.intelligence.read',
    matches: [
      'admissions conversations', 'applicant conversations', 'call log', 'callbacks',
      'admissions stats', 'admissions documents',
    ],
    domain_key: 'admissions',
    label: 'Read what admissions is doing',
    what_it_does:
      'See applicant conversations, the call log, outstanding callbacks, the documents collected '
      + 'and the operational counts, on the Admissions Intelligence tab.',
    state: 'in_app',
    product_route: '/admin/ai-settings',
    product_route_note:
      'Open the page and click the "Admissions Intelligence" tab. The tab selection is component '
      + 'state with no query parameter, so a link lands on Overview.',
    backed_by:
      'backend/src/routes/admin/admissionsRoutes.ts (stats, conversations, knowledge, operations, '
      + 'callbacks, call-log, documents) read by '
      + 'frontend/src/pages/admin/ai-settings/AdminAdmissionsTab.tsx',
    verified_on: '2026-11-18',
    ruling_needed: null,
  },
  {
    feature_key: 'admissions.knowledge.edit',
    matches: [
      'admissions knowledge', 'edit admissions knowledge', 'admissions answers',
      'what admissions says',
    ],
    domain_key: 'admissions',
    label: 'Change what admissions tells applicants',
    what_it_does:
      'Add or correct an entry in the admissions knowledge base, which is the source the '
      + 'admissions agent answers applicants from.',
    // API_ONLY, and this is the entry the state was added for. POST and PUT
    // /api/admin/admissions/knowledge are both registered and neither has a screen: the tab
    // reads `GET .../knowledge` and makes no write call anywhere in the frontend.
    state: 'api_only',
    product_route: '/admin/ai-settings',
    product_route_note:
      'THERE IS NO SCREEN. The tab shows the knowledge base and cannot change it. Editing today '
      + 'means a direct API call, which is not something to hand a builder.',
    backed_by:
      'backend/src/routes/admin/admissionsRoutes.ts (POST and PUT /api/admin/admissions/knowledge '
      + 'exist; no frontend file calls either)',
    verified_on: '2026-11-18',
    ruling_needed:
      'The screen needs to list the knowledge entries, add one, and edit one, with the applicant-'
      + 'facing text visible while it is edited. The endpoints already do the work. Worth pairing '
      + 'with the ruling on whether an agent may write to it, because a wrong entry here is '
      + 'repeated to every applicant who asks.',
  },

  // ---- curriculum (Ruth Kumera; manager Swati Raman) ----
  {
    feature_key: 'curriculum.knowledge_base.manage',
    matches: [
      'knowledge base', 'kb entries', 'knowledge entry', 'course knowledge', 'cohort knowledge',
    ],
    domain_key: 'curriculum',
    label: 'Manage the knowledge base',
    what_it_does:
      'Create, edit and remove knowledge entries, cohorts and people, and preview what the '
      + 'assembled knowledge looks like before it is used.',
    state: 'in_app',
    product_route: '/admin/knowledge-ops',
    product_route_note: null,
    backed_by:
      'backend/src/routes/admin/kbRoutes.ts (14 routes) with the writes wired through '
      + 'frontend/src/components/admin/knowledgeOps/{Entry,Cohort,Person}EditModal.tsx',
    verified_on: '2026-11-18',
    ruling_needed: null,
  },
  {
    feature_key: 'curriculum.cert_prep.read',
    matches: [
      'certification readiness', 'cert prep', 'exam readiness', 'question bank',
      'weakness report', 'not started',
    ],
    domain_key: 'curriculum',
    label: 'Read certification readiness',
    what_it_does:
      'See a cohort\'s exam readiness, its weakest areas, who has not started, one student\'s '
      + 'attempt history, and the question bank behind it.',
    state: 'in_app',
    product_route: '/admin/cert-prep',
    product_route_note: null,
    backed_by:
      'backend/src/routes/admin/certPrepAdminRoutes.ts (readiness, weakness, not-started, '
      + 'history, bank, items, questions, audit) read by '
      + 'frontend/src/pages/admin/certprep/AdminCertPrepPage.tsx',
    verified_on: '2026-11-18',
    ruling_needed: null,
  },
  {
    feature_key: 'curriculum.cert_prep.question_state',
    matches: [
      'approve a question', 'question status', 'retire a question', 'certification evidence',
      'evidence state',
    ],
    domain_key: 'curriculum',
    label: 'Approve or retire a question, and rule on evidence',
    what_it_does:
      'Move a bank question between states, and accept or reject a piece of certification '
      + 'evidence a student submitted.',
    // API_ONLY. `POST .../questions/:key/:rev/status` and `POST .../evidence/:id/state` are both
    // registered; no frontend file calls either, so the cert-prep page is read-only in practice.
    state: 'api_only',
    product_route: '/admin/cert-prep',
    product_route_note:
      'THERE IS NO SCREEN. The page reads the bank and the pending evidence and offers no way to '
      + 'change either.',
    backed_by:
      'backend/src/routes/admin/certPrepAdminRoutes.ts (POST questions/:key/:rev/status and POST '
      + 'evidence/:id/state exist; no frontend file calls either)',
    verified_on: '2026-11-18',
    ruling_needed:
      'The screen needs the pending evidence queue with accept and reject, and the question bank '
      + 'with a state change, both recording who decided. This one carries a student outcome, so '
      + 'the agent ruling matters as much as the screen.',
  },

  // ---- internship (Tashima Diah; manager Dhee) ----
  {
    feature_key: 'internship.queue.read',
    matches: [
      'internship queue', 'internship console', 'internship applications', 'applicant queue',
      'internship kpis', 'project readiness',
    ],
    domain_key: 'internship',
    label: 'Read the internship pipeline',
    what_it_does:
      'See the application queue and console, one applicant\'s record and activity, project '
      + 'readiness, the collected documents and the pipeline counts.',
    state: 'in_app',
    product_route: '/admin/internship',
    product_route_note: null,
    backed_by:
      'backend/src/routes/admin/internshipRoutes.ts (console, queue, applications/:id, activity, '
      + 'project-readiness, documents, kpis) and internArtifactRoutes.ts (4 routes)',
    verified_on: '2026-11-18',
    ruling_needed: null,
  },
  {
    feature_key: 'internship.application.decide',
    matches: [
      'decide an application', 'accept an applicant', 'reject an applicant', 'activate an intern',
      'verify a document', 'assign a project',
    ],
    domain_key: 'internship',
    label: 'Decide an application and start someone',
    what_it_does:
      'Record a decision on an application, activate the intern, assign them a project, and mark '
      + 'a submitted document verified.',
    // PARTLY and not `in_app`: the screen exists and is wired, so the builder can do all of it by
    // hand today. What an AGENT may do here is a different question, and a large one.
    state: 'partly',
    product_route: '/admin/internship',
    product_route_note: null,
    backed_by:
      'backend/src/routes/admin/internshipRoutes.ts (applications/:id/decide, activate, '
      + 'projects/:id/assign, documents/:id/verify) wired through '
      + 'frontend/src/services/adminInternshipApi.ts',
    verified_on: '2026-11-18',
    ruling_needed:
      'A decision here accepts or turns away a real person and is visible to them. Whether an '
      + 'agent may record one, or may only prepare one for a human to press, is your ruling.',
  },
  {
    feature_key: 'internship.applicant.nudge',
    matches: ['nudge an applicant', 'chase an applicant', 'remind an applicant'],
    domain_key: 'internship',
    label: 'Nudge an applicant',
    what_it_does: 'Send an applicant a reminder about the step they have not finished.',
    state: 'partly',
    product_route: '/admin/internship',
    product_route_note: null,
    backed_by: 'backend/src/routes/admin/internshipRoutes.ts (applications/:id/nudge)',
    verified_on: '2026-11-18',
    ruling_needed:
      'This reaches a real person and cannot be taken back. It is the smallest outbound action in '
      + 'the domain, which makes it the obvious first candidate, and it still needs the ruling.',
  },

  // ---- sales (Victoria Spencer-Auber; manager Roselen Flores) ----
  {
    feature_key: 'sales.lead.manage',
    matches: [
      'lead', 'leads', 'update a lead', 'lead status', 'pipeline stage', 'move a lead',
      'log a call', 'lead notes', 'lead activity',
    ],
    domain_key: 'sales',
    label: 'Work a lead through the pipeline',
    what_it_does:
      'Read the lead queue and one lead\'s detail, change its status and notes, move it between '
      + 'pipeline stages, and log an activity against it.',
    state: 'in_app',
    product_route: '/admin/leads',
    product_route_note:
      'The board view of the same pipeline is at /admin/pipeline, where a stage change is a drag.',
    backed_by:
      'backend/src/routes/admin/leadRoutes.ts (37 routes) with the writes wired through '
      + 'frontend/src/pages/admin/AdminLeadsPage.tsx, AdminLeadDetailPage.tsx, '
      + 'AdminPipelinePage.tsx and components/admin/lead/*',
    verified_on: '2026-11-18',
    ruling_needed: null,
  },
  {
    feature_key: 'sales.lead.temperature',
    matches: ['lead temperature', 'score a lead', 'lead scoring', 'temperature history'],
    domain_key: 'sales',
    label: 'See and set how warm a lead is',
    what_it_does:
      'Read a lead\'s temperature history and set its current temperature, which is what the '
      + 'queue sorts and filters by.',
    state: 'in_app',
    product_route: '/admin/leads',
    product_route_note: null,
    backed_by:
      'backend/src/routes/admin/leadRoutes.ts (leads/:id/temperature, '
      + 'leads/:id/temperature-history)',
    verified_on: '2026-11-18',
    ruling_needed: null,
  },
  {
    feature_key: 'sales.lead.import',
    matches: ['apollo', 'import leads', 'buy leads', 'lead list', 'prospect list'],
    domain_key: 'sales',
    label: 'Import leads from Apollo',
    what_it_does: 'Pull a list out of the paid Apollo account and bring it in as leads.',
    state: 'partly',
    product_route: '/admin/apollo',
    product_route_note: null,
    backed_by: 'backend/src/routes/admin/leadRoutes.ts (leads/apollo-lists, leads/apollo-import)',
    verified_on: '2026-11-18',
    ruling_needed:
      'This spends a paid quota on every call and brings other people\'s contact details onto the '
      + 'platform. Whether an agent may draw on it, and how much, is your ruling. Note that '
      + 'APOLLO_ENABLED is unset in the prod container, so a search returns empty rather than '
      + 'failing — an agent would read that as "no such person".',
  },
  {
    feature_key: 'sales.refund.issue',
    matches: ['refund', 'issue a refund', 'refund a payment', 'give money back'],
    domain_key: 'sales',
    label: 'Issue a refund',
    what_it_does: 'Look a payment up and refund it.',
    state: 'partly',
    product_route: '/admin/refunds',
    product_route_note: null,
    backed_by:
      'backend/src/routes/admin/refundRoutes.ts (GET refunds, GET refunds/lookup, POST refunds) '
      + 'wired through frontend/src/services/refundApi.ts',
    verified_on: '2026-11-18',
    ruling_needed:
      'This moves money out and cannot be undone from inside the product. Reading the refund list '
      + 'and looking a payment up are already usable; issuing one is the decision, and the honest '
      + 'answer may be that no agent gets this rung at all.',
  },
]);

/** The domains anybody has actually curated. Everything else is unmapped, not empty. */
export const CURATED_DOMAINS: ReadonlyArray<string> = Object.freeze(
  [...new Set(PRODUCT_FEATURES.map((f) => f.domain_key))].sort(),
);

/** What the front door shows for one candidate. */
export interface FrontDoorAnswer {
  /** `in_app`, `partly`, `api_only`, or `not_built` when nothing in the catalog matches. */
  readonly state: 'in_app' | 'partly' | 'api_only' | 'not_built';
  /** The feature that answered, or null when nothing did. */
  readonly feature: ProductFeature | null;
  /** What happens next, as an instruction rather than a status. */
  readonly route_to:
    | 'use_it_then_ask_for_a_grant'
    | 'ask_for_a_ruling'
    | 'ask_for_a_screen'
    | 'write_a_scope_sheet';
  /**
   * The AF11.7 `tried_in_product` value this answer implies, or null when the builder still has
   * to tell us whether they have used it.
   *
   * `in_app` deliberately does NOT imply `used_by_hand`. The product having the feature is not
   * the same fact as the builder having used it, and AF11.7 keeps those apart on purpose: the
   * whole point of "go and use it first" is that trying it is what produces the answer.
   *
   * `api_only` is the one exception, and the reason is in the header: there is no screen, so the
   * builder could not have used it, and `exists_unused` is a fact about the product.
   */
  readonly implies_tried_in_product: ToolProductState | null;
  /** Whether this domain has been curated at all. False means unmapped, never "nothing exists". */
  readonly domain_is_mapped: boolean;
}

const norm = (v: unknown): string => (typeof v === 'string' ? v.trim().toLowerCase() : '');

/**
 * Does this candidate match a feature we already have?
 *
 * ## The matcher is deliberately literal
 *
 * It matches on the feature key, the label, and the words in the label. It does NOT attempt to
 * understand the candidate: a fuzzy matcher that half-recognises "make a page for the webinar"
 * would be wrong in the expensive direction, telling a builder the product already does
 * something it does not. When it is unsure it answers `not_built`, which costs a scope sheet that
 * Ali then reads, and he is the backstop the whole ladder is built around.
 *
 * `word` matching requires every word of the FEATURE's label to appear in the candidate, not the
 * other way round. "landing page" matches "draft a landing page from a brief"; "page" alone does
 * not match the landing page feature, because one shared word is not a claim.
 */
export function answerFrontDoor(args: {
  readonly candidate: string;
  readonly domainKey: string;
  readonly features?: ReadonlyArray<ProductFeature>;
}): FrontDoorAnswer {
  const features = args.features ?? PRODUCT_FEATURES;
  const domain = norm(args.domainKey);
  const candidate = norm(args.candidate);
  const mapped = features.some((f) => norm(f.domain_key) === domain);
  const inDomain = features.filter((f) => norm(f.domain_key) === domain);

  // Exact key first, so a stored answer resolves straight back. Then the phrase list, taking
  // the LONGEST match: "publish a landing page" names publishing, not drafting, and the only
  // thing separating them is how specific the phrase is.
  const byKey = inDomain.find((f) => norm(f.feature_key) === candidate) ?? null;
  let match = byKey;
  if (!match) {
    let best = 0;
    for (const f of inDomain) {
      for (const phrase of f.matches) {
        const words = norm(phrase).split(/\s+/).filter(Boolean);
        if (words.length === 0 || !words.every((w) => candidate.includes(w))) continue;
        if (words.length > best) { best = words.length; match = f; }
      }
    }
  }

  if (!match) {
    return {
      state: 'not_built',
      feature: null,
      route_to: 'write_a_scope_sheet',
      implies_tried_in_product: 'not_built',
      domain_is_mapped: mapped,
    };
  }
  if (match.state === 'api_only') {
    return {
      state: 'api_only',
      feature: match,
      route_to: 'ask_for_a_screen',
      // THE ONE NON-NULL CASE, and it is a fact about the product rather than a guess about the
      // builder. `exists_unused` means exactly this: the platform has it and nobody is using it.
      // Everywhere else this stays null because trying the feature is what produces the answer;
      // here trying it is impossible, so there is nothing for the builder to tell us.
      implies_tried_in_product: 'exists_unused',
      domain_is_mapped: true,
    };
  }
  if (match.state === 'partly') {
    return {
      state: 'partly',
      feature: match,
      route_to: 'ask_for_a_ruling',
      // Not an answer to AF11.7's question. Whether this becomes a grant or a build depends on
      // the ruling, and guessing either way here would pre-empt it.
      implies_tried_in_product: null,
      domain_is_mapped: true,
    };
  }
  return {
    state: 'in_app',
    feature: match,
    route_to: 'use_it_then_ask_for_a_grant',
    // Still null. The product having it is not the builder having used it, and "go and use it
    // first" only means something if trying it is what produces the answer.
    implies_tried_in_product: null,
    domain_is_mapped: true,
  };
}

/** Everything the product already does in one domain, for the front door's browse list. */
export function featuresForDomain(
  domainKey: string,
  features: ReadonlyArray<ProductFeature> = PRODUCT_FEATURES,
): ProductFeature[] {
  const d = norm(domainKey);
  return features.filter((f) => norm(f.domain_key) === d);
}

/**
 * How much of the product has been mapped, so the gap is reported rather than hidden.
 *
 * `by_state` was added 18 Nov 2026 and is additive: the two existing fields keep their names and
 * meanings, because `CatalogCoverage` in `frontend/src/services/productFeatureApi.ts` reads them.
 */
export function catalogCoverage(
  features: ReadonlyArray<ProductFeature> = PRODUCT_FEATURES,
): {
  readonly features: number;
  readonly domains: ReadonlyArray<string>;
  readonly by_state: {
    readonly in_app: number;
    readonly partly: number;
    readonly api_only: number;
  };
} {
  return {
    features: features.length,
    domains: [...new Set(features.map((f) => f.domain_key))].sort(),
    by_state: {
      in_app: features.filter((f) => f.state === 'in_app').length,
      partly: features.filter((f) => f.state === 'partly').length,
      api_only: features.filter((f) => f.state === 'api_only').length,
    },
  };
}

/**
 * The screens the platform owes a builder: every `api_only` feature, in domain order.
 *
 * This is the cheap end of the build queue, and it is worth having its own function rather than
 * being filtered out of the catalog at each call site. An `api_only` entry is a screen over an
 * endpoint that already works, which is a different size of job from a capability that does not
 * exist — and a queue that mixes the two makes the whole thing look equally expensive.
 *
 * It is deliberately NOT a list of everything the platform is missing. It only knows about gaps
 * somebody curated; a candidate that matches nothing still comes back `not_built` and goes to a
 * scope sheet. Reporting this as "the gaps" would be a confident wrong answer about coverage.
 */
export function screenGaps(
  features: ReadonlyArray<ProductFeature> = PRODUCT_FEATURES,
): ProductFeature[] {
  return features
    .filter((f) => f.state === 'api_only')
    .slice()
    .sort((a, b) => a.domain_key.localeCompare(b.domain_key)
      || a.feature_key.localeCompare(b.feature_key));
}
