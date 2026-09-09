import React from 'react';
import { Route, Routes } from 'react-router-dom';
import AdminCaseStudiesPage from '../AdminCaseStudiesPage';
import AdminCaseStudyDetailPage from '../AdminCaseStudyDetailPage';
import * as adminApi from '../../../services/caseStudyAdminApi';
import { CASE_STUDY_CONTROLS } from '../../../components/admin/caseStudy/caseStudyDesk';
import {
  ALL_LINKS, NAV_GROUPS, sectionForPath, UNLISTED_PATH_SECTIONS,
} from '../../../components/Layout/adminNav';
import * as H from '../__fixtures__/domHarness';
import * as F from '../__fixtures__/caseStudyAdminFixtures';
import { installCaseStudyApiMocks } from '../__fixtures__/caseStudyApiMocks';

jest.mock('../../../services/caseStudyAdminApi');
const api = adminApi as jest.Mocked<typeof adminApi>;

/**
 * WALL-CLOCK ALLOWANCE, ADDED 2026-08-26 (CC-20260826-h4k9), AND WHY.
 *
 * The detail page now renders the live lens on arrival, so every mount in this
 * file does one more fetch-and-settle cycle than it did before. In isolation
 * that is nothing; inside a 140-suite parallel run on a loaded machine it pushes
 * the slowest tests here past jest's 5s default, and they fail as timeouts with
 * no assertion involved. Naming it rather than leaving a flake for the next
 * reader to rediscover.
 *
 * NOTHING BELOW ASSERTS LESS BECAUSE OF THIS LINE. It buys time, not leniency.
 */
jest.setTimeout(30000);

/** The real implementation, used to prove the mocked one is not a fiction. */
const realApi = jest.requireActual<typeof adminApi>('../../../services/caseStudyAdminApi');

const ID = F.CASE_STUDY_ID;
const EMPTY = { items: [], total: 0, limit: 25, offset: 0 };

beforeEach(() => {
  H.stubConfirm(true);
  installCaseStudyApiMocks(api);
  // These suites are about what an EMPTY, a BROKEN and a FILTERED list say, so
  // the list call is the one default that is deliberately replaced.
  api.listCaseStudies.mockResolvedValue(EMPTY);
});

afterEach(() => {
  H.unmount();
  jest.clearAllMocks();
});

/**
 * Mount the detail page, optionally opening one of the seven Story Studio tabs.
 *
 * The tab is named per test rather than derived, because these tests are not
 * about capabilities: they are about what four DIFFERENT SITUATIONS say on
 * screen, and the situation determines which panel has to be visible. Passing
 * no tab leaves the landing tab open, which is what the load-failure test wants
 * — it asserts the error path renders instead of any tab at all.
 */
async function mountDetail(tab?: string): Promise<void> {
  H.mount(
    <Routes>
      <Route path="/admin/case-studies/:id" element={<AdminCaseStudyDetailPage />} />
    </Routes>,
    `/admin/case-studies/${ID}`,
  );
  await H.settle();
  if (!tab) return;
  H.click(`cs-studio-tab-${tab}`);
  await H.settle();
}

/**
 * Open the PREVIEW tab's raw-vs-projection payload, which is what the tab used
 * to open ON and is now one button behind.
 *
 * WHY THE ASSERTIONS BELOW DID NOT MOVE WITH IT. On 2026-08-27 the PREVIEW tab's
 * default view became the RENDERED page, and `CaseStudyPreviewPanel` — the two
 * JSON columns and the delta between them — moved behind "Show payload". The
 * three tests that read those columns are unchanged in what they assert; they
 * gained this one line and nothing else. Two of them are the leak proof for a
 * private repository, and a leak proof that stops finding its target is worse
 * than one that was deleted, because it goes on reporting green.
 *
 * `H.click` resolves through `H.el`, which THROWS by name when an id is absent.
 * So this helper cannot silently no-op: if the toggle is renamed or removed, the
 * tests that call it fail HERE rather than passing vacuously further down.
 */
async function openPayload(): Promise<void> {
  H.click('cs-preview-payload-toggle');
  await H.settle();
}

/**
 * A FAILED LOAD AND AN EMPTY RESULT MUST NOT RENDER THE SAME.
 *
 * The admin leads page shipped the collapsed version of this: it caught a failed
 * fetch with `console.error`, left its rows at [], and told an operator "No leads
 * yet" against 24,244 real rows. Four situations, four sentences.
 */
describe('AdminCaseStudiesPage — loading, broken, filtered and empty are four things', () => {
  it('says it is loading before the first response arrives', async () => {
    api.listCaseStudies.mockReturnValue(new Promise(() => {}));
    H.mount(<AdminCaseStudiesPage />, '/admin/case-studies');
    expect(H.text()).toContain('Loading Case Studies');
    expect(H.text()).not.toContain('No Case Studies exist yet');
  });

  it('says the load failed, and does NOT claim the database is empty', async () => {
    api.listCaseStudies.mockRejectedValue({ response: { status: 500 } });
    H.mount(<AdminCaseStudiesPage />, '/admin/case-studies');
    await H.settle();
    expect(H.text()).toContain('Could not load Case Studies');
    expect(H.text()).not.toContain('No Case Studies exist yet');
    expect(api.describeApiError).toHaveBeenCalledWith(expect.anything(), 'Case Studies');
  });

  it('names an authorization failure specifically', async () => {
    api.listCaseStudies.mockRejectedValue({ response: { status: 403 } });
    api.describeApiError.mockReturnValue(
      'Your session is not authorized to read Case Studies. Sign in again.',
    );
    H.mount(<AdminCaseStudiesPage />, '/admin/case-studies');
    await H.settle();
    expect(H.text()).toContain('Sign in again');
    expect(H.text()).not.toContain('No Case Studies exist yet');
  });

  it('claims emptiness only when an unfiltered request actually returned nothing', async () => {
    H.mount(<AdminCaseStudiesPage />, '/admin/case-studies');
    await H.settle();
    expect(H.text()).toContain('No Case Studies exist yet');
  });

  it('says "no match" — not "none exist" — when a state filter is what emptied it', async () => {
    H.mount(<AdminCaseStudiesPage />, '/admin/case-studies');
    await H.settle();
    H.click('cs-state-published');
    await H.settle();
    expect(H.text()).toContain('No Case Studies match the "Published" state');
    expect(H.text()).not.toContain('No Case Studies exist yet');
  });
});

/**
 * A REFUSED PUBLISH IS A LIST OF NAMED CONDITIONS, NOT AN ERROR MESSAGE.
 *
 * The gate returns every reason at once, each with the field it concerns and the
 * remedy that closes it. Rendering "cannot publish", or rendering only the first
 * reason, throws away the whole point of the gate: an admin fixes one thing,
 * presses the button again, and meets the next refusal.
 */
describe('AdminCaseStudyDetailPage — the publish gate speaks in full', () => {
  const blockers = F.blockersFixture();

  const refusePublish = () => {
    api.publishCaseStudy.mockRejectedValue({
      response: { status: 400, data: { error: 'Cannot publish', blockers } },
    });
    api.publishBlockersFrom.mockReturnValue(blockers);
  };

  it('renders EVERY blocker the gate named, not the first', async () => {
    refusePublish();
    await mountDetail('publish');
    H.click(`${CASE_STUDY_CONTROLS.publish}-enterprise`);
    await H.settle();

    expect(H.text()).toContain(blockers[0].message);
    expect(H.text()).toContain(blockers[1].message);
    expect(H.query('cs-publish-blocker-0')).not.toBeNull();
    expect(H.query('cs-publish-blocker-1')).not.toBeNull();
    expect(H.text()).toContain('2 named reasons');
  });

  it('gives each blocker its field and its remedy, so the reason is actionable', async () => {
    refusePublish();
    await mountDetail('publish');
    H.click(`${CASE_STUDY_CONTROLS.publish}-enterprise`);
    await H.settle();

    expect(H.text()).toContain('heroMetrics.0.verification.class');
    expect(H.text()).toContain('identity.organizationNamingConsent');
    expect(H.text()).toContain(blockers[0].remedy);
    expect(H.text()).toContain(blockers[1].remedy);
    expect(H.text()).toContain('metric_pending');
    expect(H.text()).toContain('organization_consent');
  });

  it('leaves the publish button enabled after a refusal, so the fix can be retried', async () => {
    refusePublish();
    await mountDetail('publish');
    H.click(`${CASE_STUDY_CONTROLS.publish}-enterprise`);
    await H.settle();
    expect((H.el(`${CASE_STUDY_CONTROLS.publish}-enterprise`) as HTMLButtonElement).disabled).toBe(false);
  });

  // The PREVIEW tab, not PUBLISH: this test is about the gate verdict a preview
  // produces, and `cs-preview` lives on the preview tab.
  it('shows the gate would refuse, with its reasons, from a preview that wrote nothing', async () => {
    await mountDetail('preview');
    await openPayload();
    H.click(CASE_STUDY_CONTROLS.preview);
    await H.settle();
    expect(H.text()).toContain('gate: would refuse');
    expect(H.text()).toContain(blockers[0].message);
    expect(H.text()).toContain(blockers[1].message);
  });

  it('lifts the blockers out of a real axios rejection body', () => {
    const lifted = realApi.publishBlockersFrom({
      response: { data: { blockers: [...blockers, { code: 'x' }] } },
    });
    // Two well-formed blockers survive; the malformed entry is dropped rather
    // than rendered as a blank row.
    expect(lifted).toHaveLength(2);
    expect(lifted[0].message).toBe(blockers[0].message);
    expect(realApi.publishBlockersFrom(new Error('network'))).toEqual([]);
  });
});

describe('AdminCaseStudyDetailPage — a record that will not load', () => {
  it('says the load failed rather than rendering an empty Case Study', async () => {
    api.getCaseStudy.mockRejectedValue({ response: { status: 500 } });
    api.describeApiError.mockReturnValue('Could not load this Case Study (HTTP 500).');
    await mountDetail();
    expect(H.text()).toContain('Could not load this Case Study');
    expect(H.query('cs-detail-load-error')).not.toBeNull();
  });
});

describe('AdminCaseStudyDetailPage — a private repository is never named in a LABEL', () => {
  it('shows the opaque row handle instead of the owner and name', async () => {
    await mountDetail('sources');
    // Assert the OWNER and NAME independently, not just the slashed form. The
    // earlier version of this test checked only `northwind/internal-rules`, so
    // it would have passed while every panel printed the two halves separately.
    expect(H.text()).toContain('colaberry/claims-router');
    expect(H.text()).not.toContain('northwind');
    expect(H.text()).not.toContain('internal-rules');
    expect(H.text()).toContain(`Private repository ${F.PRIVATE_REPO_ID.slice(0, 8)}`);
  });

  it('the RAW snapshot column does name it — a disclosed §34 exception, pinned so it stays deliberate', async () => {
    // The raw column exists so a reviewer can compare STORED against PUBLISHED.
    // A redacted "raw" view would defeat that comparison — they would be
    // approving a version of the truth rather than the truth. So this is not a
    // leak to fix; it is a property to hold still.
    //
    // It is pinned because the guarantee is easy to misread as page-wide (an
    // earlier doc comment did exactly that). If someone later redacts this
    // column, this test fails and forces them to decide consciously rather than
    // quietly breaking the review comparison.
    await mountDetail('preview');
    await openPayload();
    H.click('cs-preview');
    await H.settle();

    expect(H.text()).toContain('northwind');
    expect(H.text()).toContain('internal-rules');
    // ...and the projection beside it still withholds it, which is the point.
    expect(H.text()).toContain('What the projection withheld');
  });

  it('the PUBLIC projection column never names it, even with the raw column open', async () => {
    await mountDetail('preview');
    await openPayload();
    H.click('cs-preview');
    await H.settle();

    const projection = H.el('cs-preview-projection-json').textContent ?? '';
    expect(projection.length).toBeGreaterThan(0); // non-vacuity
    expect(projection).not.toContain('northwind');
    expect(projection).not.toContain('internal-rules');
  });
});

/**
 * THE SECTION IS LOAD-BEARING, NOT THE NAV ENTRY.
 *
 * `sectionForPath` returns null for a path classified by NEITHER a nav entry
 * nor UNLISTED_PATH_SECTIONS, which makes `ProtectedRoute` bounce every
 * section-scoped identity while a legacy admin typing the URL still gets a
 * working page — a surface that half-works and looks fine. The section must
 * also match the backend's `mgmtSectionGate`, which maps
 * `/api/admin/case-studies` to `program`.
 *
 * REVISED 2026-09-08: Case Studies moved out of the Program nav group and
 * became a tab on the Accelerator page. That makes the classification MORE
 * important, not less — the sidebar entry that used to supply it is gone, so
 * the path now depends entirely on its UNLISTED_PATH_SECTIONS row. These tests
 * therefore assert the section (which must not change) separately from the nav
 * placement (which deliberately did).
 */
describe('adminNav — /admin/case-studies keeps its section after leaving the sidebar', () => {
  it('resolves to the same section the backend gate uses', () => {
    expect(sectionForPath('/admin/case-studies')).toBe('program');
  });

  it('resolves the detail route to its parent section', () => {
    expect(sectionForPath(`/admin/case-studies/${ID}`)).toBe('program');
  });

  it('is no longer a sidebar entry — it lives on the Accelerator page', () => {
    const program = NAV_GROUPS.find((g) => g.label === 'Program');
    expect(program?.links.some((l) => l.path === '/admin/case-studies')).toBe(false);
    expect(ALL_LINKS.some((l) => l.path === '/admin/case-studies')).toBe(false);
  });

  it('is still classified despite having no nav entry', () => {
    // This is the exact regression the file header warns about: drop the nav
    // entry and forget the UNLISTED row, and every scoped identity is bounced
    // off a page the API would have served.
    const unlisted = UNLISTED_PATH_SECTIONS.find(([p]) => p === '/admin/case-studies');
    expect(unlisted).toBeDefined();
    expect(unlisted?.[1]).toBe('program');
  });

  it('does not leak into a sales-scoped identity', () => {
    const salesCanSee = ALL_LINKS
      .filter((l) => l.section === 'leads')
      .some((l) => l.path === '/admin/case-studies');
    expect(salesCanSee).toBe(false);
  });
});

/**
 * The four other surfaces folded into the Accelerator page on the same day.
 * Grouped here because they share one failure mode and one fix.
 */
describe('adminNav — every surface folded into the Accelerator page stays classified', () => {
  const FOLDED_IN = [
    '/admin/community-roles',
    '/admin/cert-prep',
    '/admin/case-studies',
    '/admin/projects',
    '/admin/feed-control-governance',
    // Became the Curriculum page's Architecture Skills tab in the same pass.
    '/admin/cape-settings',
  ];

  it.each(FOLDED_IN)('%s resolves to program', (path) => {
    expect(sectionForPath(path)).toBe('program');
  });

  it.each(FOLDED_IN)('%s has no sidebar entry', (path) => {
    expect(ALL_LINKS.some((l) => l.path === path)).toBe(false);
  });

  it('keeps Orchestration reachable at its original path under its new label', () => {
    // The label changed to "Curriculum"; the PATH must not, or every existing
    // deep link, bookmark and ?tab= link into the Composer breaks.
    const link = ALL_LINKS.find((l) => l.path === '/admin/orchestration');
    expect(link).toBeDefined();
    expect(link?.label).toBe('Curriculum');
    expect(sectionForPath('/admin/orchestration')).toBe('program');
  });
});

/**
 * Enterprise Intelligence moved between nav GROUPS. Grouping is presentation;
 * the section is authorization. This asserts the move carried the first and not
 * the second — the failure it guards against is subtle and silent, because the
 * link would still render, just for the wrong set of identities.
 */
describe('adminNav — /admin/brain changes group without changing access', () => {
  it('now appears under Intelligence rather than Program', () => {
    const intelligence = NAV_GROUPS.find((g) => g.label === 'Intelligence');
    const program = NAV_GROUPS.find((g) => g.label === 'Program');
    expect(intelligence?.links.some((l) => l.path === '/admin/brain')).toBe(true);
    expect(program?.links.some((l) => l.path === '/admin/brain')).toBe(false);
  });

  it('KEEPS the program section its API gate enforces, not the new group default', () => {
    // mgmtSectionGate maps /api/admin/brain to 'program'. Letting this inherit
    // the Intelligence group's section would make the nav and the API disagree
    // about who may open the page.
    expect(sectionForPath('/admin/brain')).toBe('program');
    expect(ALL_LINKS.find((l) => l.path === '/admin/brain')?.section).toBe('program');
  });

  it('is not granted to an identity holding only intelligence', () => {
    const canIntelligenceOnly = (s: string) => s === 'intelligence';
    const reachable = ALL_LINKS
      .filter((l) => !!l.section && canIntelligenceOnly(l.section))
      .map((l) => l.path);
    expect(reachable).not.toContain('/admin/brain');
  });
});
