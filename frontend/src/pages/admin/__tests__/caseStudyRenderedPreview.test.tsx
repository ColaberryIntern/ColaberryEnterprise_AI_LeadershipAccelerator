import fs from 'fs';
import path from 'path';
import React from 'react';
import { Route, Routes } from 'react-router-dom';
import AdminCaseStudyDetailPage from '../AdminCaseStudyDetailPage';
import * as adminApi from '../../../services/caseStudyAdminApi';
import * as H from '../__fixtures__/domHarness';
import * as F from '../__fixtures__/caseStudyAdminFixtures';
import { installCaseStudyApiMocks } from '../__fixtures__/caseStudyApiMocks';
import type { CaseStudySurfaceKey } from '../../../services/caseStudyAdminTypes';

jest.mock('../../../services/caseStudyAdminApi');
const api = adminApi as jest.Mocked<typeof adminApi>;

/**
 * caseStudyRenderedPreview.test.tsx — the guard for the Story Studio's PREVIEW
 * tab, which since 2026-08-27 opens on the RENDERED page instead of two columns
 * of JSON.
 *
 * WHY THIS FILE HAD TO BE WRITTEN. `CaseStudyRenderedPreview.tsx` closes its
 * header with a sentence naming this file and describing what it enforces. No
 * such file existed. That is the same defect `AdminCaseStudies.tabs.test.tsx`
 * was written to correct one day earlier — an invariant protected by a comment
 * that asserts a test exists — and it is worse here, because the thing being
 * claimed is the isolation argument for rendering a public page inside the
 * admin shell without an iframe. Written after the claim rather than before it.
 *
 * THE FOUR PROPERTIES BELOW ARE THE ONES THE TAB IS FOR:
 *
 *   1. It renders the record's OWN content, not a placeholder or a skeleton. A
 *      preview that renders a plausible shape full of nothing is the failure
 *      that made the JSON columns look preferable in the first place.
 *   2. Switching a surface changes WHAT RENDERS, inside the frame — not merely
 *      the caption above it. A caption that changes over an unchanged page is
 *      a preview that lies about which audience it is showing.
 *   3. Switching a surface WRITES NOTHING. Three of the four surfaces are not
 *      publishable and carry framing copy nobody has approved.
 *   4. The payload the tab used to open on is still reachable, in full. It
 *      answers a question the rendered page cannot: what a visitor will NEVER
 *      see. Two of its assertions are the private-repository leak proof, and
 *      they live in `AdminCaseStudies.states.test.tsx`.
 *
 * MOUNTED THROUGH THE REAL PAGE, never by handing props to the panel. Rendering
 * `CaseStudyRenderedPreview` directly with a fixture would prove it can draw a
 * projection and nothing about whether the page can put one in front of an
 * operator — which is the whole question.
 */

jest.setTimeout(30000);

const ID = F.CASE_STUDY_ID;

/** Every API on this client that changes something. Mirrors the SURFACES suite. */
const WRITE_CALLS = [
  'publishCaseStudy', 'unpublishCaseStudy', 'applyCaseStudyOverride',
  'approveCaseStudySnapshot', 'syncCaseStudy', 'archiveCaseStudy', 'updateCaseStudy',
  'attachCaseStudyRepository', 'setCaseStudyRepositoryRole', 'removeCaseStudyRepository',
  'createCaseStudyFromProject', 'createCaseStudyFromRepositories',
] as const;

beforeEach(() => {
  H.stubConfirm(true);
  installCaseStudyApiMocks(api);
  /**
   * ANSWER PER SURFACE, not one fixed payload.
   *
   * The default mock resolves `previewFixture()` — always enterprise — which
   * would make "switching a surface changes what renders" pass or fail for
   * reasons that have nothing to do with the product: the page would receive
   * the same projection whatever it asked for. Echoing the requested surface
   * back is what makes the band-order assertion mean anything.
   *
   * `snapshotId` reads (provenance, published-vs-draft) carry no surfaceKey and
   * fall back to enterprise, which is what they did before.
   */
  api.previewCaseStudy.mockImplementation((_id: string, opts?: {
    surfaceKey?: CaseStudySurfaceKey; snapshotId?: string;
  }) => Promise.resolve(F.previewFixture({ surfaceKey: opts?.surfaceKey ?? 'enterprise' })));
});

afterEach(() => {
  H.unmount();
  jest.clearAllMocks();
});

/** Mount the detail page and open PREVIEW, where the rendered page lives. */
async function mountPreview(): Promise<void> {
  H.mount(
    <Routes>
      <Route path="/admin/case-studies/:id" element={<AdminCaseStudyDetailPage />} />
    </Routes>,
    `/admin/case-studies/${ID}`,
  );
  await H.settle();
  H.click('cs-studio-tab-preview');
  await H.settle();
}

/**
 * The bands actually drawn inside the frame, in DOM order.
 *
 * Read from `data-section`, which `StorySectionList` puts on the real page's
 * own `<section>` elements — so this reads the rendered OUTPUT, not the surface
 * fixture's `sectionOrder` input. Asserting against the input would restate the
 * fixture and pass with the renderer removed.
 */
function renderedBands(): string[] {
  const frame = H.el('cs-preview-render-frame');
  return Array.from(frame.querySelectorAll('[data-section]'))
    .map((node) => node.getAttribute('data-section') ?? '');
}

/* ------------------------------------- 1. it renders the page, with content --- */

describe('PREVIEW opens on the rendered page rather than on a payload', () => {
  it('mounts the same component the public route renders', async () => {
    await mountPreview();
    const frame = H.el('cs-preview-render-frame');
    // `story-article` is `StoryDetailArticle`'s own root. Its presence here is
    // the single fact that makes this a preview rather than a second drawing
    // of the page: there is one renderer and the admin is its second caller.
    expect(frame.querySelector('[data-testid="story-article"]')).not.toBeNull();
  });

  it('opens with the JSON columns closed, behind a button that says so', async () => {
    await mountPreview();
    expect(H.el('cs-preview-payload-toggle').textContent).toContain('Show payload');
    expect(H.el('cs-preview-payload-toggle').getAttribute('aria-expanded')).toBe('false');
    expect(H.query('cs-preview-raw-json')).toBeNull();
    expect(H.query('cs-preview-projection-json')).toBeNull();
  });

  it('renders THIS record\'s content, not a placeholder', async () => {
    await mountPreview();
    const frame = H.el('cs-preview-render-frame');
    const rendered = frame.textContent ?? '';
    // Each of these comes off the projection the API returned. A skeleton, a
    // spinner or a "nothing to preview" panel fails every one of them.
    expect(rendered).toContain('Claims triage copilot');
    expect(rendered).toContain('Generated standfirst from the repository README.');
    expect(rendered).toContain('Reopened claims');
    expect(rendered).toContain('3%');
    // The record is the projection, so the organization reads as the public
    // label. Consent is not recorded on this fixture and the client is not
    // named — the same withholding the public page performs.
    expect(rendered).toContain('A national insurance carrier');
    expect(rendered).not.toContain('Northwind Mutual');
  });

  it('draws the record\'s real bands, not one band and an ellipsis', async () => {
    await mountPreview();
    const bands = renderedBands();
    expect(bands.length).toBeGreaterThanOrEqual(6);
    ['situation', 'build', 'architecture', 'measurement', 'cta']
      .forEach((key) => expect(bands).toContain(key));
  });

  it('says the frame is inert, and it is: the copy-link control does nothing', async () => {
    await mountPreview();
    expect(H.text()).toContain('Links and buttons inside the frame are inert');
    // `onShare` is not passed, so this button has no handler at all. Clicking it
    // must not reach the live region the public page uses to confirm a copy.
    H.click('story-share');
    await H.settle();
    expect(H.text()).not.toContain('Link copied.');
  });
});

/* ------------------------------------- 2. switching a surface re-renders --- */

describe('switching a surface changes what renders, not just the caption', () => {
  it('reorders the bands inside the frame', async () => {
    await mountPreview();
    const enterprise = renderedBands();

    H.click('cs-preview-surface-tab-training');
    await H.settle();
    const training = renderedBands();

    // Both are real pages, not an empty frame that trivially "differs".
    expect(enterprise.length).toBeGreaterThanOrEqual(6);
    expect(training).toHaveLength(enterprise.length);
    expect(training).not.toEqual(enterprise);

    // The specific flip, named rather than left to a deep-equality diff:
    // Enterprise leads with the work, Training leads with who did it.
    expect(enterprise.indexOf('build')).toBeLessThan(enterprise.indexOf('contributors'));
    expect(training.indexOf('contributors')).toBeLessThan(training.indexOf('build'));
  });

  it('moves the caption WITH the page, so the label and the content agree', async () => {
    await mountPreview();
    H.click('cs-preview-surface-tab-refactored');
    await H.settle();
    expect(H.el('cs-preview-surface-tab-refactored').getAttribute('aria-selected')).toBe('true');
    // The surface's own eyebrow is rendered by the page's masthead, inside the
    // frame. If the caption moved and the frame did not, this is what catches it.
    expect(H.el('cs-preview-render-frame').textContent).toContain('refactored');
  });

  it('keeps its own surface: PREVIEW and SURFACES no longer move together', async () => {
    // The reason `useCaseStudyPreviewLens` exists. Until 2026-08-27 both tabs
    // read one `lensSurface`, so choosing a surface to preview silently moved
    // the lens the SURFACES tab was inspecting.
    await mountPreview();
    H.click('cs-preview-surface-tab-training');
    await H.settle();

    H.click('cs-studio-tab-surfaces');
    await H.settle();
    expect(H.el('cs-lens-tab-enterprise').getAttribute('aria-selected')).toBe('true');
    expect(H.el('cs-lens-tab-training').getAttribute('aria-selected')).toBe('false');
  });
});

/* ------------------------------------------ 3. switching writes nothing --- */

describe('switching a surface in PREVIEW is a read', () => {
  it('calls only the preview GET across all four surfaces', async () => {
    await mountPreview();
    api.previewCaseStudy.mockClear();

    H.click('cs-preview-surface-tab-training');
    await H.settle();
    H.click('cs-preview-surface-tab-ai-flotation');
    await H.settle();
    H.click('cs-preview-surface-tab-refactored');
    await H.settle();
    H.click('cs-preview-surface-tab-enterprise');
    await H.settle();

    expect(api.previewCaseStudy).toHaveBeenCalledTimes(4);
    expect(api.previewCaseStudy).toHaveBeenLastCalledWith(ID, { surfaceKey: 'enterprise' });
    WRITE_CALLS.forEach((name) => expect(api[name]).not.toHaveBeenCalled());
  });

  it('leaves publish bound to enterprise after the operator has previewed every surface', async () => {
    // The dangerous version of this tab is a surface selector wired to the
    // publish surface, so an operator looking at Training is one click from
    // publishing to it. `PUBLISH_SURFACE` is passed to the lens as a VALUE and
    // never read back out.
    await mountPreview();
    H.click('cs-preview-surface-tab-training');
    await H.settle();
    H.click('cs-preview-surface-tab-ai-flotation');
    await H.settle();

    H.click('cs-studio-tab-publish');
    await H.settle();
    H.click('cs-publish');
    await H.settle();

    expect(api.publishCaseStudy).toHaveBeenCalledWith(ID, { surfaceKey: 'enterprise' });
  });

  it('shows the refusal instead of the previous surface\'s page under a new name', async () => {
    await mountPreview();
    api.previewCaseStudy.mockRejectedValue({ response: { status: 403 } });
    api.describeApiError.mockReturnValue(
      'The Case Study surface lens lab is not enabled for this admin account.',
    );

    H.click('cs-preview-surface-tab-training');
    await H.settle();

    expect(H.query('cs-preview-render-error')).not.toBeNull();
    expect(H.text()).toContain('not enabled for this admin account');
    // The Enterprise page must NOT still be on screen under a Training heading.
    expect(H.query('cs-preview-render-frame')).toBeNull();
    WRITE_CALLS.forEach((name) => expect(api[name]).not.toHaveBeenCalled());
  });
});

/* --------------------------------------- 4. the payload is still in full --- */

describe('the payload the tab used to open on is one button away, intact', () => {
  it('exposes BOTH columns and the delta between them', async () => {
    await mountPreview();
    H.click('cs-preview-payload-toggle');
    await H.settle();

    expect(H.el('cs-preview-payload-toggle').getAttribute('aria-expanded')).toBe('true');
    expect(H.query('cs-preview-raw-json')).not.toBeNull();
    expect(H.query('cs-preview-projection-json')).not.toBeNull();
    // Non-vacuity: both columns carry a real payload, not an empty <pre>.
    expect((H.el('cs-preview-raw-json').textContent ?? '').length).toBeGreaterThan(100);
    expect((H.el('cs-preview-projection-json').textContent ?? '').length).toBeGreaterThan(100);
    // The delta is the reason the columns survived at all.
    expect(H.text()).toContain('What the projection withheld');
  });

  it('closes again, and the rendered page is still there underneath', async () => {
    await mountPreview();
    H.click('cs-preview-payload-toggle');
    await H.settle();
    H.click('cs-preview-payload-toggle');
    await H.settle();

    expect(H.query('cs-preview-raw-json')).toBeNull();
    expect(H.query('cs-preview-projection-json')).toBeNull();
    expect(H.query('cs-preview-render-frame')).not.toBeNull();
  });
});

/* ----------------------------------------- the isolation argument itself --- */

/**
 * WHY A CONTAINER AND NOT AN IFRAME, ENFORCED RATHER THAN ASSERTED.
 *
 * `CaseStudyRenderedPreview.tsx` and `caseStudyRenderedPreview.css` both argue
 * that a plain container is safe because every selector in the seven
 * stylesheets the story page leans on is inside the `cbv2-` namespace, and the
 * admin shell assigns no `cbv2-` class anywhere. That argument is only as good
 * as the day it was checked. This reads the sheets.
 *
 * KEYFRAME STOPS ARE NOT SELECTORS. `from`, `to` and `70%` appear at the head of
 * a block and match nothing in the document, so they are excluded by name
 * rather than by a loose regex that would also excuse a real bare selector.
 */
const STYLESHEETS = [
  'components/publicV2/publicV2.css',
  'components/publicV2/cinematicV2.css',
  'pages/publicV2/homeV2.css',
  'pages/publicV2/servicesV2.css',
  'pages/publicV2/storyDetailV2.css',
  'pages/publicV2/storyMediaV2.css',
  'components/caseStudy/caseStudy.css',
];

const SRC = path.join(__dirname, '..', '..', '..');
const KEYFRAME_STOP = /^(from|to|-?\d+(\.\d+)?%)$/;

/** Selector lists, comments removed, split to one selector per entry. */
function selectorsIn(file: string): string[] {
  const css = fs.readFileSync(path.join(SRC, file), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
  const out: string[] = [];
  for (const block of css.split('}')) {
    const head = block.split('{')[0];
    // `@media`, `@supports` and `@keyframes` heads are at-rules, not selectors.
    if (!block.includes('{') || head.includes('@')) continue;
    head.split(',').map((s) => s.trim()).filter(Boolean).forEach((s) => out.push(s));
  }
  return out;
}

describe('the story stylesheets stay inside the cbv2- namespace', () => {
  it.each(STYLESHEETS)('%s names nothing the admin shell could match', (file) => {
    const selectors = selectorsIn(file);
    // Non-vacuity: a path typo or a parser that returns nothing would otherwise
    // make this test pass by finding no selectors to object to.
    expect(selectors.length).toBeGreaterThan(5);
    const foreign = selectors
      .filter((s) => !KEYFRAME_STOP.test(s))
      .filter((s) => !s.includes('cbv2-'));
    // A failure prints the offending selectors, not a count.
    expect(foreign).toEqual([]);
  });

  it('the frame\'s own sheet scopes every rule under .cs-story-preview', () => {
    const selectors = selectorsIn('pages/admin/caseStudyRenderedPreview.css');
    expect(selectors.length).toBeGreaterThan(0);
    selectors.forEach((s) => expect(s).toContain('cs-story-preview'));
  });
});
