import * as fs from 'fs';
import * as path from 'path';
import { publicFields, domainFields, ContractField } from '../services/caseStudy/caseStudyFieldContract';

/**
 * Generate `docs/case-study/FIELD_COVERAGE.json` from the TypeScript contract.
 *
 * WHY GENERATED AND NOT HAND-WRITTEN. The HTML field map built for design review
 * asserted it was the complete domain map. It covered 59 fields; the contract
 * carries 195. A hand-maintained map cannot stay complete, because nothing fails
 * when someone adds a field and forgets the map — which is precisely how the
 * first one drifted.
 *
 * So the field LIST is derived, and only the DISPOSITIONS are authored. A new
 * field appears here automatically with `disposition: "unreviewed"`, and
 * `caseStudyFieldCoverage.test.ts` fails on any `unreviewed` entry. The failure
 * message names the field, so the person who added it is told what to decide
 * rather than left to discover the map exists.
 *
 * Run: npx ts-node src/scripts/generateCaseStudyFieldCoverage.ts
 * The script is idempotent: same contract in, byte-identical file out.
 */

type Disposition =
  | 'verified_evidence' | 'deterministic' | 'human_approved' | 'explicit_null'
  | 'explicit_empty' | 'internal_only' | 'withheld_privacy' | 'not_applicable'
  | 'pending_excluded' | 'unreviewed';

interface Entry {
  disposition: Disposition;
  authoring: string;
  sourcePriority: string;
  aiMayInfer: boolean;
  approvalRequired: boolean;
  indexHome: string;
  detailHome: string;
  publicBehaviour: string;
  emptyBehaviour: string;
  privacy: string;
  test: string;
  /** Which AUTHORED entry or RULE produced this disposition. */
  rule?: string;
}

const D = (o: Partial<Entry> & { disposition: Disposition }): Entry => ({
  authoring: 'admin narrative panel', sourcePriority: 'human override > repo sync',
  aiMayInfer: false, approvalRequired: true,
  indexHome: '—', detailHome: '—',
  publicBehaviour: 'projected as-is', emptyBehaviour: 'section hides',
  privacy: 'public', test: 'caseStudyPublicProjection.test.ts',
  ...o,
});

/**
 * Authored dispositions. Anything absent is emitted as `unreviewed` and fails the
 * drift test — the list below is deliberately not exhaustive-by-hand, because a
 * hand-completed list is the failure mode this whole file exists to prevent.
 */
const AUTHORED: Record<string, Entry> = {
  /* ── identity ─────────────────────────────────────────────────────────── */
  'CaseStudyIdentitySection.slug': D({
    disposition: 'deterministic', aiMayInfer: false, approvalRequired: false,
    authoring: 'slugified from title at creation, then frozen',
    indexHome: 'card href', detailHome: 'URL',
    emptyBehaviour: 'impossible — required at creation',
    test: 'caseStudyAdmin.test.ts',
  }),
  'CaseStudyIdentitySection.title': D({
    disposition: 'human_approved', indexHome: 'card heading', detailHome: 'H1',
    emptyBehaviour: 'impossible — required', test: 'caseStudyAdmin.test.ts',
  }),
  'CaseStudyIdentitySection.standfirst': D({
    disposition: 'human_approved', aiMayInfer: true,
    indexHome: 'card blurb', detailHome: 'masthead standfirst',
    emptyBehaviour: 'card falls back to summary; readiness −2',
  }),
  'CaseStudyIdentitySection.summary': D({
    disposition: 'human_approved', aiMayInfer: true,
    indexHome: 'card blurb fallback', detailHome: 'SEO description',
    emptyBehaviour: 'SEO falls back to standfirst',
  }),
  'CaseStudyIdentitySection.organizationDisplayName': D({
    disposition: 'human_approved',
    indexHome: 'card footer', detailHome: 'who built it',
    publicBehaviour: 'rendered ONLY when identityMode=named AND namingConsent=true',
    emptyBehaviour: 'renders "anonymised"', privacy: 'consent-gated',
    test: 'caseStudyPublicProjection.test.ts',
  }),
  'CaseStudyIdentitySection.organizationIdentityMode': D({
    disposition: 'human_approved', detailHome: 'gates the org name',
    publicBehaviour: 'gate only, never rendered', emptyBehaviour: 'defaults hidden — fail closed',
    privacy: 'consent gate',
  }),
  'CaseStudyIdentitySection.organizationNamingConsent': D({
    disposition: 'human_approved', publicBehaviour: 'gate only, never rendered',
    emptyBehaviour: 'treated false', privacy: 'consent gate',
  }),
  'CaseStudyIdentitySection.builderIdentityMode': D({
    disposition: 'human_approved', detailHome: 'contributors',
    publicBehaviour: 'gate only', emptyBehaviour: 'defaults anonymous', privacy: 'consent gate',
  }),
  'CaseStudyIdentitySection.builderNamingConsent': D({
    disposition: 'human_approved', publicBehaviour: 'gate only',
    emptyBehaviour: 'treated false', privacy: 'consent gate',
  }),
  'CaseStudyIdentitySection.builtByType': D({
    disposition: 'human_approved',
    indexHome: 'card footer', detailHome: 'ledger "Built by"',
    emptyBehaviour: 'cell reads "not recorded"; readiness −2',
  }),
  'CaseStudyIdentitySection.programLabel': D({
    disposition: 'human_approved', indexHome: 'card eyebrow', detailHome: 'masthead eyebrow',
    emptyBehaviour: 'eyebrow shows industry only',
  }),
  'CaseStudyIdentitySection.engagementWindow': D({
    disposition: 'human_approved', detailHome: 'ledger "Elapsed" + badge',
    emptyBehaviour: 'cell reads "not recorded"',
  }),
  'CaseStudyIdentitySection.heroImageUrl': D({
    disposition: 'human_approved', aiMayInfer: false, approvalRequired: true,
    authoring: 'admin artifacts panel — the record CHOOSES its cover',
    sourcePriority: 'human choice > HERO_IMAGE_PRIORITY default',
    indexHome: 'card media', detailHome: 'the page cover',
    publicBehaviour: 'honoured by resolveHeroImage ONLY when it matches an already-approved, '
      + 'publicly viewable artifact — naming a URL cannot publish an image the artifact gate never saw',
    emptyBehaviour: 'the type priority decides: screenshot, then architecture, then photo',
    test: 'caseStudyPhotoAndDiagram.test.ts',
  }),
  'CaseStudyIdentitySection.productionStatus': D({
    disposition: 'human_approved', indexHome: 'card status', detailHome: 'ledger "In production"',
    emptyBehaviour: 'cell empty; outcome check fails',
  }),

  /* ── repositories: the scope field this workstream added ───────────────── */
  'CaseStudyRepositoryRef.pathScope': D({
    disposition: 'human_approved', approvalRequired: true,
    authoring: 'admin repositories panel, or scopeCaseStudyRepository.ts',
    sourcePriority: 'human only — never inferred',
    detailHome: 'repository provenance',
    publicBehaviour: 'NOT projected; scopes every derived fact instead',
    emptyBehaviour: 'whole repository — the monorepo over-collection',
    privacy: 'internal', test: 'caseStudyRepoScope.test.ts',
  }),
  'CaseStudyRepositoryRef.repoUrl': D({
    disposition: 'withheld_privacy', detailHome: 'repository provenance',
    publicBehaviour: 'projected ONLY when allowPublicRepoLink=true',
    emptyBehaviour: 'counted, not linked', privacy: 'withheld unless opted in',
    test: 'caseStudyPublicProjection.test.ts',
  }),
  'CaseStudyRepositoryRef.repoOwner': D({
    disposition: 'withheld_privacy', publicBehaviour: 'withheld unless allowPublicRepoLink',
    emptyBehaviour: 'n/a', privacy: 'withheld',
  }),
  'CaseStudyRepositoryRef.repoName': D({
    disposition: 'withheld_privacy', publicBehaviour: 'withheld unless allowPublicRepoLink',
    emptyBehaviour: 'n/a', privacy: 'withheld',
  }),

  /* ── metrics: the claim-integrity core ─────────────────────────────────── */
  'CaseStudyMetricEntry.publishable': D({
    disposition: 'human_approved',
    publicBehaviour: 'gate — a pending+publishable metric BLOCKS publication',
    emptyBehaviour: 'treated false', test: 'caseStudyPublishGate.test.ts',
  }),
  'CaseStudyMetricEntry.isHeadline': D({
    disposition: 'human_approved',
    indexHome: 'selects the card figure', detailHome: 'ledger + accent border',
    emptyBehaviour: 'no ledger figure', test: 'caseStudyPublicProjection.test.ts',
  }),
  'CaseStudyMeasurementContext.limitations': D({
    disposition: 'human_approved', detailHome: '"What this does not show"',
    emptyBehaviour: 'the caveat block disappears — the most costly omission',
    test: 'caseStudyPublicSections.test.ts',
  }),
  'CaseStudyMeasurementContext.baseline': D({
    disposition: 'human_approved', detailHome: 'method box',
    emptyBehaviour: 'row omitted; readiness −3',
  }),
  'CaseStudyMeasurementContext.sample': D({
    disposition: 'human_approved', detailHome: 'method box', emptyBehaviour: 'row omitted',
  }),
  'CaseStudyMeasurementContext.measured': D({
    disposition: 'human_approved', detailHome: 'method box', emptyBehaviour: 'row omitted',
  }),
  'CaseStudyMeasurementContext.methodology': D({
    disposition: 'human_approved', detailHome: 'method box', emptyBehaviour: 'row omitted',
  }),

  'CaseStudyMetricEntry.valueDisplay': D({
    disposition: 'human_approved', aiMayInfer: false, approvalRequired: true,
    authoring: 'admin metrics panel; measured runs propose, a human accepts',
    sourcePriority: 'measured metric run > human entry — never inferred from prose',
    indexHome: 'the card figure', detailHome: 'metric card value',
    publicBehaviour: 'projected only when the metric is publishable AND verified',
    emptyBehaviour: 'the metric card is OMITTED — a figure is never invented to fill it',
    test: 'caseStudyPublishGate.test.ts',
  }),
  'CaseStudyMetricEntry.measurement': D({
    disposition: 'human_approved', aiMayInfer: false, approvalRequired: true,
    authoring: 'admin metrics panel — baseline, sample, measured, methodology, limitations',
    detailHome: 'the method box beneath the metric cards',
    publicBehaviour: 'projected in full; it is what makes a number readable',
    emptyBehaviour: 'a headline metric WITHOUT it loses 3 readiness points and should not '
      + 'be a headline — spec §23 will not render a big number with no method',
    test: 'caseStudyPublicSections.test.ts',
  }),
  'CaseStudyTimelineEntry.sourceRef': D({
    disposition: 'internal_only',
    authoring: 'repo sync — a commit sha, PR number or internal record id',
    sourcePriority: 'repo sync', aiMayInfer: false, approvalRequired: false,
    detailHome: 'not rendered',
    publicBehaviour: 'NEVER projected — a source ref can name private infrastructure. '
      + 'The public timeline entry carries sourceKind instead, which says WHAT KIND of '
      + 'evidence backs the entry without naming the artefact.',
    emptyBehaviour: 'n/a', privacy: 'internal only',
    test: 'caseStudyPublicProjection.test.ts',
  }),

  /* ── verification ─────────────────────────────────────────────────────── */
  'CaseStudyVerification.class': D({
    disposition: 'human_approved',
    indexHome: 'card badge', detailHome: 'badge on every claim',
    publicBehaviour: 'drives all conditional formatting',
    emptyBehaviour: 'reads "pending"; publish gate refuses',
    test: 'caseStudyPublishGate.test.ts',
  }),
  'CaseStudyVerification.method': D({
    disposition: 'human_approved', indexHome: 'card badge', detailHome: 'badge',
    emptyBehaviour: 'reads "internal"',
  }),
  'CaseStudyVerification.evidenceId': D({
    disposition: 'internal_only',
    publicBehaviour: 'NEVER projected — internal evidence identifier',
    emptyBehaviour: 'claim cannot be verified-class', privacy: 'internal only',
    test: 'caseStudyPublicProjection.test.ts',
  }),
  'CaseStudyVerification.verifiedAt': D({
    disposition: 'deterministic', detailHome: 'badge tooltip where public',
    emptyBehaviour: 'date omitted',
  }),

  /* ── artifacts ────────────────────────────────────────────────────────── */
  'CaseStudyArtifactRef.id': D({
    disposition: 'internal_only', publicBehaviour: 'NEVER projected',
    emptyBehaviour: 'n/a', privacy: 'internal only',
  }),
  'CaseStudyArtifactRef.previewUrl': D({
    disposition: 'withheld_privacy',
    publicBehaviour: 'projected only for visibility=public AND status=approved',
    emptyBehaviour: 'no thumbnail', privacy: 'gated',
  }),
  'CaseStudyArtifactRef.publicUrl': D({
    disposition: 'withheld_privacy', indexHome: 'card media source',
    publicBehaviour: 'projected only for visibility=public AND status=approved',
    emptyBehaviour: 'title only, no link', privacy: 'gated',
  }),
  'CaseStudyArtifactRef.sourceRef': D({
    disposition: 'internal_only',
    publicBehaviour: 'NEVER projected — can reveal private infrastructure',
    emptyBehaviour: 'n/a', privacy: 'internal only',
  }),
  'CaseStudyArtifactRef.sourceCommitSha': D({
    disposition: 'internal_only', publicBehaviour: 'NEVER projected',
    emptyBehaviour: 'n/a', privacy: 'internal only',
  }),

  /* ── architecture ─────────────────────────────────────────────────────── */
  'CaseStudyArchitectureSection.diagramSource': D({
    disposition: 'human_approved', aiMayInfer: false,
    authoring: 'admin narrative panel; mermaid',
    indexHome: 'card media "arch"', detailHome: 'StoryDiagram — mermaid',
    publicBehaviour: 'sanitised server-side: length-capped, refused if it contains "<"',
    emptyBehaviour: 'band hides entirely — no empty frame',
    test: 'caseStudyPublicSections.test.ts',
  }),
  'CaseStudyArchitectureSection.diagram': D({
    disposition: 'verified_evidence', aiMayInfer: false,
    authoring: 'repo analyzer nodes/edges',
    detailHome: 'CaseStudyArchitecture — verified node and edge LISTS, as text',
    emptyBehaviour: 'lists hide', test: 'caseStudyPublicSections.test.ts',
  }),
  'CaseStudyArchitectureSection.stack': D({
    disposition: 'verified_evidence', aiMayInfer: false,
    authoring: 'repo analyzer, PATH-SCOPED', sourcePriority: 'repo sync > human override',
    indexHome: 'card tags, first 4', detailHome: 'stack chips',
    emptyBehaviour: 'chips hide; readiness −2 below three entries',
    test: 'repoPathScopeAnalysis.test.ts',
  }),
};


/**
 * RULES. A disposition assigned by a stated rule is still a decision — what is
 * forbidden is a blank. Each rule says which fields it covers and why that
 * disposition is the right one for the whole class, and the emitted entry records
 * `rule` so an auditor can see it was classed rather than considered individually.
 *
 * Order matters: the first matching rule wins, and AUTHORED always beats a rule.
 */
const RULES: ReadonlyArray<{
  name: string; match: (q: string, f: ContractField) => boolean; entry: (f: ContractField) => Entry;
}> = [
  {
    // The public interfaces ARE the projection. Nothing is authored onto them
    // directly; each one is computed from the domain by caseStudyPublicProjection.
    name: 'public-projection-mirror',
    match: (q) => q.startsWith('PublicCaseStudy'),
    entry: (f) => D({
      disposition: 'deterministic',
      authoring: 'not authored — computed by caseStudyPublicProjection.ts',
      sourcePriority: 'projection of the approved snapshot',
      aiMayInfer: false, approvalRequired: false,
      indexHome: f.interfaceName === 'PublicCaseStudySummary' ? 'index card' : '—',
      detailHome: f.interfaceName === 'PublicCaseStudyDetail' ? 'detail page' : 'nested in detail',
      publicBehaviour: f.optional ? 'omitted when absent' : 'always present',
      emptyBehaviour: f.optional ? 'section hides cleanly' : 'empty array or empty string',
      test: 'caseStudyPublicProjection.test.ts',
    }),
  },
  {
    // Every verification object is a human judgement about a claim.
    name: 'verification-is-human',
    match: (q) => q.endsWith('.verification'),
    entry: () => D({
      disposition: 'human_approved',
      detailHome: 'badge beside the claim',
      publicBehaviour: 'class and method projected; evidenceId never is',
      emptyBehaviour: 'reads "pending"; publish gate refuses a pending publishable claim',
      test: 'caseStudyPublishGate.test.ts',
    }),
  },
  {
    // Prose. AI may draft it; a human must approve it before it is public.
    name: 'narrative-prose',
    match: (q) => /\.(narrative|detail|description|label|title|summary|standfirst)$/.test(q),
    entry: () => D({
      disposition: 'human_approved', aiMayInfer: true, approvalRequired: true,
      authoring: 'admin narrative panel; AI draft permitted, human approval required',
      detailHome: 'the section it belongs to',
      emptyBehaviour: 'element hides; never replaced with placeholder prose',
    }),
  },
  {
    // Repository-derived facts. The sync owns them; a human override is possible
    // but must survive the next resync, which caseStudySnapshotOverrides handles.
    name: 'repo-derived-fact',
    match: (q) => /\.(stack|capabilities|integrations|dataStores|defaultBranch|lastSeenSha|lastSyncedAt|sourceCommitSha|accessStatus)$/.test(q),
    entry: () => D({
      disposition: 'verified_evidence', aiMayInfer: false, approvalRequired: false,
      authoring: 'repo analyzer, path-scoped', sourcePriority: 'repo sync; human override preserved',
      detailHome: 'architecture section', emptyBehaviour: 'chips hide',
      test: 'repoPathScopeAnalysis.test.ts',
    }),
  },
  {
    // Dates and identifiers the system computes.
    name: 'deterministic-scalar',
    match: (q) => /\.(date|endDate|publishedAt|updatedAt|consentRecordedAt|verifiedAt|numericValue|unit|key|from|to|id)$/.test(q),
    entry: (f) => D({
      disposition: f.field === 'id' ? 'internal_only' : 'deterministic',
      aiMayInfer: false, approvalRequired: false,
      authoring: 'computed', sourcePriority: 'system',
      publicBehaviour: f.field === 'id' ? 'NEVER projected' : 'projected',
      privacy: f.field === 'id' ? 'internal only' : 'public',
      emptyBehaviour: 'omitted',
    }),
  },
  {
    // Enumerated vocabulary a human picks: role, status, kind, mode, type.
    name: 'human-vocabulary',
    match: (q) => /\.(status|role|kind|metricType|artifactType|sourceType|source|sourceKind|visibility|industry|primaryCapability|programKey|builtByType|projectStatus|deliverables|featured|isHeadline|publishable|allowPublicRepoLink)$/.test(q),
    entry: () => D({
      disposition: 'human_approved',
      indexHome: 'card facet or badge', detailHome: 'badge or chip',
      emptyBehaviour: 'defaults to the safest member of the union',
    }),
  },
  {
    // Composite sections on the snapshot: assembled, never typed by hand.
    name: 'snapshot-composite',
    match: (q) => q.startsWith('CaseStudySnapshotContent.'),
    entry: () => D({
      disposition: 'deterministic', approvalRequired: false,
      authoring: 'assembled by caseStudySnapshotBuilder from the sections above',
      sourcePriority: 'sections + human overrides',
      publicBehaviour: 'projected through the surface lens',
      emptyBehaviour: 'absent section hides on the page',
      test: 'caseStudySnapshotBuilder.test.ts',
    }),
  },
  {
    // Remaining string lists a human writes: constraints, goals, limitations.
    name: 'authored-list',
    match: (q) => /\.(constraints|goals|limitations|metrics|heroMetrics|timeline|roadmap|contributors|artifacts|repositories|nodes|edges)$/.test(q),
    entry: () => D({
      disposition: 'human_approved', aiMayInfer: true,
      detailHome: 'its own section', emptyBehaviour: 'section hides cleanly',
    }),
  },
];

function build(): { generated: string; fields: Record<string, Entry> } {
  const all: ContractField[] = [...publicFields(), ...domainFields()];
  const out: Record<string, Entry> = {};
  for (const f of all.sort((a, b) => a.qualified.localeCompare(b.qualified))) {
    const authored = AUTHORED[f.qualified];
    if (authored) { out[f.qualified] = { ...authored, rule: 'authored' }; continue; }
    const rule = RULES.find((r) => r.match(f.qualified, f));
    out[f.qualified] = rule
      ? { ...rule.entry(f), rule: rule.name }
      : { ...D({
          disposition: 'unreviewed',
          emptyBehaviour: 'UNREVIEWED — add an AUTHORED entry or a RULE in generateCaseStudyFieldCoverage.ts',
        }), rule: 'none' };
  }
  return { generated: 'derived from types/caseStudy.ts and types/caseStudyPublic.ts', fields: out };
}

export function coveragePath(): string {
  return path.join(__dirname, '..', '..', '..', 'docs', 'case-study', 'FIELD_COVERAGE.json');
}

if (require.main === module) {
  const data = build();
  const n = Object.keys(data.fields).length;
  const unreviewed = Object.entries(data.fields).filter(([, v]) => v.disposition === 'unreviewed');
  fs.writeFileSync(coveragePath(), JSON.stringify(data, null, 2) + '\n', 'utf8');
  console.log(JSON.stringify({
    event: 'case_study.field_coverage_generated', outcome: 'success',
    fields: n, authored: n - unreviewed.length, unreviewed: unreviewed.length,
  }, null, 2));
}

export { build, AUTHORED };
export type { Entry, Disposition };
