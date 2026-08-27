/**
 * caseStudyPublicProjection - the leak probe. T014 AC2.
 *
 * NO DATABASE, NO NETWORK, NO CLOCK. The projection is a pure function, so this
 * suite runs with `DATABASE_URL` unset and imports no model.
 *
 * THE CENTRAL TEST IS `describe('the leak probe')`. It feeds the MAXIMAL
 * internal record from `publicFixtures.ts` - a private repo URL, a draft review
 * note, a student email, an enrollment id, an admin id, internal ids, a github
 * token, an unapproved artifact, a pending metric, an unconsented name - through
 * both projections and asserts that not one of those strings survives at ANY
 * nesting depth, and that not one key of the output is on
 * `FORBIDDEN_PUBLIC_KEYS`.
 */

import {
  projectContributors,
  projectPublicDetail,
  projectPublicSummary,
  projectRepositories,
  resolveOrganizationLabel,
  resolveRecordVerification,
  safeHttpUrl,
} from '../caseStudyPublicProjection';
import {
  FORBIDDEN_PUBLIC_KEYS,
  PUBLIC_DETAIL_KEYS,
  PUBLIC_SUMMARY_KEYS,
} from '../../../types/caseStudyPublic';
import {
  PRIVATE_REPO_URL,
  SENTINELS,
  deepKeys,
  deepStrings,
  internalSnapshotContent,
} from './publicFixtures';
import type { PublicProjectionInput } from '../caseStudyPublicProjection';
import type { CaseStudySnapshotContent } from '../../../types/caseStudy';

const BASE_URL = 'https://enterprise.colaberry.ai';

function input(content: CaseStudySnapshotContent = internalSnapshotContent()): PublicProjectionInput {
  return {
    surfaceKey: 'enterprise',
    slug: 'stockout-forecasting',
    content,
    publication: {
      featured: true,
      publishedAt: '2026-08-22T10:00:00.000Z',
      updatedAt: '2026-08-22T10:00:00.000Z',
      titleOverride: null,
      summaryOverride: null,
    },
    canonicalBaseUrl: BASE_URL,
  };
}

/* ------------------------------------------------------------ leak probe --- */

describe('the leak probe (AC2)', () => {
  const detail = projectPublicDetail(input());
  const summary = projectPublicSummary(input());

  it('the fixture really does carry every forbidden value, so the probe is not vacuous', () => {
    const raw = deepStrings(internalSnapshotContent());
    for (const sentinel of SENTINELS) {
      expect(raw.some((s) => s.includes(sentinel.value))).toBe(true);
    }
  });

  it.each(SENTINELS.map((s) => [s.what, s.value]))(
    'never emits the %s at any depth of the detail payload',
    (_what, value) => {
      const found = deepStrings(detail).filter((s) => s.includes(value as string));
      expect(found).toEqual([]);
    },
  );

  it.each(SENTINELS.map((s) => [s.what, s.value]))(
    'never emits the %s at any depth of the summary payload',
    (_what, value) => {
      const found = deepStrings(summary).filter((s) => s.includes(value as string));
      expect(found).toEqual([]);
    },
  );

  it('emits no forbidden KEY at any depth', () => {
    const forbidden = new Set<string>(FORBIDDEN_PUBLIC_KEYS as readonly string[]);
    const offending = [...deepKeys(detail)].filter((k) => forbidden.has(k));
    expect(offending).toEqual([]);
  });

  it('top-level keys are exactly the declared allow-lists', () => {
    expect(Object.keys(detail).sort()).toEqual([...PUBLIC_DETAIL_KEYS].sort());
    expect(Object.keys(summary).sort()).toEqual([...PUBLIC_SUMMARY_KEYS].sort());
  });

  it('still emits the record it is supposed to emit (the probe is not passing by returning nothing)', () => {
    expect(detail.title).toBe('Cutting stockouts with a forecasting agent');
    expect(detail.heroMetrics.length).toBeGreaterThan(0);
    expect(detail.repositories.length).toBe(1);
    expect(detail.artifacts.length).toBe(2);
    expect(detail.seo.canonicalUrl).toBe(`${BASE_URL}/stories/stockout-forecasting`);
  });
});

/* ---------------------------------------------------------- repositories --- */

describe('a private repository is dropped, not blanked', () => {
  const detail = projectPublicDetail(input());

  it('renders only the public, link-approved repository', () => {
    expect(detail.repositories).toEqual([
      {
        label: 'public-example',
        role: 'primary',
        url: 'https://github.com/colaberry/public-example',
        lastCommitDate: null,
      },
    ]);
  });

  it('the private and unknown-visibility repos survive only as a count', () => {
    expect(detail.privateRepositoryCount).toBe(2);
    expect(JSON.stringify(detail)).not.toContain(PRIVATE_REPO_URL);
  });

  it('an "unknown" visibility repo is withheld even when allow_public_repo_link is true', () => {
    const { repositories, privateRepositoryCount } = projectRepositories([
      {
        repoOwner: 'acme', repoName: 'mystery', repoUrl: 'https://github.com/acme/mystery',
        role: 'primary', visibility: 'unknown', accessStatus: 'unknown',
        allowPublicRepoLink: true,
      },
    ]);
    expect(repositories).toEqual([]);
    expect(privateRepositoryCount).toBe(1);
  });

  it('a public repo without allow_public_repo_link is withheld', () => {
    const { repositories, privateRepositoryCount } = projectRepositories([
      {
        repoOwner: 'acme', repoName: 'open', repoUrl: 'https://github.com/acme/open',
        role: 'primary', visibility: 'public', accessStatus: 'connected',
        allowPublicRepoLink: false,
      },
    ]);
    expect(repositories).toEqual([]);
    expect(privateRepositoryCount).toBe(1);
  });

  it('no public repository shape has an owner, a name, a visibility or a branch field', () => {
    const keys = new Set(Object.keys(detail.repositories[0]));
    for (const banned of ['repoOwner', 'repoName', 'visibility', 'defaultBranch', 'lastSeenSha']) {
      expect(keys.has(banned)).toBe(false);
    }
  });
});

/* -------------------------------------------------------------- metrics --- */

describe('a pending metric is unrepresentable', () => {
  const detail = projectPublicDetail(input());

  it('drops the pending figure and the unpublishable figure', () => {
    const labels = detail.heroMetrics.map((m) => m.label);
    expect(labels).toEqual(['Stockouts per store per week']);
  });

  it('emits no metric whose class is pending', () => {
    const classes = [...detail.heroMetrics, ...(detail.measurement?.metrics ?? [])]
      .map((m) => m.verificationClass);
    expect(classes).not.toContain('pending');
  });

  it('drops a timeline entry whose verification is still pending', () => {
    expect(detail.timeline.map((t) => t.label)).toEqual(['First working forecast']);
  });

  it('drops the whole situation when its verification is pending', () => {
    const content = internalSnapshotContent({
      situation: {
        narrative: ['Some prose'],
        verification: { class: 'pending', method: 'self' },
      },
    });
    expect(projectPublicDetail(input(content)).situation).toBeNull();
  });

  it('hides the engagement duration unless it is verified', () => {
    const content = internalSnapshotContent({
      identity: {
        ...(internalSnapshotContent().identity as unknown as Record<string, unknown>),
        engagementWindow: {
          start: '2026-06-01', durationLabel: 'Four weeks',
          verification: { class: 'anonymized', method: 'client' },
        },
      },
    });
    expect(projectPublicDetail(input(content)).engagementDuration).toBeNull();
    expect(projectPublicDetail(input()).engagementDuration).toBe('Four weeks');
  });
});

/* --------------------------------------------------------------- people --- */

describe('consent decides who is named', () => {
  it('downgrades a named contributor when the record is role_only', () => {
    const { contributors, anonymousContributorCount } = projectContributors(
      internalSnapshotContent(),
    );
    expect(contributors).toEqual([
      { displayMode: 'role_only', role: 'Lead engineer', kind: 'colaberry_team' },
      { displayMode: 'role_only', role: 'Data engineer', kind: 'client_team' },
    ]);
    expect(anonymousContributorCount).toBe(1);
  });

  it('names a contributor only when mode, consent and a timestamp all agree', () => {
    const identity = internalSnapshotContent().identity as unknown as Record<string, unknown>;
    const content = internalSnapshotContent({
      identity: { ...identity, builderIdentityMode: 'named', builderNamingConsent: true },
    });
    const { contributors } = projectContributors(content);
    expect(contributors[0]).toEqual({
      displayMode: 'named', displayName: 'Jordan Unconsented',
      role: 'Lead engineer', kind: 'colaberry_team',
    });
  });

  it('drops a named contributor with no consent timestamp down to their role', () => {
    const identity = internalSnapshotContent().identity as unknown as Record<string, unknown>;
    const content = internalSnapshotContent({
      identity: { ...identity, builderIdentityMode: 'named', builderNamingConsent: true },
      contributors: [{
        displayMode: 'named', displayName: 'Jordan Unconsented',
        role: 'Lead engineer', kind: 'colaberry_team',
      }],
    });
    expect(projectContributors(content).contributors).toEqual([
      { displayMode: 'role_only', role: 'Lead engineer', kind: 'colaberry_team' },
    ]);
  });

  it('resolves the organization label from the consent mode', () => {
    const identity = internalSnapshotContent().identity as unknown as Record<string, unknown>;
    expect(resolveOrganizationLabel(internalSnapshotContent()))
      .toBe('A national grocery distributor');
    expect(resolveOrganizationLabel(internalSnapshotContent({
      identity: { ...identity, organizationIdentityMode: 'named' },
    }))).toBeNull();
    expect(resolveOrganizationLabel(internalSnapshotContent({
      identity: { ...identity, organizationIdentityMode: 'named', organizationNamingConsent: true },
    }))).toBe('A national grocery distributor');
    expect(resolveOrganizationLabel(internalSnapshotContent({
      identity: { ...identity, organizationIdentityMode: 'hidden' },
    }))).toBeNull();
  });
});

/* ------------------------------------------------------------ artifacts --- */

describe('artifacts', () => {
  const detail = projectPublicDetail(input());

  it('renders approved public and request-only artifacts, and nothing else', () => {
    // `presentation` is derived from `artifactType` by the projection and is
    // asserted here literally, so a change to the derivation surfaces as a diff
    // on the payload rather than only inside the photo suite.
    expect(detail.artifacts).toEqual([
      {
        access: 'open', artifactType: 'architecture', presentation: 'evidence',
        title: 'System diagram',
        description: null, url: 'https://example.com/diagram.png', previewUrl: null,
      },
      {
        access: 'request', artifactType: 'deck', presentation: 'evidence',
        title: 'Executive summary',
        description: null,
      },
    ]);
  });

  it('refuses a non-http artifact URL rather than rendering it', () => {
    expect(safeHttpUrl('javascript:alert(1)')).toBeNull();
    expect(safeHttpUrl('data:text/html;base64,PHNjcmlwdD4=')).toBeNull();
    expect(safeHttpUrl('  https://example.com/x.png ')).toBe('https://example.com/x.png');
    expect(safeHttpUrl(null)).toBeNull();
  });
});

/* --------------------------------------------------------- verification --- */

describe('the record badge is derived, and fails closed', () => {
  it('takes the strongest class the record can evidence', () => {
    expect(resolveRecordVerification(internalSnapshotContent()))
      .toEqual({ verificationClass: 'verified', verificationMethod: 'repo' });
  });

  it('falls back to illustrative when nothing can be evidenced', () => {
    expect(resolveRecordVerification({
      identity: { slug: 'x', title: 'X' },
      heroMetrics: [],
      taxonomy: { capabilities: [], stack: [], deliverables: [] },
    } as unknown as CaseStudySnapshotContent))
      .toEqual({ verificationClass: 'illustrative', verificationMethod: 'internal' });
  });

  it('never returns pending even when every fact is pending', () => {
    const pending = internalSnapshotContent({
      heroMetrics: [{
        key: 'k', label: 'L', valueDisplay: 'V', metricType: 'delivery', isHeadline: true,
        publishable: true, verification: { class: 'pending', method: 'self' },
        measurement: { limitations: [] },
      }],
      situation: undefined, measurement: undefined,
      identity: {
        slug: 'x', title: 'X', organizationIdentityMode: 'hidden',
        organizationNamingConsent: false, builderIdentityMode: 'anonymous',
        builderNamingConsent: false,
      },
    });
    expect(resolveRecordVerification(pending).verificationClass).toBe('illustrative');
  });
});

/* --------------------------------------------------------- malformed data --- */

describe('malformed content degrades rather than throwing', () => {
  it('projects an almost-empty snapshot without throwing', () => {
    const bare = { identity: { slug: 's', title: 'T' } } as unknown as CaseStudySnapshotContent;
    const detail = projectPublicDetail(input(bare));
    expect(detail.slug).toBe('stockout-forecasting');
    expect(detail.heroMetrics).toEqual([]);
    expect(detail.repositories).toEqual([]);
    expect(detail.privateRepositoryCount).toBe(0);
    expect(Object.keys(detail).sort()).toEqual([...PUBLIC_DETAIL_KEYS].sort());
  });

  it('survives arrays that are not arrays', () => {
    const junk = {
      identity: { slug: 's', title: 'T' },
      heroMetrics: 'not-an-array',
      repositories: { nope: true },
      contributors: 42,
      taxonomy: { capabilities: null, stack: undefined, deliverables: 'x' },
    } as unknown as CaseStudySnapshotContent;
    expect(() => projectPublicDetail(input(junk))).not.toThrow();
    expect(projectPublicSummary(input(junk)).capabilities).toEqual([]);
  });
});
