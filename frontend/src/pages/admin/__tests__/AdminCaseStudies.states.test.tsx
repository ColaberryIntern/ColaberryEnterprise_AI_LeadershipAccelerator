import React from 'react';
import { Route, Routes } from 'react-router-dom';
import AdminCaseStudiesPage from '../AdminCaseStudiesPage';
import AdminCaseStudyDetailPage from '../AdminCaseStudyDetailPage';
import * as adminApi from '../../../services/caseStudyAdminApi';
import { CASE_STUDY_CONTROLS } from '../../../components/admin/caseStudy/caseStudyDesk';
import { ALL_LINKS, NAV_GROUPS, sectionForPath } from '../../../components/Layout/adminNav';
import * as H from '../__fixtures__/domHarness';
import * as F from '../__fixtures__/caseStudyAdminFixtures';
import { installCaseStudyApiMocks } from '../__fixtures__/caseStudyApiMocks';

jest.mock('../../../services/caseStudyAdminApi');
const api = adminApi as jest.Mocked<typeof adminApi>;

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

async function mountDetail(): Promise<void> {
  H.mount(
    <Routes>
      <Route path="/admin/case-studies/:id" element={<AdminCaseStudyDetailPage />} />
    </Routes>,
    `/admin/case-studies/${ID}`,
  );
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
    await mountDetail();
    H.click(CASE_STUDY_CONTROLS.publish);
    await H.settle();

    expect(H.text()).toContain(blockers[0].message);
    expect(H.text()).toContain(blockers[1].message);
    expect(H.query('cs-publish-blocker-0')).not.toBeNull();
    expect(H.query('cs-publish-blocker-1')).not.toBeNull();
    expect(H.text()).toContain('2 named reasons');
  });

  it('gives each blocker its field and its remedy, so the reason is actionable', async () => {
    refusePublish();
    await mountDetail();
    H.click(CASE_STUDY_CONTROLS.publish);
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
    await mountDetail();
    H.click(CASE_STUDY_CONTROLS.publish);
    await H.settle();
    expect((H.el(CASE_STUDY_CONTROLS.publish) as HTMLButtonElement).disabled).toBe(false);
  });

  it('shows the gate would refuse, with its reasons, from a preview that wrote nothing', async () => {
    await mountDetail();
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
    await mountDetail();
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
    await mountDetail();
    H.click('cs-preview');
    await H.settle();

    expect(H.text()).toContain('northwind');
    expect(H.text()).toContain('internal-rules');
    // ...and the projection beside it still withholds it, which is the point.
    expect(H.text()).toContain('What the projection withheld');
  });

  it('the PUBLIC projection column never names it, even with the raw column open', async () => {
    await mountDetail();
    H.click('cs-preview');
    await H.settle();

    const projection = H.el('cs-preview-projection-json').textContent ?? '';
    expect(projection.length).toBeGreaterThan(0); // non-vacuity
    expect(projection).not.toContain('northwind');
    expect(projection).not.toContain('internal-rules');
  });
});

/**
 * THE NAV ENTRY IS LOAD-BEARING, NOT DECORATION.
 *
 * `sectionForPath` returns null for a path with no nav entry, which hides the
 * link AND makes `ProtectedRoute` bounce every section-scoped identity, while a
 * legacy admin typing the URL still gets a working page — a surface that
 * half-works and looks fine. The section must also match the backend's
 * `mgmtSectionGate`, which maps `/api/admin/case-studies` to `program`.
 */
describe('adminNav — /admin/case-studies is registered under the right section', () => {
  it('resolves to the same section the backend gate uses', () => {
    expect(sectionForPath('/admin/case-studies')).toBe('program');
  });

  it('resolves the detail route to its parent section', () => {
    expect(sectionForPath(`/admin/case-studies/${ID}`)).toBe('program');
  });

  it('appears in the Program group with a RemixIcon name carrying no ri- prefix', () => {
    const program = NAV_GROUPS.find((g) => g.label === 'Program');
    const link = program?.links.find((l) => l.path === '/admin/case-studies');
    expect(link).toBeDefined();
    expect(link?.label).toBe('Case Studies');
    expect(link?.icon).not.toMatch(/^ri-/);
    expect(link?.icon).toBe('award-line');
  });

  it('is reachable by a program-scoped identity and invisible to a sales one', () => {
    const link = ALL_LINKS.find((l) => l.path === '/admin/case-studies');
    expect(link?.section).toBe('program');
    const salesCanSee = ALL_LINKS
      .filter((l) => l.section === 'leads')
      .some((l) => l.path === '/admin/case-studies');
    expect(salesCanSee).toBe(false);
  });
});
