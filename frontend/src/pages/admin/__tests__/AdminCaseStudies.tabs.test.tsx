import React from 'react';
import { Route, Routes } from 'react-router-dom';
import AdminCaseStudyDetailPage from '../AdminCaseStudyDetailPage';
import * as adminApi from '../../../services/caseStudyAdminApi';
import {
  CASE_STUDY_STUDIO_TABS, CASE_STUDY_STUDIO_CONTROLS,
} from '../../../components/admin/caseStudy/caseStudyStudioTabs';
import * as H from '../__fixtures__/domHarness';
import * as F from '../__fixtures__/caseStudyAdminFixtures';
import { installCaseStudyApiMocks } from '../__fixtures__/caseStudyApiMocks';

jest.mock('../../../services/caseStudyAdminApi');
const api = adminApi as jest.Mocked<typeof adminApi>;

/**
 * THE SUITE TWO FILE HEADERS SAID ALREADY EXISTED.
 *
 * `caseStudyStudioTabs.ts` and `AdminCaseStudyDetailPage.tsx` both close their
 * headers with a sentence of the form "`AdminCaseStudies.tabs.test.tsx` proves
 * the band survives on all seven tabs by mutation". No such file existed, and
 * `grep -rl cs-gate-band frontend/src --include=*.test.tsx` returned nothing:
 * the single invariant that makes tabs safe on this surface — that a reviewer
 * cannot reach a decision without seeing what the gate refuses — was protected
 * by a comment. This file is that guard, written after the claim rather than
 * before it.
 *
 * IT ALSO GUARDS THE THREE DEFECTS A PRODUCTION WALKTHROUGH FOUND ON
 * 2026-08-26, each of which is a case of a tab hiding something:
 *
 *   1. Every write reported its outcome into `CaseStudyPublishPanel`, which
 *      renders on PUBLISH only. Saving consent on TRUTH produced no visible
 *      response of any kind, success or failure.
 *   2. The Repository input and the Analyze button both carried
 *      `data-testid="cs-analyze-repo"`, so the §18 guard for "analyze
 *      repository" was asserting against a text box.
 *   3. The Narrative panel warned that a candidate has no snapshot and then
 *      offered three enabled Apply-override buttons, which 404.
 *
 * WHY WRITES ARE DRIVEN THROUGH THE REAL PANELS. Every assertion below reaches
 * its state by clicking what an operator clicks. Setting `actionNote` directly
 * would prove a band renders a prop and nothing about whether the surface can
 * put it on screen, which is the entire failure.
 */

jest.setTimeout(30000);

const ID = F.CASE_STUDY_ID;
const TAB_KEYS = CASE_STUDY_STUDIO_TABS.map((t) => t.key);

beforeEach(() => {
  H.stubConfirm(true);
  installCaseStudyApiMocks(api);
});

afterEach(() => {
  H.unmount();
  jest.clearAllMocks();
});

async function mountDetail(): Promise<void> {
  H.mount(
    <Routes>
      <Route path="/admin/case-studies/:id" element={<AdminCaseStudyDetailPage />} />
    </Routes>,
    `/admin/case-studies/${ID}`,
  );
  await H.settle();
}

async function openTab(key: string): Promise<void> {
  H.click(`cs-studio-tab-${key}`);
  await H.settle();
}

/* ------------------------------------------- the gate band survives tabs --- */

describe('the publish gate band is above the tab strip, not inside a tab', () => {
  it.each(TAB_KEYS)('renders on the %s tab', async (key) => {
    await mountDetail();
    await openTab(key);
    expect(H.query('cs-gate-band')).not.toBeNull();
  });

  it('names every refusal on a tab that is not PUBLISH', async () => {
    // The desk previews the live surface on arrival, so the gate verdict on
    // screen comes from the preview fixture, which refuses for two reasons.
    await mountDetail();
    await openTab('visuals');
    expect(H.query('cs-gate-band-count')).not.toBeNull();
    expect(H.text()).toContain('2 named reason');
    for (const blocker of F.blockersFixture()) {
      expect(H.query(`cs-gate-band-${blocker.code}`)).not.toBeNull();
    }
  });

  it('says "not yet evaluated" rather than "no blockers" before any verdict', async () => {
    api.previewCaseStudy.mockRejectedValue(new Error('preview unavailable'));
    await mountDetail();
    expect(H.query('cs-gate-band')).not.toBeNull();
    expect(H.text()).toContain('not yet evaluated');
    expect(H.text()).not.toContain('no refusals');
  });
});

/* -------------------------------- the outcome of a write survives tabs --- */

describe('what the last write did is visible on the tab that did it', () => {
  it('shows the success line on TRUTH after a consent save, not only on PUBLISH', async () => {
    await mountDetail();
    await openTab('truth');
    expect(H.query('cs-action-note')).toBeNull();

    H.click('cs-consent-save');
    await H.settle();

    expect(api.updateCaseStudy).toHaveBeenCalled();
    expect(H.query('cs-action-band')).not.toBeNull();
    expect(H.query('cs-action-note')).not.toBeNull();
    expect(H.text()).toContain('Consent saved on the record');
  });

  it('shows the failure line on TRUTH when the consent save is refused', async () => {
    api.updateCaseStudy.mockRejectedValue(new Error('HTTP 409'));
    api.describeApiError.mockReturnValue('This consent change was refused (HTTP 409).');
    await mountDetail();
    await openTab('truth');

    H.click('cs-consent-save');
    await H.settle();

    const error = H.query('cs-action-error');
    expect(error).not.toBeNull();
    expect(error?.textContent).toContain('refused');
    expect(H.query('cs-action-note')).toBeNull();
  });

  it('shows the outcome of a SOURCES write on SOURCES', async () => {
    await mountDetail();
    await openTab('sources');
    H.setValue('cs-repo-reference', 'colaberry/claims-evals');
    H.click('cs-attach-repository');
    await H.settle();

    expect(api.attachCaseStudyRepository).toHaveBeenCalled();
    expect(H.query('cs-action-note')).not.toBeNull();
    expect(H.text()).toContain('Repository attached');
  });

  it('keeps the outcome visible when the operator moves to another tab', async () => {
    await mountDetail();
    await openTab('truth');
    H.click('cs-consent-save');
    await H.settle();
    expect(H.query('cs-action-note')).not.toBeNull();

    await openTab('visuals');
    expect(H.query('cs-action-note')).not.toBeNull();
  });

  it('renders nothing at all before any write has happened', async () => {
    await mountDetail();
    expect(H.query('cs-action-band')).toBeNull();
    expect(H.query('cs-action-note')).toBeNull();
    expect(H.query('cs-action-error')).toBeNull();
  });
});

/* -------------------------------------------------- one id, one element --- */

describe('every control on a tab is addressable by exactly one id', () => {
  it('does not let the Repository input and the Analyze button share an id', async () => {
    await mountDetail();
    await openTab('sources');
    // Two elements answering to one id look exactly like one that works, which
    // is why this counts rather than asserting presence.
    expect(H.queryAll('cs-analyze-repo')).toHaveLength(1);
    expect(H.queryAll('cs-analyze-repo')[0].tagName).toBe('INPUT');
  });

  it('gives the Analyze button its own id, and it is a button', async () => {
    await mountDetail();
    await openTab('sources');
    const run = H.query(CASE_STUDY_STUDIO_CONTROLS['analyze repository']);
    expect(run).not.toBeNull();
    expect(run?.tagName).toBe('BUTTON');
  });

  it('offers each metric key to the chart builder exactly once', async () => {
    // A headline metric legitimately appears in BOTH heroMetrics and
    // measurement.metrics — the production pilot's does. Un-deduplicated, that
    // renders two checkboxes carrying one id, and the second label's `htmlFor`
    // toggles the first box.
    const shared = {
      key: 'verified_competencies',
      label: 'Competencies verified',
      valueDisplay: '10',
      unit: 'count',
      metricType: 'count',
      isHeadline: true,
      publishable: true,
      verification: { class: 'verified', method: 'system_export' },
      measurement: { baseline: '0', sample: 'every learner', limitations: [] },
    };
    api.getCaseStudy.mockResolvedValue(F.detailFixture({
      latestSnapshot: F.snapshotFixture(F.SNAPSHOT_DRAFT_ID, 3, 'draft', {
        heroMetrics: [shared],
        measurement: { narrative: [], metrics: [shared] },
      }),
    }));

    await mountDetail();
    await openTab('visuals');
    expect(H.queryAll('cs-chart-key-verified_competencies')).toHaveLength(1);
  });
});

/* ------------------------------- provenance answers its own question --- */

describe('the provenance panel reads the shape the server actually sends', () => {
  /**
   * On the live pilot record this panel rendered fourteen rows, every one
   * saying `unknown` with an empty detail, while the payload behind them
   * carried a tier, an actor, a repository and a commit sha for each. The
   * reader was looking for `source` / `sourceRef` — keys the entry type does
   * not have. The fixture encoded the same obsolete shape, which is why the
   * suite never noticed.
   */
  it('names the precedence tier rather than "unknown"', async () => {
    await mountDetail();
    await openTab('truth');
    const title = H.query('cs-provenance-identity.title');
    expect(title).not.toBeNull();
    expect(title?.textContent).toContain('repo_extraction');
    expect(title?.textContent).not.toContain('unknown');
  });

  it('shows the commit an extraction came from, shortened', async () => {
    await mountDetail();
    await openTab('truth');
    expect(H.query('cs-provenance-identity.title')?.textContent)
      .toContain('colaberry/claims-router@a1b2c3d');
  });

  it('shows who made a human override, and their note', async () => {
    await mountDetail();
    await openTab('truth');
    const row = H.query('cs-provenance-identity.standfirst');
    expect(row?.textContent).toContain('human_override');
    expect(row?.textContent).toContain('reviewer@colaberry.test');
    expect(row?.textContent).toContain('rewritten for the enterprise page');
  });

  it('still reads a pre-entry-type row rather than dropping it', async () => {
    await mountDetail();
    await openTab('truth');
    const legacy = H.query('cs-provenance-situation.heading');
    expect(legacy).not.toBeNull();
    expect(legacy?.textContent).toContain('repository_analysis');
  });

  it('leaves no row reading "unknown" for a payload that names its source', async () => {
    await mountDetail();
    await openTab('truth');
    const rows = Array.from(document.querySelectorAll('[data-testid^="cs-provenance-"]'))
      .map((n) => n.textContent || '')
      .filter((t) => t.includes('unknown'));
    expect(rows).toHaveLength(0);
  });
});

/* --------------------------------- the preview does not push the page --- */

describe('the preview JSON is contained rather than allowed to widen the page', () => {
  /**
   * A STYLE CONTRACT, AND ITS LIMIT IS STATED RATHER THAN GLOSSED.
   *
   * jsdom does no layout: `offsetWidth` is 0 for everything here, so nothing in
   * this file can measure an overflow. What it CAN do is refuse the silent
   * removal of the two declarations that were measured, on the live page, to be
   * the difference between a 1440px document and a 7745px one — a 6305px
   * horizontal overflow that dragged every other panel sideways with it.
   *
   * The measurement lives in the walkthrough, not here:
   *   rendered:  documentElement.scrollWidth 7745 against clientWidth 1440
   *   with these two declarations injected:  1440 against 1440
   * `overflow: 'auto'` was already present and did NOT prevent it. A box has to
   * be stopped from WIDENING before it can be asked to scroll.
   */
  it.each(['cs-preview-raw-json', 'cs-preview-projection-json'])(
    '%s wraps instead of widening', async (testId) => {
      await mountDetail();
      await openTab('preview');
      H.click('cs-preview');
      await H.settle();

      const pre = H.query(testId);
      expect(pre).not.toBeNull();
      expect(pre?.style.whiteSpace).toBe('pre-wrap');
      expect(pre?.style.overflowWrap).toBe('anywhere');
      expect(pre?.style.overflow).toBe('auto');
    },
  );
});

/* ------------------------------ an override the record cannot accept --- */

describe('the narrative override is inert when there is no snapshot to override', () => {
  beforeEach(() => {
    api.getCaseStudy.mockResolvedValue(F.detailFixture({
      latestSnapshot: null, approvedSnapshot: null,
    }));
  });

  it('still says, in the panel, that there is nothing to review', async () => {
    await mountDetail();
    await openTab('story');
    expect(H.query('cs-narrative-no-snapshot')).not.toBeNull();
  });

  it('disables the Apply control instead of letting it 404', async () => {
    await mountDetail();
    await openTab('story');
    const apply = H.query('cs-narrative-override') as HTMLButtonElement | null;
    expect(apply).not.toBeNull();
    expect(apply?.disabled).toBe(true);
    expect(H.query('cs-narrative-override-blocked')).not.toBeNull();
  });

  it('does not call the override API even with text typed into the field', async () => {
    // Typing first matters. `CaseStudyOverrideField` already returns early on an
    // empty value, so a click with a blank box calls nothing whether the field
    // is inert or not — a version of this test that skipped the typing would
    // stay green with the whole guard removed.
    await mountDetail();
    await openTab('story');
    H.setValue('cs-narrative-override-input', 'A standfirst nobody can save.');
    H.click('cs-narrative-override');
    await H.settle();
    expect(api.applyCaseStudyOverride).not.toHaveBeenCalled();
  });

  it('leaves the control usable once a snapshot exists', async () => {
    api.getCaseStudy.mockResolvedValue(F.detailFixture());
    await mountDetail();
    await openTab('story');
    const apply = H.query('cs-narrative-override') as HTMLButtonElement | null;
    expect(apply?.disabled).toBe(false);
    expect(H.query('cs-narrative-override-blocked')).toBeNull();
  });
});
