import React from 'react';
import { Route, Routes } from 'react-router-dom';
import AdminCaseStudyDetailPage from '../AdminCaseStudyDetailPage';
import * as adminApi from '../../../services/caseStudyAdminApi';
import { CASE_STUDY_CONTROLS } from '../../../components/admin/caseStudy/caseStudyDesk';
import * as H from '../__fixtures__/domHarness';
import * as F from '../__fixtures__/caseStudyAdminFixtures';
import { installCaseStudyApiMocks } from '../__fixtures__/caseStudyApiMocks';

jest.mock('../../../services/caseStudyAdminApi');
const api = adminApi as jest.Mocked<typeof adminApi>;

/**
 * Every test here mounts the WHOLE review desk — twelve panels — and then drives
 * up to four sequential lens switches through it, each one a mount, a fetch and
 * a settle. Under jest's 5s default that is comfortable in isolation and a
 * coin-flip inside a 140-suite parallel run on a loaded machine, where these
 * suites take two to three times as long purely from CPU contention.
 *
 * A wall-clock allowance is not a weakened assertion: nothing below asserts less
 * because of this line. It is here so a red result means the behaviour broke
 * rather than that the machine was busy, which is the only way a failure stays
 * worth reading.
 */
jest.setTimeout(30000);

const ID = F.CASE_STUDY_ID;

/**
 * The surface lab on the real page: what pressing a tab does, and — far more
 * importantly — what it does not do.
 *
 * THE DANGEROUS VERSION OF THIS FEATURE is a lens switcher wired to the publish
 * surface, so an operator exploring what Training would look like is one click
 * from publishing to it. Three of the four lenses are `publishable: false` and
 * carry framing copy nobody has reviewed. So the assertions that matter most
 * here are the negative ones: no write API is called, and `publishCaseStudy` is
 * still passed `enterprise` after four tab presses.
 */

beforeEach(() => {
  H.stubConfirm(true);
  installCaseStudyApiMocks(api);
});

afterEach(() => {
  H.unmount();
  jest.clearAllMocks();
});

/**
 * Mount and open the SURFACES tab, where the lens lab lives.
 *
 * The detail page became a seven-tab Story Studio on 2026-08-26 and the lab
 * moved behind the SURFACES tab. The click is here rather than in each test
 * because every test in this file is about the lab and none of them is about
 * navigation — a per-test click would add fifteen identical lines and would let
 * one be forgotten silently.
 *
 * WHAT DOES NOT CHANGE: the page still auto-previews `enterprise` on MOUNT, not
 * on tab selection, so the write-call assertions below still cover the whole
 * journey from arrival to the lab.
 */
async function mountDetail(): Promise<void> {
  H.mount(
    <Routes>
      <Route path="/admin/case-studies/:id" element={<AdminCaseStudyDetailPage />} />
    </Routes>,
    `/admin/case-studies/${ID}`,
  );
  await H.settle();
  H.click('cs-studio-tab-surfaces');
  await H.settle();
}

/** Every API on this client that changes something. */
const WRITE_CALLS = [
  'publishCaseStudy', 'unpublishCaseStudy', 'applyCaseStudyOverride',
  'approveCaseStudySnapshot', 'syncCaseStudy', 'archiveCaseStudy', 'updateCaseStudy',
  'attachCaseStudyRepository', 'setCaseStudyRepositoryRole', 'removeCaseStudyRepository',
  'createCaseStudyFromProject', 'createCaseStudyFromRepositories',
] as const;

describe('the segmented control is four discrete lenses', () => {
  it('renders one tab per surface inside a real tablist', async () => {
    await mountDetail();
    expect(H.query('cs-surface-lab-tablist')).not.toBeNull();
    ['enterprise', 'training', 'ai-flotation', 'refactored'].forEach((key) => {
      const tab = H.el(`cs-lens-tab-${key}`);
      expect(tab.getAttribute('role')).toBe('tab');
      expect(tab.getAttribute('aria-controls')).toBe('cs-lens-panel');
    });
    expect(H.el('cs-lens-tab-enterprise').getAttribute('aria-selected')).toBe('true');
  });

  it('marks the live surface in TEXT, not by colour alone', async () => {
    await mountDetail();
    expect(H.query('cs-lens-live-marker')).not.toBeNull();
    expect(H.el('cs-lens-live-marker').textContent).toContain('LIVE');
  });

  it('moves selection to the pressed tab', async () => {
    await mountDetail();
    H.click('cs-lens-tab-training');
    await H.settle();
    expect(H.el('cs-lens-tab-training').getAttribute('aria-selected')).toBe('true');
    expect(H.el('cs-lens-tab-enterprise').getAttribute('aria-selected')).toBe('false');
    expect(H.text()).toContain('Will this prepare me for the work AI is creating?');
  });
});

describe('switching a lens creates nothing, publishes nothing, mutates nothing', () => {
  it('calls only the preview READ when a tab is pressed', async () => {
    await mountDetail();
    api.previewCaseStudy.mockClear();

    H.click('cs-lens-tab-training');
    await H.settle();
    H.click('cs-lens-tab-ai-flotation');
    await H.settle();
    H.click('cs-lens-tab-refactored');
    await H.settle();

    expect(api.previewCaseStudy).toHaveBeenCalledTimes(3);
    expect(api.previewCaseStudy).toHaveBeenLastCalledWith(ID, { surfaceKey: 'refactored' });

    WRITE_CALLS.forEach((name) => {
      expect(api[name]).not.toHaveBeenCalled();
    });
  });

  it('keeps publish bound to enterprise after the operator has explored every lens', async () => {
    // THE LOAD-BEARING TEST. Preview follows the tab; publish follows a
    // constant. If someone ever "tidies" those into one piece of state, this is
    // what goes red.
    //
    // STRONGER SINCE THE STUDIO TABS LANDED. The lens is now selected on
    // SURFACES and the publish button lives on PUBLISH, so the journey crosses
    // a tab boundary — and `lensSurface` survives that crossing, because it is
    // page state rather than tab state. This test therefore now proves the
    // separation holds across exactly the navigation an operator would really
    // perform: explore a lens, walk over to publish, press the button.
    await mountDetail();
    H.click('cs-lens-tab-training');
    await H.settle();
    H.click('cs-lens-tab-ai-flotation');
    await H.settle();

    H.click('cs-studio-tab-publish');
    await H.settle();
    H.click(`${CASE_STUDY_CONTROLS.publish}-enterprise`);
    await H.settle();

    expect(api.publishCaseStudy).toHaveBeenCalledWith(ID, { surfaceKey: 'enterprise' });
  });

  it('keeps unpublish bound to enterprise too', async () => {
    await mountDetail();
    H.click('cs-lens-tab-refactored');
    await H.settle();
    H.click('cs-studio-tab-publish');
    await H.settle();
    H.click(`${CASE_STUDY_CONTROLS.unpublish}-enterprise`);
    await H.settle();
    expect(api.unpublishCaseStudy).toHaveBeenCalledWith(ID, { surfaceKey: 'enterprise' });
  });

  /**
   * THE CAPABILITY ALI ASKED FOR: "control what Case Study is shown on what site".
   *
   * The two tests above prove publish does not FOLLOW the lens. This one proves
   * it can still be AIMED - at a second brand, deliberately, from that brand's own
   * row. Without it, the pair above would be satisfied by a page that had quietly
   * lost the ability to publish anywhere but Enterprise.
   */
  it('publishes to AI Flotation from its own row, while the lens sits elsewhere', async () => {
    await mountDetail();
    H.click('cs-lens-tab-training');
    await H.settle();
    H.click('cs-studio-tab-publish');
    await H.settle();
    H.click(`${CASE_STUDY_CONTROLS.publish}-ai-flotation`);
    await H.settle();

    // The row that was pressed decides the surface - not the lens tab, which is
    // still on Training, and not the Enterprise default.
    expect(api.publishCaseStudy).toHaveBeenCalledWith(ID, { surfaceKey: 'ai-flotation' });
  });

  it('offers a site with no page for this record a Publish, and a live one a Republish', async () => {
    await mountDetail();
    H.click('cs-studio-tab-publish');
    await H.settle();

    /* Republish is not decoration. It re-runs the gate and re-pins the approved
       snapshot, which is how an edited record reaches the public page - so a live
       row must never lose the control. */
    expect(H.el(`${CASE_STUDY_CONTROLS.publish}-enterprise`).textContent).toBe('Republish');
    expect(H.query(`${CASE_STUDY_CONTROLS.unpublish}-enterprise`)).not.toBeNull();

    expect(H.el(`${CASE_STUDY_CONTROLS.publish}-ai-flotation`).textContent).toBe('Publish');
    // Nothing to withdraw where nothing was published.
    expect(H.query(`${CASE_STUDY_CONTROLS.unpublish}-ai-flotation`)).toBeNull();
  });

  it('says so on screen, so the operator does not have to infer it', async () => {
    await mountDetail();
    H.click('cs-lens-tab-training');
    await H.settle();
    expect(H.el('cs-surface-lab-publish-note').textContent).toContain('enterprise');
    expect(H.text()).toContain('never writes, publishes or changes the record');
  });
});

describe('a lens the server refuses', () => {
  it('shows the refusal instead of the previous lens\'s content under a new name', async () => {
    await mountDetail();
    api.previewCaseStudy.mockRejectedValue({ response: { status: 403 } });
    api.describeApiError.mockReturnValue(
      'The Case Study surface lens lab is not enabled for this admin account.',
    );

    H.click('cs-lens-tab-training');
    await H.settle();

    expect(H.query('cs-surface-lab-error')).not.toBeNull();
    expect(H.text()).toContain('not enabled for this admin account');
    // The Enterprise projection must NOT still be on screen labelled Training.
    expect(H.query('cs-surface-lab-bands')).toBeNull();
    expect(H.query('cs-preview-projection-json')).toBeNull();
  });

  it('still refuses to write anything on the way to the 403', async () => {
    await mountDetail();
    api.previewCaseStudy.mockRejectedValue({ response: { status: 403 } });
    H.click('cs-lens-tab-ai-flotation');
    await H.settle();
    WRITE_CALLS.forEach((name) => expect(api[name]).not.toHaveBeenCalled());
  });
});

describe('the status line', () => {
  it('prints the record title and the canonical facts above the lens', async () => {
    await mountDetail();
    H.click('cs-lens-tab-training');
    await H.settle();
    const canonical = H.el('cs-surface-lab-canonical').textContent ?? '';
    expect(canonical).toContain('Colaberry team');
    expect(canonical).toContain('verified');
  });

  it('reports draft state as a state, with no invented change count', async () => {
    await mountDetail();
    const draft = H.el('cs-surface-lab-draft').textContent ?? '';
    expect(draft).toContain('draft is ahead');
    expect(draft).not.toMatch(/\d+\s+(change|changes|field|fields|edit|edits)/i);
    expect(draft).toContain('A state, not a count');
  });

  it('carries the real gate verdict beside the publication state', async () => {
    await mountDetail();
    const publication = H.el('cs-surface-lab-publication').textContent ?? '';
    expect(publication).toContain('gate: would refuse');
    expect(publication).toContain('metric_pending');
  });
});

describe('the reading order visibly differs between lenses', () => {
  const orderOf = (): string[] => Array.from(
    H.el('cs-surface-lab-bands').querySelectorAll('[data-testid^="cs-lens-band-"]'),
  ).map((n) => n.getAttribute('data-testid') ?? '');

  it('renders a different band sequence on Enterprise and AI Flotation', async () => {
    await mountDetail();
    H.click('cs-lens-tab-enterprise');
    await H.settle();
    const enterprise = orderOf();

    api.previewCaseStudy.mockResolvedValue(F.previewFixture({ surfaceKey: 'ai-flotation' }));
    H.click('cs-lens-tab-ai-flotation');
    await H.settle();
    const flotation = orderOf();

    expect(enterprise.length).toBeGreaterThan(3);
    expect(flotation).not.toEqual(enterprise);
    // Same bands, different order — the whole claim, asserted on the DOM.
    expect([...flotation].sort()).toEqual([...enterprise].sort());
  });

  it('marks the attribution floor on screen', async () => {
    await mountDetail();
    expect(H.query('cs-lens-required-contributors')).not.toBeNull();
    expect(H.query('cs-lens-required-repositories')).not.toBeNull();
  });
});
