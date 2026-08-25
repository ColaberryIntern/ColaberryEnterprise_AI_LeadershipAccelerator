/**
 * caseStudyAdminPreview — spec §34, the admin preview renders through the PUBLIC
 * projection.
 *
 * WHY THIS SUITE EXISTS. The projection wiring was added to close a gap the T013
 * producer had disclosed, and it shipped with no test at all. Verification failed
 * the task for exactly that: new business logic under `backend/src/services/`
 * with no coverage, and a contract field (`CaseStudySurfacePreview.projection`)
 * that could regress to `null` silently while all 127 sibling tests stayed green.
 * CLAUDE.md is explicit — "if a contract change can be made silently without a
 * test failing, the contract is too weak."
 *
 * The load-bearing assertion is the deep-equality one at the bottom: it pins the
 * preview to `projectPublicDetail` itself, so "never a second renderer" is
 * enforced rather than merely asserted in a comment. Everything above it exists
 * so that a failure names WHICH property broke.
 */
jest.mock('../../../config/env', () => ({
  env: { publicAppUrl: 'https://enterprise.example.com' },
}));

// Pass-through mock: every test below runs the REAL projection, so the
// deep-equality assertion still compares two real renders. Only the failure-path
// test overrides it, because the projection turned out to degrade gracefully
// rather than throw (see that test's comment) — the catch is a backstop, and the
// only honest way to reach it is to make the dependency throw.
jest.mock('../caseStudyPublicProjection', () => {
  const actual = jest.requireActual('../caseStudyPublicProjection');
  return { ...actual, projectPublicDetail: jest.fn(actual.projectPublicDetail) };
});

import { projectPreviewDetail } from '../caseStudyAdminPreview';
import { projectPublicDetail } from '../caseStudyPublicProjection';
import type { CaseStudySnapshotContent } from '../../../types/caseStudy';

const PRIVATE_REPO_NAME = 'SECRET-INTERNAL-BILLING';
const PRIVATE_REPO_OWNER = 'acme-private-org';

/** One public repo + one private; one verified metric + one pending. */
function mixedContent(): CaseStudySnapshotContent {
  return {
    identity: {
      slug: 'acme-claims',
      title: 'Claims triage rebuild',
      standfirst: 'A nightly job, rewritten.',
      organizationIdentityMode: 'anonymized',
      organizationNamingConsent: false,
      builderIdentityMode: 'role_only',
      builderNamingConsent: false,
      builtByType: 'colaberry_team',
    },
    heroMetrics: [
      {
        key: 'verified_drop', label: 'Verified drop', valueDisplay: '41% fewer stockouts',
        metricType: 'performance', isHeadline: true, publishable: true,
        verification: { class: 'verified', method: 'repo', evidenceRef: 'ev-1' },
      },
      {
        key: 'pending_roi', label: 'Pending ROI', valueDisplay: '$1.2M saved',
        metricType: 'business_outcome', isHeadline: true, publishable: true,
        verification: { class: 'pending', method: 'internal' },
      },
    ],
    repositories: [
      {
        repoOwner: 'acme', repoName: 'public-app',
        repoUrl: 'https://github.com/acme/public-app',
        role: 'primary', visibility: 'public', accessStatus: 'connected',
        allowPublicRepoLink: true,
      },
      {
        repoOwner: PRIVATE_REPO_OWNER, repoName: PRIVATE_REPO_NAME,
        repoUrl: `https://github.com/${PRIVATE_REPO_OWNER}/${PRIVATE_REPO_NAME}`,
        role: 'backend', visibility: 'private', accessStatus: 'connected',
        allowPublicRepoLink: false,
      },
    ],
    taxonomy: {
      industry: 'insurance', primaryCapability: 'document-ai',
      capabilities: ['rag'], stack: ['python'], deliverables: ['pipeline'],
      projectStatus: 'shipped',
    },
  } as unknown as CaseStudySnapshotContent;
}

const snapshot = { content: mixedContent(), updated_at: '2026-08-20T10:00:00.000Z' };

describe('projectPreviewDetail — what the admin sees is what the public gets', () => {
  it('returns a projection for a snapshot that has content', () => {
    expect(projectPreviewDetail('acme-claims', snapshot, 'enterprise')).not.toBeNull();
  });

  it('drops the private repository entirely — name, owner and url', () => {
    const projection = projectPreviewDetail('acme-claims', snapshot, 'enterprise');
    const serialized = JSON.stringify(projection);

    // Non-vacuity: the sentinels really are in the input.
    expect(JSON.stringify(snapshot.content)).toContain(PRIVATE_REPO_NAME);
    expect(JSON.stringify(snapshot.content)).toContain(PRIVATE_REPO_OWNER);

    expect(serialized).not.toContain(PRIVATE_REPO_NAME);
    expect(serialized).not.toContain(PRIVATE_REPO_OWNER);
    expect(projection?.privateRepositoryCount).toBe(1);
  });

  it('omits the pending metric — an admin cannot approve on a figure the public never sees', () => {
    const projection = projectPreviewDetail('acme-claims', snapshot, 'enterprise');

    expect(projection?.heroMetrics.map((m) => m.label)).toEqual(['Verified drop']);
    expect(JSON.stringify(projection)).not.toContain('$1.2M saved');
  });

  it('is BYTE-IDENTICAL to projectPublicDetail on the same content — never a second renderer', () => {
    // The assertion that makes spec §34 enforceable. If someone later "improves"
    // the preview by rendering it differently, this fails.
    const projection = projectPreviewDetail('acme-claims', snapshot, 'enterprise');
    expect(projection).not.toBeNull();

    const direct = projectPublicDetail({
      surfaceKey: 'enterprise',
      slug: 'acme-claims',
      content: snapshot.content,
      publication: {
        featured: false,
        publishedAt: projection!.publishedAt,
        updatedAt: projection!.updatedAt,
        titleOverride: null,
        summaryOverride: null,
      },
      canonicalBaseUrl: 'https://enterprise.example.com',
    });

    expect(projection).toEqual(direct);
  });

  it('degrades rather than throwing on malformed content — the catch is a backstop, not the path', () => {
    // Worth pinning as behaviour: a null identity and a string where an array
    // belongs do NOT reach the catch. The projection walks them defensively and
    // returns an empty-but-valid public shape. That is the right design — an
    // admin sees "nothing publishable here yet" rather than a broken panel — and
    // it means the catch below is genuinely a last resort.
    const broken = { content: { identity: null, heroMetrics: 'not-an-array' }, updated_at: null };
    const projection = projectPreviewDetail('acme-claims', broken as never, 'enterprise');

    expect(projection).not.toBeNull();
    expect(projection?.heroMetrics).toEqual([]);
    expect(projection?.repositories).toEqual([]);
    expect(projection?.privateRepositoryCount).toBe(0);
  });

  it('failure path: a throwing renderer returns null and logs a classified error, never silently', () => {
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    (projectPublicDetail as jest.Mock).mockImplementationOnce(() => {
      throw new TypeError('renderer exploded');
    });

    expect(projectPreviewDetail('acme-claims', snapshot, 'enterprise')).toBeNull();

    // The point of the test: null must be accompanied by a signal. A bare
    // `catch { return null }` would make an empty preview panel indistinguishable
    // from "nothing built yet".
    expect(errorSpy).toHaveBeenCalled();
    const logged = JSON.parse(errorSpy.mock.calls[0][0] as string);
    expect(logged.event).toBe('case_study.preview_projection_failed');
    expect(logged.outcome).toBe('failure');
    expect(logged.error_class).toBe('TypeError');
    expect(logged.context.slug).toBe('acme-claims');
    errorSpy.mockRestore();
  });

  it('boundary: a snapshot with no content at all projects without throwing', () => {
    expect(() => projectPreviewDetail('acme-claims', { content: null }, 'enterprise')).not.toThrow();
  });
});
