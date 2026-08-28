/**
 * T023 area 2 — private repository identity must not reach the public API.
 *
 * The method is adversarial, not descriptive. A snapshot is built with a
 * distinctive sentinel planted in EVERY field an attacker or a careless admin
 * could put a private repository's owner, name or URL into — the repository rows
 * themselves, and then twelve other routes into the payload that do not go
 * through `projectRepositories` at all. Both public projections are run, the
 * result is serialised, and the serialisation is searched for each sentinel.
 *
 * A test that only checked `repositories: []` would pass while the same identity
 * arrived through an artifact URL, a diagram node label or the hero image.
 */
import {
  projectPublicSummary,
  projectPublicDetail,
} from '../../services/caseStudy/caseStudyPublicProjection';
import type { PublicProjectionInput } from '../../services/caseStudy/caseStudyPublicProjection';
import { evaluateCaseStudyPublishGate } from '../../services/caseStudy/caseStudyPublishGate';
import type {
  CaseStudySnapshotContent,
  CaseStudyRepositoryRef,
  CaseStudyVerification,
} from '../../types/caseStudy';

/* ------------------------------------------------------------- sentinels --- */

const S = {
  owner: 'T023SENTINELowner',
  name: 'T023SENTINELreponame',
  url: 'https://github.com/T023SENTINELowner/T023SENTINELreponame',
  org: 'T023SENTINELcustomerorg',
  person: 'T023SENTINELpersonname',
} as const;

const ALL_SENTINELS = Object.values(S);

const verified: CaseStudyVerification = {
  class: 'verified', method: 'instrumented', verifiedAt: '2026-01-01T00:00:00Z',
} as CaseStudyVerification;

/** Four repositories, only one of which is entitled to be shown. */
const REPOS: CaseStudyRepositoryRef[] = [
  // 1. private, and the admin ticked the link box anyway
  {
    repoOwner: S.owner, repoName: S.name, repoUrl: S.url,
    role: 'primary', visibility: 'private', accessStatus: 'connected',
    allowPublicRepoLink: true,
  },
  // 2. public, but consent to link was never given
  {
    repoOwner: S.owner, repoName: `${S.name}-noconsent`, repoUrl: `${S.url}-noconsent`,
    role: 'supporting', visibility: 'public', accessStatus: 'connected',
    allowPublicRepoLink: false,
  },
  // 3. visibility could not be read — the case where guessing is worst
  {
    repoOwner: S.owner, repoName: `${S.name}-unknown`, repoUrl: `${S.url}-unknown`,
    role: 'supporting', visibility: 'unknown', accessStatus: 'unknown',
    allowPublicRepoLink: true,
  },
  // 4. genuinely public and consented — MUST survive, or the test passes for
  //    the wrong reason (a projection that drops everything is not a gate)
  {
    repoOwner: 'colaberry', repoName: 'public-demo', repoUrl: 'https://github.com/colaberry/public-demo',
    role: 'supporting', visibility: 'public', accessStatus: 'connected',
    allowPublicRepoLink: true,
  },
] as CaseStudyRepositoryRef[];

/**
 * Every other way the same identity could be smuggled into the payload.
 * If the projection is a real allowlist these either drop or carry only what an
 * admin deliberately typed — and the difference between those two is the point
 * of the measurement at the bottom of this file.
 */
const HOSTILE_CONTENT = {
  identity: {
    slug: 'sentinel-case',
    title: `Rollout for ${S.org}`,
    standfirst: `Delivered from ${S.url}`,
    summary: `Repo ${S.owner}/${S.name}`,
    organizationDisplayName: S.org,
    organizationIdentityMode: 'anonymized',   // consent flag deliberately false
    organizationNamingConsent: false,
    builderIdentityMode: 'anonymous',
    builderNamingConsent: false,
    programLabel: S.name,
    engagementWindow: { start: '2026-01-01', durationLabel: S.name, verification: verified },
    productionStatus: { status: 'shipped', verification: verified },
  },
  heroMetrics: [{
    label: `Commits in ${S.name}`, valueDisplay: '1,204', unit: 'commits',
    publishable: true, isHeadline: true, verification: verified,
    measurement: { baseline: S.owner, sample: S.url, methodology: S.org, limitations: [S.person] },
  }],
  situation: { narrative: [`The client, ${S.org}, kept ${S.url} private.`], verification: verified },
  buildTimeline: [{
    date: '2026-01-02', label: S.name, detail: S.url,
    source: 'commit', sourceRef: S.url, verification: verified,
  }],
  architecture: {
    narrative: [`Built in ${S.owner}/${S.name}`],
    stack: [S.name], capabilities: [S.owner], integrations: [S.org],
    diagram: {
      nodes: [{ id: S.owner, label: S.name, kind: 'service' }],
      edges: [{ from: S.owner, to: S.owner, label: S.url }],
    },
  },
  measurement: {
    narrative: [S.url],
    metrics: [{
      label: S.org, valueDisplay: '42', publishable: true, verification: verified,
      measurement: { baseline: S.url, sample: S.owner, methodology: S.name, limitations: [] },
    }],
  },
  roadmap: [{ label: S.name, status: 'planned', detail: S.url, verification: verified }],
  contributors: [
    { displayMode: 'named', displayName: S.person, role: 'Engineer', kind: 'builder' },
  ],
  artifacts: [
    // The interesting one: an APPROVED, PUBLIC artifact whose URL is the private repo.
    {
      id: 'a1', artifactType: 'repository', title: `Source: ${S.name}`,
      description: `Hosted at ${S.url}`, sourceType: 'repository', sourceRef: S.url,
      visibility: 'public', status: 'approved', publicUrl: S.url, previewUrl: S.url,
    },
    // A private artifact, which must have no shape at all.
    {
      id: 'a2', artifactType: 'document', title: S.org, description: S.url,
      sourceType: 'upload', visibility: 'private', status: 'approved', publicUrl: S.url,
    },
    // An unapproved artifact.
    {
      id: 'a3', artifactType: 'screenshot', title: S.name, sourceType: 'upload',
      visibility: 'public', status: 'draft', publicUrl: S.url, previewUrl: S.url,
    },
  ],
  repositories: REPOS,
  taxonomy: {
    industry: S.org, primaryCapability: S.name, capabilities: [S.owner],
    stack: [S.name], deliverables: [S.url], builtByType: 'colaberry_team',
  },
} as unknown as CaseStudySnapshotContent;

const input = (content: CaseStudySnapshotContent): PublicProjectionInput => ({
  surfaceKey: 'enterprise',
  slug: 'sentinel-case',
  content,
  publication: {
    featured: false,
    publishedAt: '2026-02-01T00:00:00Z',
    updatedAt: '2026-02-01T00:00:00Z',
    titleOverride: null,
    summaryOverride: null,
  },
  canonicalBaseUrl: 'https://enterprise.colaberry.ai',
});

/** Which sentinels survived, and under which JSON paths. */
function survivingPaths(payload: unknown): Record<string, string[]> {
  const found: Record<string, string[]> = {};
  const walk = (node: unknown, path: string): void => {
    if (typeof node === 'string') {
      for (const s of ALL_SENTINELS) {
        if (node.includes(s)) (found[s] ??= []).push(`${path} = ${JSON.stringify(node)}`);
      }
      return;
    }
    if (Array.isArray(node)) { node.forEach((v, i) => walk(v, `${path}[${i}]`)); return; }
    if (node && typeof node === 'object') {
      for (const [k, v] of Object.entries(node as Record<string, unknown>)) walk(v, `${path}.${k}`);
    }
  };
  walk(payload, '$');
  return found;
}

/* ------------------------------------------------------------------ tests --- */

describe('T023 area 2 — a private repository survives only as a count', () => {
  const detail = projectPublicDetail(input(HOSTILE_CONTENT));
  const summary = projectPublicSummary(input(HOSTILE_CONTENT));

  it('the repositories array contains only the one entitled repository', () => {
    expect(detail.repositories).toHaveLength(1);
    expect(detail.repositories[0].url).toBe('https://github.com/colaberry/public-demo');
    // Not a blanket erasure: the entitled repository really is rendered.
    expect(detail.repositories[0].label).toBe('public-demo');
  });

  it('the three withheld repositories are counted, not dropped silently', () => {
    expect(detail.privateRepositoryCount).toBe(3);
  });

  it('no repository sentinel reaches the payload through the repositories array', () => {
    const rendered = JSON.stringify(detail.repositories);
    expect(rendered).not.toContain(S.owner);
    expect(rendered).not.toContain(S.name);
    expect(rendered).not.toContain(S.url);
  });

  it('the public repository type has no field that could hold owner, name or URL of a withheld repo', () => {
    // Structural, not behavioural: there is no key to put it in.
    const keys = Object.keys(detail.repositories[0]).sort();
    expect(keys).toEqual(['label', 'lastCommitDate', 'role', 'url']);
  });

  it('a repository with UNKNOWN visibility is withheld, not assumed public', () => {
    const onlyUnknown = projectPublicDetail(input({
      ...HOSTILE_CONTENT,
      repositories: [REPOS[2]],
    } as CaseStudySnapshotContent));
    expect(onlyUnknown.repositories).toHaveLength(0);
    expect(onlyUnknown.privateRepositoryCount).toBe(1);
  });

  it('a repository whose URL is a javascript: payload is withheld even when public and consented', () => {
    const hostile = projectPublicDetail(input({
      ...HOSTILE_CONTENT,
      repositories: [{
        repoOwner: 'x', repoName: 'y', repoUrl: 'javascript:alert(1)',
        role: 'primary', visibility: 'public', accessStatus: 'connected',
        allowPublicRepoLink: true,
      }],
    } as unknown as CaseStudySnapshotContent));
    expect(hostile.repositories).toHaveLength(0);
    expect(hostile.privateRepositoryCount).toBe(1);
  });

  it('an unconsented organisation name does not reach the summary or the detail', () => {
    // organizationIdentityMode is 'anonymized' here, which publishes the stored
    // label by design — so this asserts the NAMED path, which is the one gated
    // on consent. Both are exercised so neither passes by accident.
    const named = projectPublicDetail(input({
      ...HOSTILE_CONTENT,
      identity: {
        ...HOSTILE_CONTENT.identity,
        organizationIdentityMode: 'named',
        organizationNamingConsent: false,
      },
    } as CaseStudySnapshotContent));
    expect(named.organizationLabel).toBeNull();

    const consented = projectPublicDetail(input({
      ...HOSTILE_CONTENT,
      identity: {
        ...HOSTILE_CONTENT.identity,
        organizationIdentityMode: 'named',
        organizationNamingConsent: true,
      },
    } as CaseStudySnapshotContent));
    expect(consented.organizationLabel).toBe(S.org);
  });

  it('an unconsented contributor name does not reach the payload', () => {
    expect(JSON.stringify(detail.contributors)).not.toContain(S.person);
    // The name is REMOVED, not the contribution: an unconsented named
    // contributor is downgraded to `role_only`, which is why the anonymous
    // count stays at zero here. Asserting the count instead of the shape was
    // the first draft of this test and it failed — recorded because "the leak
    // is gone" and "the row is gone" are different claims.
    expect(detail.contributors).toEqual([{ displayMode: 'role_only', role: 'Engineer', kind: 'builder' }]);
    // …and consent genuinely turns it back on, so the gate is on consent.
    const consented = projectPublicDetail(input({
      ...HOSTILE_CONTENT,
      identity: {
        ...HOSTILE_CONTENT.identity,
        builderIdentityMode: 'named',
        builderNamingConsent: true,
      },
      contributors: [{
        displayMode: 'named', displayName: S.person, role: 'Engineer',
        kind: 'builder', consentRecordedAt: '2026-01-01T00:00:00Z',
      }],
    } as unknown as CaseStudySnapshotContent));
    expect(JSON.stringify(consented.contributors)).toContain(S.person);
  });

  it('a private artifact and an unapproved artifact have no shape in the payload', () => {
    const titles = detail.artifacts.map((a) => a.title);
    expect(titles).not.toContain(S.org);            // the private one
    expect(titles).not.toContain(S.name);           // the draft one
  });

  it('an internal artifact id and sourceRef never cross the boundary', () => {
    for (const a of detail.artifacts) {
      expect(Object.keys(a)).not.toContain('id');
      expect(Object.keys(a)).not.toContain('sourceRef');
      expect(Object.keys(a)).not.toContain('sourceCommitSha');
    }
  });

  it('a pending metric has no shape at all', () => {
    const pending = projectPublicDetail(input({
      ...HOSTILE_CONTENT,
      heroMetrics: [{
        label: 'Pending figure', valueDisplay: '99%', publishable: true, isHeadline: true,
        verification: { class: 'pending', method: 'internal' },
      }],
    } as unknown as CaseStudySnapshotContent));
    expect(pending.heroMetrics).toHaveLength(0);
    expect(JSON.stringify(pending)).not.toContain('Pending figure');
  });

  /**
   * The defeat attempt, recorded rather than asserted away.
   *
   * Twelve fields other than `repositories` were seeded with the same private
   * repository identity. This prints exactly which of them carry a sentinel into
   * the public payload, so the proof document can state what the boundary does
   * and does NOT cover instead of implying it covers everything.
   */
  it('MEASUREMENT — which non-repository fields carry a planted sentinel', () => {
    const detailPaths = survivingPaths(detail);
    const summaryPaths = survivingPaths(summary);
    const render = (label: string, found: Record<string, string[]>): string[] => {
      const out = [`--- ${label} ---`];
      for (const s of ALL_SENTINELS) {
        const hits = found[s] ?? [];
        out.push(`  ${s}: ${hits.length} hit(s)`);
        for (const h of hits) out.push(`      ${h}`);
      }
      return out;
    };
    // eslint-disable-next-line no-console
    console.log([
      '', '=== T023 area 2 defeat attempt: sentinels planted in 12 non-repository fields ===',
      ...render('detail payload', detailPaths),
      ...render('summary payload', summaryPaths),
      '=== end area 2 measurement ===', '',
    ].join('\n'));

    // The hard rule, asserted: nothing reaches the payload through a field that
    // is DERIVED from the repository rows.
    expect(JSON.stringify(detail.repositories)).not.toContain(S.owner);

    // The finding, asserted as it actually is rather than as one would wish.
    // The projection is a FIELD allowlist, not a CONTENT scrubber: prose an
    // admin typed is published verbatim, so a private repository URL pasted
    // into `identity.standfirst` reaches the public payload. Documented in the
    // proof as F-01.
    //
    // THIS REMAINS TRUE AND IS DELIBERATE. The fix for V-29 was NOT to start
    // scrubbing content at projection time — that would silently rewrite what a
    // human approved, which is the one thing the snapshot model exists to
    // prevent. The fix is that such a snapshot can no longer be PUBLISHED; see
    // the gate assertions below. So this assertion stays exactly as it was, and
    // its meaning has changed from "the boundary leaks" to "the boundary is a
    // field allowlist, and the gate is what stops a leaking record reaching it".
    expect(JSON.stringify(summary)).toContain(S.url);
    expect(summary.standfirst).toContain(S.url);
  });

  /**
   * The compensating control for the finding above, exercised rather than
   * assumed: does anything refuse to PUBLISH the hostile snapshot?
   */
  it('the publish gate refuses the structured private-repo exposure', () => {
    const decision = evaluateCaseStudyPublishGate({
      surfaceKey: 'enterprise',
      caseStudy: {
        id: 'cs-1', status: 'approved',
        organizationIdentityMode: 'anonymized', organizationNamingConsent: false,
        builderIdentityMode: 'anonymous', builderNamingConsent: false,
      },
      snapshot: {
        id: 'snap-1', version: 1, status: 'approved',
        approvedBy: 'ali', approvedAt: '2026-02-01T00:00:00Z',
        content: HOSTILE_CONTENT,
      },
    });
    expect(decision.allowed).toBe(false);
    expect(decision.codes).toContain('private_repo_exposed');
    // …and the blocker message itself does not name the private repository.
    const exposure = decision.blockers.filter((x) => x.code === 'private_repo_exposed');
    expect(exposure.length).toBeGreaterThan(0);
    for (const x of exposure) {
      expect(JSON.stringify(x)).not.toContain(S.owner);
      expect(JSON.stringify(x)).not.toContain(S.name);
    }

    // MEASUREMENT: the gate blocks the structured case. Does it block the
    // PROSE case? Print every blocker so the proof states the answer, not a hope.
    // eslint-disable-next-line no-console
    console.log([
      '', '=== T023 area 2 compensating control: publish gate blockers ===',
      `allowed: ${decision.allowed}`,
      `codes: ${decision.codes.join(', ')}`,
      ...decision.blockers.map((x) => `  [${x.code}] ${x.field}: ${x.message}`),
      `standfirst carrying a private repo URL flagged by any blocker: ${
        decision.blockers.some((x) => x.field.startsWith('identity.standfirst'))}`,
      '=== end compensating control measurement ===', '',
    ].join('\n'));
  });

  /**
   * V-29, closed. This is the assertion the measurement above used to print as
   * `false`.
   *
   * `ruleRepoIdentityInProse` refuses a snapshot whose narrative fields name a
   * repository that this same record withholds. The prose still projects
   * verbatim — see the measurement test — but it can no longer get published.
   */
  it('the publish gate refuses a private repo identity typed into PROSE (V-29)', () => {
    const decision = evaluateCaseStudyPublishGate({
      surfaceKey: 'enterprise',
      caseStudy: {
        id: 'cs-1', status: 'approved',
        organizationIdentityMode: 'anonymized', organizationNamingConsent: false,
        builderIdentityMode: 'anonymous', builderNamingConsent: false,
      },
      snapshot: {
        id: 'snap-1', version: 1, status: 'approved',
        approvedBy: 'reviewer', approvedAt: '2026-02-01T00:00:00Z',
        content: HOSTILE_CONTENT,
      },
    });

    const fields = decision.blockers
      .filter((x) => x.code === 'private_repo_exposed')
      .map((x) => x.field);

    // The exact field the old measurement reported as unflagged.
    expect(fields).toContain('identity.standfirst');
    // …and the other prose routes the same identity was planted into.
    expect(fields).toContain('identity.summary');
    expect(fields).toContain('situation.narrative[0]');
    expect(fields).toContain('architecture.narrative[0]');

    // NON-VACUITY: the rule is reaching many distinct prose paths, not firing
    // once on a single field and satisfying the assertions above by luck.
    expect(new Set(fields).size).toBeGreaterThan(6);

    // The refusal must not itself print what it is refusing to publish.
    for (const x of decision.blockers.filter((b2) => b2.code === 'private_repo_exposed')) {
      expect(JSON.stringify(x)).not.toContain(S.owner);
      expect(JSON.stringify(x)).not.toContain(S.name);
      expect(JSON.stringify(x)).not.toContain(S.url);
    }
  });

  /**
   * The positive half. Without this the rule could be "never mention a
   * repository", which would be a gate nobody could satisfy.
   */
  it('a genuinely public, consented repository may be named in prose', () => {
    const clean = {
      ...HOSTILE_CONTENT,
      identity: {
        ...HOSTILE_CONTENT.identity,
        title: 'A clean record',
        standfirst: 'Built in the open at https://github.com/colaberry/public-demo',
        summary: 'The colaberry/public-demo repository carries the whole build.',
        organizationDisplayName: null,
        programLabel: 'Accelerator',
        engagementWindow: { start: '2026-01-01', durationLabel: '12 weeks', verification: verified },
      },
      heroMetrics: [],
      situation: { narrative: ['Nothing withheld is named here.'], verification: verified },
      buildTimeline: [],
      architecture: { narrative: ['Standard stack.'], stack: [], capabilities: [], integrations: [] },
      measurement: { narrative: [], metrics: [] },
      roadmap: [],
      contributors: [],
      artifacts: [],
      // Only repository 4 — public AND consented.
      repositories: [REPOS[3]],
      taxonomy: { builtByType: 'colaberry_team' },
    } as unknown as CaseStudySnapshotContent;

    const decision = evaluateCaseStudyPublishGate({
      surfaceKey: 'enterprise',
      caseStudy: {
        id: 'cs-2', status: 'approved',
        organizationIdentityMode: 'anonymized', organizationNamingConsent: false,
        builderIdentityMode: 'anonymous', builderNamingConsent: false,
      },
      snapshot: {
        id: 'snap-2', version: 1, status: 'approved',
        approvedBy: 'reviewer', approvedAt: '2026-02-01T00:00:00Z',
        content: clean,
      },
    });

    expect(decision.codes).not.toContain('private_repo_exposed');
  });
});
