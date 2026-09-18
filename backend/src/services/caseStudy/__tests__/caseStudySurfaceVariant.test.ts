import { projectPublicDetail } from '../caseStudyPublicProjection';
import { collectNarrative } from '../caseStudyPublishClaimScan';
import { Blockers, ruleBuilderConsent } from '../caseStudyPublishRules';
import type { CaseStudyPublishRecord } from '../caseStudyPublishRules';
import { PUBLIC_DETAIL_KEYS } from '../../../types/caseStudyPublic';
import { deepKeys, internalSnapshotContent } from './publicFixtures';
import type { PublicProjectionInput } from '../caseStudyPublicProjection';
import type {
  CaseStudyBuilderProfile, CaseStudyDecision, CaseStudySnapshotContent, CaseStudySurfaceKey,
} from '../../../types/caseStudy';

/**
 * One record, one audience at a time. A per-surface variant changes the words
 * ONE surface reads and nothing on any other; a record with no variant projects
 * byte-identically to before variants existed; the builder card's biography
 * crosses only behind the same consent gate as a named contributor; and the
 * publish gate reads every variant string and every variant person.
 */

const PUB = { featured: false, publishedAt: '2026-08-22T10:00:00.000Z', updatedAt: '2026-08-22T10:00:00.000Z', titleOverride: null, summaryOverride: null };
const input = (content: CaseStudySnapshotContent, surfaceKey: CaseStudySurfaceKey, summaryOverride: string | null = null): PublicProjectionInput => ({
  surfaceKey, slug: 'stockout-forecasting', content, publication: { ...PUB, summaryOverride }, canonicalBaseUrl: 'https://enterprise.colaberry.ai',
});

const builder: CaseStudyBuilderProfile = {
  displayName: 'Jordan Unconsented', roleTitle: 'AI Systems Architect', organization: 'Colaberry', initials: 'J',
  intro: ['Jordan joined as an intern and was hired.'], progression: ['Intern', 'Hired', 'AI Systems Architect'],
  contribution: 'Built the forecasting agent.', skills: [{ label: 'Workflow design', evidence: 'The extractor feeds the agent.' }],
  profileUrl: 'https://example.com/jordan', photoUrl: 'javascript:alert(1)',
  provenance: { source: 'user_confirmed', confirmedAt: '2026-09-16', note: 'confirmed by ali@colaberry.com' },
};
const decisions: CaseStudyDecision[] = [
  { key: 'reuse', title: 'Reuse the pipeline', problem: 'Two paths drift.', decision: 'One path.', evidence: 'The extractor.', consequence: 'No drift.', stage: '04 Replay', figure: '0' },
  { key: 'half', title: 'Missing parts', problem: 'x', decision: '', evidence: 'y', consequence: 'z' },
  { key: 'plain', title: 'No pin', problem: 'p', decision: 'd', evidence: 'e', consequence: 'c' },
];

/** The fixture with a training variant that rewrites every field a variant may carry. */
function withVariant(over: Record<string, unknown> = {}): CaseStudySnapshotContent {
  const content = internalSnapshotContent() as unknown as Record<string, unknown>;
  content.surfaceVariants = {
    training: {
      standfirst: 'For learners: the same order, a different path.',
      situation: { narrative: ['Jordan met the planners first.'], constraints: ['ERP read-only.'], goals: ['Less reconciling.'], verification: (content.situation as any).verification },
      measurementNarrative: ['Measured for learners.'],
      metricNotes: { stockouts: { baseline: 'No before-state: the cohort had none.' } },
      contributors: [
        { displayMode: 'named', displayName: 'Jordan Unconsented', role: 'Lead engineer', kind: 'colaberry_team', consentRecordedAt: '2026-06-02T00:00:00.000Z' },
      ],
      builder,
      decisions,
      closing: 'For learners: what the work shows.',
      ...over,
    },
  };
  return content as unknown as CaseStudySnapshotContent;
}

/** The fixture's record, with consent as the identity says it. */
function record(content: CaseStudySnapshotContent, over: Partial<CaseStudyPublishRecord> = {}): CaseStudyPublishRecord {
  return {
    id: 'cs-1', status: 'approved',
    builderIdentityMode: content.identity.builderIdentityMode,
    builderNamingConsent: content.identity.builderNamingConsent,
    organizationIdentityMode: content.identity.organizationIdentityMode,
    organizationNamingConsent: content.identity.organizationNamingConsent,
    ...over,
  };
}

function blockersOf(content: CaseStudySnapshotContent, rec: CaseStudyPublishRecord): { code: string; path: string }[] {
  const b = new Blockers();
  ruleBuilderConsent(rec, content, b);
  return b.all().map((x) => ({ code: x.code, path: x.field }));
}

describe('a record without a variant', () => {
  it('projects the same object as before, on every surface, with the two new keys empty', () => {
    const content = internalSnapshotContent();
    for (const surface of ['enterprise', 'training', 'ai-flotation'] as const) {
      const detail = projectPublicDetail(input(content, surface));
      expect(Object.keys(detail).sort()).toEqual([...PUBLIC_DETAIL_KEYS].sort());
      expect(detail.builder).toBeNull();
      expect(detail.decisions).toEqual([]);
      expect(detail.closing).toBeNull();
      expect(detail.situation?.body).toEqual(['Replenishment planners were reconciling three systems by hand.']);
    }
  });
});

describe('a training variant', () => {
  const content = withVariant();

  it('changes the training projection and no other', () => {
    const training = projectPublicDetail(input(content, 'training'));
    const enterprise = projectPublicDetail(input(content, 'enterprise'));
    const plain = projectPublicDetail(input(internalSnapshotContent(), 'enterprise'));
    expect(training.standfirst).toBe('For learners: the same order, a different path.');
    expect(training.seo.description).toBe('For learners: the same order, a different path.');
    expect(training.situation?.body).toEqual(['Jordan met the planners first.']);
    expect(training.measurement?.narrative).toEqual(['Measured for learners.']);
    expect(training.heroMetrics[0].baseline).toBe('No before-state: the cohort had none.');
    // The half card is dropped; the pin and the figure cross, and read null when the card has none.
    expect(training.decisions).toEqual([{ ...decisions[0] }, { ...decisions[2], stage: null, figure: null }]);
    expect(training.closing).toBe('For learners: what the work shows.');
    // Enterprise reads the canonical words, exactly as a record with no variant.
    expect(enterprise).toEqual(plain);
  });

  it('reads the canonical closing on every surface until a variant says otherwise', () => {
    const canonical = internalSnapshotContent() as unknown as Record<string, unknown>;
    canonical.closing = 'What the work shows, for everyone.';
    const withCanonical = canonical as unknown as CaseStudySnapshotContent;
    expect(projectPublicDetail(input(withCanonical, 'enterprise')).closing).toBe('What the work shows, for everyone.');
    expect(projectPublicDetail(input(withCanonical, 'training')).closing).toBe('What the work shows, for everyone.');
    const overridden = withVariant({ closing: 'For learners only.' }) as unknown as Record<string, unknown>;
    overridden.closing = 'What the work shows, for everyone.';
    expect(projectPublicDetail(input(overridden as unknown as CaseStudySnapshotContent, 'training')).closing).toBe('For learners only.');
    expect(projectPublicDetail(input(overridden as unknown as CaseStudySnapshotContent, 'enterprise')).closing).toBe('What the work shows, for everyone.');
  });

  it('outranks the publication row\'s summary override on its own surface only', () => {
    expect(projectPublicDetail(input(content, 'training', 'Row text')).standfirst).toBe('For learners: the same order, a different path.');
    expect(projectPublicDetail(input(content, 'enterprise', 'Row text')).standfirst).toBe('Row text');
  });

  it('withholds the builder\'s name and biography without consent, keeps the project facts, and never leaks the note or an unsafe link', () => {
    // The fixture's identity has builderNamingConsent false: Jordan is downgraded to the role.
    const training = projectPublicDetail(input(content, 'training'));
    expect(training.contributors[0]).toEqual({ displayMode: 'role_only', role: 'Lead engineer', kind: 'colaberry_team' });
    expect(training.builder).toEqual({
      name: null, roleTitle: 'AI Systems Architect', organization: 'Colaberry', initials: 'J', intro: [], progression: [],
      contribution: 'Built the forecasting agent.', skills: [{ label: 'Workflow design', evidence: 'The extractor feeds the agent.' }],
      profileUrl: null, photoUrl: null, provenance: { source: 'user_confirmed', confirmedAt: '2026-09-16' },
    });
    expect([...deepKeys(training)]).not.toContain('note');
  });

  it('releases the biography once the record and the contributor both carry consent', () => {
    const consented = withVariant() as unknown as Record<string, unknown>;
    consented.identity = { ...(consented.identity as object), builderIdentityMode: 'named', builderNamingConsent: true };
    const training = projectPublicDetail(input(consented as unknown as CaseStudySnapshotContent, 'training'));
    expect(training.contributors[0]).toEqual({ displayMode: 'named', displayName: 'Jordan Unconsented', role: 'Lead engineer', kind: 'colaberry_team' });
    expect(training.builder?.name).toBe('Jordan Unconsented');
    expect(training.builder?.intro).toEqual(['Jordan joined as an intern and was hired.']);
    expect(training.builder?.progression).toEqual(['Intern', 'Hired', 'AI Systems Architect']);
    expect(training.builder?.profileUrl).toBe('https://example.com/jordan');
    // A javascript: photo link is not a URL the page may use, consent or not.
    expect(training.builder?.photoUrl).toBeNull();
    // The canonical surface still credits the role: its own list has no named person the gate lets through.
    expect(projectPublicDetail(input(consented as unknown as CaseStudySnapshotContent, 'enterprise')).builder).toBeNull();
  });

  it('is ignored when keyed on a surface that is not publishable', () => {
    const odd = internalSnapshotContent() as unknown as Record<string, unknown>;
    odd.surfaceVariants = { refactored: { standfirst: 'Never shown.' } };
    const detail = projectPublicDetail(input(odd as unknown as CaseStudySnapshotContent, 'enterprise'));
    expect(detail.standfirst).not.toBe('Never shown.');
  });
});

describe('the publish gate reads variants', () => {
  it('scans every variant string and the builder and decision cards, under paths that name the surface', () => {
    const paths = collectNarrative(withVariant()).map((t) => t.path);
    for (const p of [
      'surfaceVariants.training.standfirst', 'surfaceVariants.training.situation.narrative[0]',
      'surfaceVariants.training.measurementNarrative[0]', 'surfaceVariants.training.metricNotes.stockouts.baseline',
      'surfaceVariants.training.contributors[0].role', 'surfaceVariants.training.builder.intro[0]',
      'surfaceVariants.training.builder.skills[0].evidence', 'surfaceVariants.training.decisions[0].consequence',
      'surfaceVariants.training.decisions[0].stage', 'surfaceVariants.training.decisions[0].figure',
      'surfaceVariants.training.closing',
    ]) expect(paths).toContain(p);
    const canonical = internalSnapshotContent() as unknown as Record<string, unknown>;
    canonical.builder = builder; canonical.decisions = decisions; canonical.closing = 'What the work shows.';
    const rootPaths = collectNarrative(canonical as unknown as CaseStudySnapshotContent).map((t) => t.path);
    expect(rootPaths).toContain('builder.contribution');
    expect(rootPaths).toContain('decisions[1].evidence');
    expect(rootPaths).toContain('closing');
  });

  it('refuses a named contributor inside a variant exactly as it would in the canonical list', () => {
    const content = withVariant();
    const paths = blockersOf(content, record(content)).map((x) => x.path);
    expect(paths).toContain('surfaceVariants.training.contributors[0].displayName');
    expect(paths).toContain('surfaceVariants.training.contributors[0].displayMode');
  });

  it('refuses a builder profile whose name is not a consented contributor of the same content, and passes one that is', () => {
    const content = withVariant();
    expect(blockersOf(content, record(content)).map((x) => x.path)).toContain('surfaceVariants.training.builder.displayName');
    const consented = withVariant() as unknown as Record<string, unknown>;
    consented.identity = { ...(consented.identity as object), builderIdentityMode: 'named', builderNamingConsent: true };
    const ok = consented as unknown as CaseStudySnapshotContent;
    expect(blockersOf(ok, record(ok)).filter((x) => x.path.startsWith('surfaceVariants'))).toEqual([]);
    // A profile on a variant with NO contributor list of its own is held to the canonical list.
    const orphan = withVariant({ contributors: undefined, builder: { ...builder, displayName: 'Nobody Here' } }) as unknown as Record<string, unknown>;
    orphan.identity = { ...(orphan.identity as object), builderIdentityMode: 'named', builderNamingConsent: true };
    const o = orphan as unknown as CaseStudySnapshotContent;
    expect(blockersOf(o, record(o)).map((x) => x.path)).toContain('surfaceVariants.training.builder.displayName');
    // The sparse-author card: an EMPTY displayName is a role credit and passes on a record with
    // no consent at all (the rollout's three role-only records). A non-empty name does not.
    const roleOnly = withVariant({ contributors: [{ displayMode: 'role_only', role: 'Learner', kind: 'learner' }], builder: { ...builder, displayName: '', intro: [], progression: [] } });
    expect(blockersOf(roleOnly, record(roleOnly)).filter((x) => x.path.endsWith('builder.displayName'))).toEqual([]);
    const namedNoConsent = withVariant({ contributors: [{ displayMode: 'role_only', role: 'Learner', kind: 'learner' }], builder: { ...builder, displayName: 'Learner', intro: [], progression: [] } });
    expect(blockersOf(namedNoConsent, record(namedNoConsent)).map((x) => x.path)).toContain('surfaceVariants.training.builder.displayName');
  });

  it('refuses a variant keyed on a surface that is not publishable', () => {
    const odd = internalSnapshotContent() as unknown as Record<string, unknown>;
    odd.surfaceVariants = { refactored: { standfirst: 'x' } };
    const o = odd as unknown as CaseStudySnapshotContent;
    expect(blockersOf(o, record(o)).map((x) => x.path)).toContain('surfaceVariants.refactored');
  });
});
