import {
  ATMOSPHERE_ARTIFACT_TYPES,
  HERO_IMAGE_PRIORITY,
  artifactPresentation,
  describesDeliveredWork,
} from '../caseStudyArtifactPresentation';
import {
  MAX_DIAGRAM_SOURCE_CHARS,
  projectArchitecture,
  projectArtifacts,
  projectDiagramSource,
  projectMeasurement,
  resolveHeroImage,
} from '../caseStudyPublicSections';
import type {
  CaseStudyArtifactRef,
  CaseStudyArtifactType,
  CaseStudySnapshotContent,
} from '../../../types/caseStudy';

/**
 * `photo` — atmosphere, never evidence — and the human-authored diagram.
 *
 * WHAT THIS FILE IS DEFENDING. `docs/V2_CUTOVER_CARRYOVER.md` records the rule
 * the whole system inherits from the claims registry: *"a picture presented as
 * evidence of something that did not happen is a fabricated claim, it just
 * happens to be made of pixels."* A `photo` artifact type makes that rule
 * expressible; these tests make it enforced. Three separate mechanisms are
 * asserted here, because a comment saying "photos are atmosphere" costs nothing
 * and stops nothing:
 *
 *   1. RANK — a photograph cannot outrank a screenshot for the hero;
 *   2. LABEL — `presentation` is derived from the type, so no author can call a
 *      photograph evidence;
 *   3. CAPTION — a photograph whose words claim to show delivered work does not
 *      reach the wire at all.
 *
 * EVERY ASSERTION HERE HAS BEEN WATCHED TO FAIL. The mutations are recorded
 * beside the tests they break, because an assertion nobody has seen go red is a
 * claim about the code, not evidence about it.
 *
 * PURE. No database, no network, no clock — these are leaf functions of the
 * public projection and the suite passes with `DATABASE_URL` unset.
 */

/* ───────────────────────────────────────────────────────────── fixtures ──── */

const artifact = (over: Partial<CaseStudyArtifactRef> = {}): CaseStudyArtifactRef => ({
  id: 'a-0',
  artifactType: 'screenshot',
  title: 'The planner console',
  sourceType: 'manual',
  visibility: 'public',
  status: 'approved',
  publicUrl: 'https://media.example.org/console.png',
  ...over,
} as CaseStudyArtifactRef);

const contentWith = (artifacts: readonly CaseStudyArtifactRef[]): CaseStudySnapshotContent => ({
  identity: {
    slug: 'a-record', title: 'A record',
    organizationIdentityMode: 'hidden', organizationNamingConsent: false,
    builderIdentityMode: 'anonymous', builderNamingConsent: false,
  },
  heroMetrics: [],
  artifacts,
  taxonomy: { capabilities: [], stack: [], deliverables: [] },
});

/** Every member of the union, written out so a new member fails to compile. */
const ALL_ARTIFACT_TYPES: readonly CaseStudyArtifactType[] = [
  'screenshot', 'architecture', 'photo', 'demo', 'deck',
  'roadmap', 'report', 'evaluation', 'code', 'document', 'other',
];

/* ─────────────────────────────────────── 1. rank: a photo never leads ────── */

describe('a photograph never wins the hero from a real product image', () => {
  it('ranks the three image types, strongest claim first', () => {
    // Pinned literally rather than re-derived. A test that rebuilt this list
    // from the source would agree with whatever order it was handed, which is
    // the failure mode that makes an ordering test worthless.
    expect([...HERO_IMAGE_PRIORITY]).toEqual(['screenshot', 'architecture', 'photo']);
  });

  it('picks the screenshot even when the photograph is listed first', () => {
    // Order in the array is the trap: a naive "first image wins" implementation
    // passes every other test in this file and fails only this one.
    const hero = resolveHeroImage(contentWith([
      artifact({ id: 'p', artifactType: 'photo', title: 'The studio', publicUrl: 'https://media.example.org/studio.jpg' }),
      artifact({ id: 's', artifactType: 'screenshot', publicUrl: 'https://media.example.org/console.png' }),
    ]));
    expect(hero).toBe('https://media.example.org/console.png');
  });

  it('picks the architecture image over the photograph too', () => {
    const hero = resolveHeroImage(contentWith([
      artifact({ id: 'p', artifactType: 'photo', title: 'The studio', publicUrl: 'https://media.example.org/studio.jpg' }),
      artifact({ id: 'd', artifactType: 'architecture', title: 'System diagram', publicUrl: 'https://media.example.org/diagram.png' }),
    ]));
    expect(hero).toBe('https://media.example.org/diagram.png');
  });

  it('but IS willing to lead with a photograph when nothing else exists', () => {
    // The rule is "ranked below", not "never eligible". Without this case the
    // suite would equally pass an implementation that dropped `photo` from the
    // priority list altogether — a different rule, quietly substituted.
    const hero = resolveHeroImage(contentWith([
      artifact({ id: 'p', artifactType: 'photo', title: 'The studio', publicUrl: 'https://media.example.org/studio.jpg' }),
      artifact({ id: 'k', artifactType: 'deck', title: 'Deck', publicUrl: 'https://media.example.org/deck.pdf' }),
    ]));
    expect(hero).toBe('https://media.example.org/studio.jpg');
  });

  it('leads with nothing when the record has no image at all', () => {
    expect(resolveHeroImage(contentWith([
      artifact({ id: 'k', artifactType: 'deck', title: 'Deck', publicUrl: 'https://media.example.org/deck.pdf' }),
    ]))).toBeNull();
  });
});

/* ───────────────────────────── 2. label: derived, never editorial ────────── */

describe('what a picture is allowed to mean is derived from its type', () => {
  it('calls exactly one member of the union atmosphere', () => {
    const atmosphere = ALL_ARTIFACT_TYPES.filter((t) => artifactPresentation(t) === 'atmosphere');
    expect(atmosphere).toEqual(['photo']);
    expect([...ATMOSPHERE_ARTIFACT_TYPES]).toEqual(['photo']);
  });

  it('calls every other member evidence, including the ones that are not images', () => {
    for (const type of ALL_ARTIFACT_TYPES.filter((t) => t !== 'photo')) {
      expect({ type, presentation: artifactPresentation(type) })
        .toEqual({ type, presentation: 'evidence' });
    }
  });

  it('stamps the projected artifact, so no renderer has to decide', () => {
    const [photo, shot] = projectArtifacts([
      artifact({ id: 'p', artifactType: 'photo', title: 'The studio', publicUrl: 'https://media.example.org/studio.jpg' }),
      artifact({ id: 's', artifactType: 'screenshot' }),
    ]);
    expect(photo.presentation).toBe('atmosphere');
    expect(shot.presentation).toBe('evidence');
  });
});

/* ──────────────────────── 3. caption: a photo may not claim delivery ─────── */

describe('a photograph that claims to show delivered work is not published', () => {
  it('drops one whose TITLE makes the claim', () => {
    const out = projectArtifacts([
      artifact({ id: 'p', artifactType: 'photo', title: 'The delivered dashboard in production', publicUrl: 'https://media.example.org/studio.jpg' }),
    ]);
    expect(out).toEqual([]);
  });

  it('drops one whose DESCRIPTION makes the claim', () => {
    const out = projectArtifacts([
      artifact({
        id: 'p', artifactType: 'photo', title: 'A working session',
        description: 'The team on the day we shipped it.',
        publicUrl: 'https://media.example.org/studio.jpg',
      }),
    ]);
    expect(out).toEqual([]);
  });

  it('publishes one that says where it was taken and nothing more', () => {
    // Guard-the-guard. Without this the scan could reject every photograph and
    // all three assertions above would still be green.
    const out = projectArtifacts([
      artifact({
        id: 'p', artifactType: 'photo', title: 'The Dallas studio during a working session',
        description: 'A Tuesday afternoon in the room where the team met.',
        publicUrl: 'https://media.example.org/studio.jpg',
      }),
    ]);
    expect(out).toHaveLength(1);
    expect(out[0].presentation).toBe('atmosphere');
    expect(out[0].title).toBe('The Dallas studio during a working session');
  });

  it('does NOT suppress a screenshot that describes itself accurately', () => {
    // A screenshot titled "the shipped dashboard" is telling the truth. Scanning
    // every artifact type would delete the page's real evidence in the name of
    // protecting it, so the scan is scoped to atmosphere and this pins it.
    const out = projectArtifacts([
      artifact({ id: 's', artifactType: 'screenshot', title: 'The shipped dashboard in production' }),
    ]);
    expect(out).toHaveLength(1);
    expect(out[0].title).toBe('The shipped dashboard in production');
  });

  it('reads the closed vocabulary case-insensitively', () => {
    expect(describesDeliveredWork('We SHIPPED it in March')).toBe(true);
    expect(describesDeliveredWork('Proof of the rollout')).toBe(true);
    expect(describesDeliveredWork('A morning in the Dallas studio')).toBe(false);
    expect(describesDeliveredWork('')).toBe(false);
    expect(describesDeliveredWork(null)).toBe(false);
  });
});

/* ──────────────── 4. position: a photo is never in an evidence section ───── */

describe('no artifact of any kind can reach the measurement section', () => {
  it('projects a measurement made only of narrative and metrics', () => {
    // The structural half of "a photo never sits in an evidence position": the
    // measurement projection is built from `content.measurement` alone, so an
    // artifact has no shape to arrive in. Asserting the KEYS is what makes this
    // survive somebody later adding an `images` field to the section.
    const measurement = projectMeasurement({
      ...contentWith([artifact({ id: 'p', artifactType: 'photo', title: 'The studio', publicUrl: 'https://media.example.org/studio.jpg' })]),
      measurement: { narrative: ['Measured against the quarter before.'], metrics: [] },
    });
    expect(measurement).not.toBeNull();
    expect(Object.keys(measurement as object).sort()).toEqual(['metrics', 'narrative']);
  });

  it('carries no trace of the photograph anywhere in that payload', () => {
    const measurement = projectMeasurement({
      ...contentWith([artifact({ id: 'p', artifactType: 'photo', title: 'The Dallas studio', publicUrl: 'https://media.example.org/studio.jpg' })]),
      measurement: { narrative: ['Measured against the quarter before.'], metrics: [] },
    });
    const serialised = JSON.stringify(measurement);
    expect(serialised).not.toContain('studio');
    expect(serialised).not.toContain('photo');
  });
});

/* ─────────────────────────────── 5. the human-authored diagram source ────── */

describe('the mermaid source is a human artifact, sanitised at the boundary', () => {
  const CHART = 'flowchart TD\n  api[Planner API] --> worker[Route worker]';

  it('passes a plain flowchart through, trimmed', () => {
    expect(projectDiagramSource(`  ${CHART}  `)).toBe(CHART);
  });

  it('is null for an absent, empty or non-string source', () => {
    expect(projectDiagramSource(undefined)).toBeNull();
    expect(projectDiagramSource('   ')).toBeNull();
    expect(projectDiagramSource(42)).toBeNull();
  });

  it('refuses any source containing an angle bracket', () => {
    // The renderer hands mermaid's output to `innerHTML`. Mermaid's own strict
    // mode escapes labels, but this module cannot see the renderer's config and
    // must not depend on a setting three modules away.
    expect(projectDiagramSource('flowchart TD\n  a[<img src=x onerror=alert(1)>] --> b')).toBeNull();
    expect(projectDiagramSource('flowchart TD\n  a[Line<br/>break] --> b')).toBeNull();
  });

  it('refuses a source past the length cap', () => {
    expect(projectDiagramSource('a'.repeat(MAX_DIAGRAM_SOURCE_CHARS))).not.toBeNull();
    expect(projectDiagramSource('a'.repeat(MAX_DIAGRAM_SOURCE_CHARS + 1))).toBeNull();
  });

  it('reaches the public architecture section, beside the verified lists', () => {
    const projected = projectArchitecture({
      ...contentWith([]),
      architecture: {
        stack: ['TypeScript'], capabilities: ['routing'], diagramSource: CHART,
      },
    });
    expect(projected?.diagramSource).toBe(CHART);
    // The text lists are still there: the chart is an ADDITION, not a swap.
    // `normalizeFacetList` lowercases a facet, which is why this is not the
    // string the fixture supplied.
    expect(projected?.stack).toEqual(['typescript']);
  });

  it('is null on the ordinary record that has no drawing', () => {
    const projected = projectArchitecture({
      ...contentWith([]),
      architecture: { stack: ['TypeScript'], capabilities: [] },
    });
    expect(projected?.diagramSource).toBeNull();
  });

  it('is enough on its own to keep the section from being hidden', () => {
    const projected = projectArchitecture({
      ...contentWith([]),
      architecture: { stack: [], capabilities: [], diagramSource: CHART },
    });
    expect(projected).not.toBeNull();
    expect(projected?.diagramSource).toBe(CHART);
  });

  it('does not resurrect a section whose every field is empty', () => {
    expect(projectArchitecture({
      ...contentWith([]),
      architecture: { stack: [], capabilities: [] },
    })).toBeNull();
  });
});

/**
 * The rendered picture of that chart, for the two surfaces that cannot draw one.
 *
 * WHAT THIS IS DEFENDING. Only the Enterprise app can draw mermaid; it imports the
 * library from a CDN its own CSP allows. `training.colaberry.com` serves
 * `script-src 'self' ...` with no CDN in it, and the AI Flotation shell ships no
 * dependencies at all. Both rendered the architecture band with no chart while
 * `diagramSource` sat in the payload the whole time — present in the data, invisible
 * on the page. `diagramImageUrl` is the form all three can show.
 *
 * Two properties matter and both are asserted below, because each has a way of
 * being quietly wrong:
 *
 *   1. It goes through `safeHttpUrl`, like every other public URL. The field is set
 *      by a human override and lands in an `img src`, so a `javascript:` value here
 *      would be stored XSS.
 *   2. It is carried ONLY beside a source. An image with no `diagramSource` behind it
 *      is a picture the record cannot be checked against, and
 *      `renderCaseStudyDiagram.js` could not have produced it — it renders the source.
 */
describe('the pre-rendered diagram image, for surfaces that cannot draw mermaid', () => {
  const IMAGE = 'https://enterprise.colaberry.ai/site-v2/diagram-example.png';
  const CHART = 'flowchart TD\n  api[Planner API] --> worker[Route worker]';

  it('travels beside the source it depicts', () => {
    const projected = projectArchitecture({
      ...contentWith([]),
      architecture: {
        stack: ['TypeScript'], capabilities: [], diagramSource: CHART, diagramImageUrl: IMAGE,
      },
    });
    expect(projected?.diagramImageUrl).toBe(IMAGE);
    // The source is still there. Enterprise keeps drawing the live chart from it;
    // the picture is for the surfaces that cannot. Mutating the projection to
    // return the image INSTEAD of the source breaks this line.
    expect(projected?.diagramSource).toBe(CHART);
  });

  it('is dropped when there is no source behind it', () => {
    const projected = projectArchitecture({
      ...contentWith([]),
      architecture: { stack: ['TypeScript'], capabilities: [], diagramImageUrl: IMAGE },
    });
    expect(projected?.diagramImageUrl).toBeNull();
  });

  it('refuses a javascript: URL, which would be stored XSS in an img src', () => {
    const projected = projectArchitecture({
      ...contentWith([]),
      architecture: {
        stack: [], capabilities: [], diagramSource: CHART,
        // eslint-disable-next-line no-script-url -- the payload under test
        diagramImageUrl: 'javascript:alert(1)',
      },
    });
    expect(projected?.diagramImageUrl).toBeNull();
    // The chart itself is unaffected: a bad picture must not cost the record its
    // architecture band.
    expect(projected?.diagramSource).toBe(CHART);
  });

  it('is null on the ordinary record that names no image', () => {
    const projected = projectArchitecture({
      ...contentWith([]),
      architecture: { stack: ['TypeScript'], capabilities: [], diagramSource: CHART },
    });
    expect(projected?.diagramImageUrl).toBeNull();
  });

  it('cannot on its own keep an otherwise empty section alive', () => {
    expect(projectArchitecture({
      ...contentWith([]),
      architecture: { stack: [], capabilities: [], diagramImageUrl: IMAGE },
    })).toBeNull();
  });
});
