import { resolveHeroImage } from '../caseStudyPublicSections';
import type { CaseStudySnapshotContent } from '../../../types/caseStudy';

/**
 * The cover image: an explicit choice, gated by artifact approval.
 *
 * WHY THIS EXISTS. `identity.heroImageUrl` was set on a record, verified present in
 * the stored snapshot, and the published page showed a DIFFERENT image — because
 * nothing read the field. It was not even on the domain type; it lived only on the
 * public projection as a computed output, so it was being written into snapshots as
 * an untyped extra property that no code consulted.
 *
 * The type-priority default is a good fallback and a poor decision-maker: two live
 * records each carry an `architecture` image and a `diagram`, and the better cover is
 * the architecture drawing on one and the data dashboard on the other. No ordering
 * expresses that. So a record may now name its cover — and the gate below is what
 * stops that becoming a way to publish an unapproved picture.
 */

const IMG = 'https://enterprise.colaberry.ai/site-v2/';
const artifact = (over: Record<string, unknown> = {}) => ({
  id: 'a1', artifactType: 'architecture', title: 'Diagram', sourceType: 'generated',
  visibility: 'public', status: 'approved', publicUrl: IMG + 'arch.png', ...over,
});
const content = (over: Record<string, unknown> = {}): CaseStudySnapshotContent => ({
  identity: { slug: 's', title: 't', organizationIdentityMode: 'named',
    organizationNamingConsent: true, builderIdentityMode: 'role_only',
    builderNamingConsent: false, ...(over.identity as object || {}) },
  taxonomy: { capabilities: [], stack: [], deliverables: [] },
  artifacts: (over.artifacts as never) ?? [artifact()],
} as never);

describe('resolveHeroImage — the record may choose its cover', () => {
  it('falls back to type priority when nothing is chosen', () => {
    const c = content({ artifacts: [
      artifact({ id: 'a1', artifactType: 'photo', publicUrl: IMG + 'photo.png' }),
      artifact({ id: 'a2', artifactType: 'screenshot', publicUrl: IMG + 'shot.png' }),
    ] });
    // screenshot outranks photo regardless of the order they were added.
    expect(resolveHeroImage(c)).toBe(IMG + 'shot.png');
  });

  it('HONOURS an explicit choice over the priority order', () => {
    // The whole point: a `diagram` can never win on priority — it is not on the
    // list — so without this a data dashboard could never be a cover.
    const c = content({
      identity: { heroImageUrl: IMG + 'dash.png' },
      artifacts: [
        artifact({ id: 'a1', artifactType: 'architecture', publicUrl: IMG + 'arch.png' }),
        artifact({ id: 'a2', artifactType: 'diagram', publicUrl: IMG + 'dash.png' }),
      ],
    });
    expect(resolveHeroImage(c)).toBe(IMG + 'dash.png');
  });

  it('REFUSES a chosen URL that is not an approved artifact', () => {
    // The gate. Without it, naming a URL would publish a picture the artifact
    // approval never saw — which is exactly what this field must not become.
    const c = content({
      identity: { heroImageUrl: IMG + 'never-approved.png' },
      artifacts: [artifact({ publicUrl: IMG + 'arch.png' })],
    });
    expect(resolveHeroImage(c)).toBe(IMG + 'arch.png');
  });

  it('REFUSES a chosen URL whose artifact is not approved', () => {
    const c = content({
      identity: { heroImageUrl: IMG + 'draft.png' },
      artifacts: [
        artifact({ id: 'a1', status: 'candidate', publicUrl: IMG + 'draft.png' }),
        artifact({ id: 'a2', artifactType: 'photo', publicUrl: IMG + 'ok.png' }),
      ],
    });
    expect(resolveHeroImage(c)).toBe(IMG + 'ok.png');
  });

  it('REFUSES a chosen URL whose artifact is not publicly viewable', () => {
    const c = content({
      identity: { heroImageUrl: IMG + 'private.png' },
      artifacts: [
        artifact({ id: 'a1', visibility: 'private', publicUrl: IMG + 'private.png' }),
        artifact({ id: 'a2', artifactType: 'photo', publicUrl: IMG + 'ok.png' }),
      ],
    });
    expect(resolveHeroImage(c)).toBe(IMG + 'ok.png');
  });

  it('REFUSES a chosen URL that is not http(s)', () => {
    const c = content({
      identity: { heroImageUrl: 'javascript:alert(1)' },
      artifacts: [artifact({ publicUrl: IMG + 'arch.png' })],
    });
    expect(resolveHeroImage(c)).toBe(IMG + 'arch.png');
  });

  it('returns null when there is no image at all', () => {
    expect(resolveHeroImage(content({ artifacts: [] }))).toBeNull();
  });
});
