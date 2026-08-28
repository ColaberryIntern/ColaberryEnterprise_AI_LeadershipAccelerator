import React from 'react';
import { Route, Routes } from 'react-router-dom';
import AdminCaseStudiesPage from '../AdminCaseStudiesPage';
import AdminCaseStudyDetailPage from '../AdminCaseStudyDetailPage';
import * as adminApi from '../../../services/caseStudyAdminApi';
import {
  CASE_STUDY_CONTROLS, SPEC_18_CAPABILITIES,
} from '../../../components/admin/caseStudy/caseStudyDesk';
import type { CaseStudyCapability } from '../../../components/admin/caseStudy/caseStudyDesk';
import {
  CAPABILITY_TAB, CASE_STUDY_STUDIO_TABS, tabTestIdForCapability,
} from '../../../components/admin/caseStudy/caseStudyStudioTabs';
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

/**
 * SPEC §18 COVERAGE, MACHINE-CHECKED.
 *
 * `REQUIRED_CONTROLS` names every capability spec §18 requires of
 * `/admin/case-studies` and, for each, asserts two things: the control is
 * actually rendered, and activating it calls the API it claims to with the
 * arguments it claims to. One test per capability, titled by capability, so a
 * dropped feature fails the suite BY NAME rather than shrinking the page while
 * `tsc` and a render-without-crash test stay green.
 *
 * The guard at the bottom is what makes the list honest: `SPEC_18_CAPABILITIES`
 * is the same array the panels read their `data-testid`s from, so a capability
 * cannot be deleted from the product without either failing the guard or failing
 * its own test.
 */

const ID = F.CASE_STUDY_ID;
const control = (capability: CaseStudyCapability): string => CASE_STUDY_CONTROLS[capability];

beforeEach(() => {
  H.stubConfirm(true);
  installCaseStudyApiMocks(api);
});

afterEach(() => {
  H.unmount();
  jest.clearAllMocks();
});

async function mountList(): Promise<void> {
  H.mount(<AdminCaseStudiesPage />, '/admin/case-studies');
  await H.settle();
}

/**
 * Mount the detail page and OPEN THE TAB THAT OWNS THE CAPABILITY under test.
 *
 * The page became a seven-tab Story Studio on 2026-08-26, so a capability is no
 * longer necessarily on screen at mount. The tab to click is read from
 * `CAPABILITY_TAB` — the same map the product renders from — rather than
 * hardcoded here. That matters: a hardcoded mapping in the suite would drift
 * from the product silently, and this guard would decay into a description of a
 * layout that no longer exists while staying green.
 *
 * A capability whose owning tab is `null` lives on the LIST page and never
 * reaches this function.
 */
async function mountDetail(capability?: CaseStudyCapability): Promise<void> {
  H.mount(
    <Routes>
      <Route path="/admin/case-studies/:id" element={<AdminCaseStudyDetailPage />} />
    </Routes>,
    `/admin/case-studies/${ID}`,
  );
  await H.settle();

  if (!capability) return;
  const tabTestId = tabTestIdForCapability(capability);
  if (!tabTestId) {
    throw new Error(
      `Capability "${capability}" is mapped to no detail-page tab, but a detail mount asked for `
      + 'it. Either CAPABILITY_TAB is wrong or this test should mount the list page.',
    );
  }
  H.click(tabTestId);
  await H.settle();
}

/**
 * Open the PREVIEW tab's raw-vs-projection payload, where the §18 "preview"
 * control lives since 2026-08-27.
 *
 * The tab's default view became the RENDERED page on that date and the two JSON
 * columns — with the `cs-preview` re-read button that heads them — moved behind
 * "Show payload". The capability test is unchanged in what it asserts: same
 * click, same API call with the same arguments, same four strings. It gained
 * this one line.
 *
 * `H.click` goes through `H.el`, which THROWS by name on a missing id, so a
 * renamed toggle fails here instead of leaving the capability unproven.
 */
async function openPayload(): Promise<void> {
  H.click('cs-preview-payload-toggle');
  await H.settle();
}

/** Type an override value and press Apply, the §34 human-copy path. */
async function applyOverride(capability: CaseStudyCapability, value: string): Promise<void> {
  H.setValue(`${control(capability)}-input`, value);
  H.click(control(capability));
  await H.settle();
}

interface RequiredControl {
  readonly name: CaseStudyCapability;
  readonly run: () => Promise<void>;
}

const REQUIRED_CONTROLS: readonly RequiredControl[] = [
  {
    name: 'dashboard',
    run: async () => {
      await mountList();
      expect(H.query(control('dashboard'))).not.toBeNull();
      expect(H.text()).toContain('CONNECTED REPOS');
      // Never a guessed zero for something that has not been measured.
      expect(H.text()).toContain('Not scanned');
      H.click('cs-dashboard-scan');
      await H.settle();
      expect(api.getCaseStudy).toHaveBeenCalledWith(ID);
      expect(H.text()).not.toContain('Not scanned');
    },
  },
  {
    name: 'candidate states',
    run: async () => {
      await mountList();
      expect(H.query(control('candidate states'))).not.toBeNull();
      expect(H.text()).toContain('Needs Evidence');
      expect(H.text()).toContain('Sync Issues');
      api.listCaseStudies.mockClear();
      H.click('cs-state-ready-for-review');
      await H.settle();
      expect(api.listCaseStudies).toHaveBeenCalledWith({
        status: 'review', includeArchived: false, limit: 25, offset: 0,
      });
    },
  },
  {
    name: 'create from Project',
    run: async () => {
      await mountList();
      H.setValue('cs-project-id', 'proj-9');
      H.setValue('cs-project-title', 'Claims triage copilot');
      H.click(control('create from Project'));
      await H.settle();
      expect(api.createCaseStudyFromProject).toHaveBeenCalledWith({
        projectId: 'proj-9', title: 'Claims triage copilot',
      });
    },
  },
  {
    name: 'create from a repo collection',
    run: async () => {
      await mountList();
      H.setValue('cs-repo-title', 'Claims triage copilot');
      H.setValue('cs-repo-refs', 'colaberry/claims-router\nnorthwind/internal-rules');
      H.click(control('create from a repo collection'));
      await H.settle();
      expect(api.createCaseStudyFromRepositories).toHaveBeenCalledWith({
        title: 'Claims triage copilot',
        repositories: ['colaberry/claims-router', 'northwind/internal-rules'],
      });
    },
  },
  {
    name: 'attach repos',
    run: async () => {
      await mountDetail('attach repos');
      H.setValue('cs-repo-reference', 'colaberry/claims-evals');
      H.click(control('attach repos'));
      await H.settle();
      expect(api.attachCaseStudyRepository).toHaveBeenCalledWith(ID, {
        reference: 'colaberry/claims-evals', role: 'primary',
      });
    },
  },
  {
    name: 'remove repos',
    run: async () => {
      await mountDetail('remove repos');
      H.click(control('remove repos'));
      await H.settle();
      expect(api.removeCaseStudyRepository).toHaveBeenCalledWith(ID, F.PUBLIC_REPO_ID);
    },
  },
  {
    name: 'assign repo roles',
    run: async () => {
      await mountDetail('assign repo roles');
      H.setValue(control('assign repo roles'), 'backend');
      await H.settle();
      expect(api.setCaseStudyRepositoryRole).toHaveBeenCalledWith(ID, F.PUBLIC_REPO_ID, 'backend');
    },
  },
  {
    name: 'sync',
    run: async () => {
      await mountDetail('sync');
      H.click(control('sync'));
      await H.settle();
      expect(api.syncCaseStudy).toHaveBeenCalledWith(ID, { trigger: 'manual' });
      // A partial run is reported as partial, not as a success.
      expect(H.text()).toContain('1 of 2 repositories read');
    },
  },
  {
    name: 'inspect provenance',
    run: async () => {
      await mountDetail('inspect provenance');
      expect(H.text()).toContain('identity.standfirst');
      expect(H.text()).toContain('human_override');
      api.previewCaseStudy.mockClear();
      H.setValue(control('inspect provenance'), F.SNAPSHOT_APPROVED_ID);
      await H.settle();
      expect(api.previewCaseStudy).toHaveBeenCalledWith(ID, {
        snapshotId: F.SNAPSHOT_APPROVED_ID,
      });
    },
  },
  {
    name: 'review/edit narrative',
    run: async () => {
      await mountDetail('review/edit narrative');
      expect(H.text()).toContain('Generated standfirst from the repository README.');
      await applyOverride('review/edit narrative', 'Claims triage copilot for first notice of loss');
      expect(api.applyCaseStudyOverride).toHaveBeenCalledWith(ID, {
        path: 'identity.standfirst', value: 'Claims triage copilot for first notice of loss',
      });
    },
  },
  {
    name: 'metrics',
    run: async () => {
      await mountDetail('metrics');
      expect(H.text()).toContain('Median claim cycle time');
      expect(H.text()).toContain('this figure cannot reach a visitor');
      await applyOverride('metrics', '4.0 days');
      expect(api.applyCaseStudyOverride).toHaveBeenCalledWith(ID, {
        path: 'heroMetrics.0.valueDisplay', value: '4.0 days',
      });
    },
  },
  {
    name: 'evidence',
    run: async () => {
      await mountDetail('evidence');
      expect(H.text()).toContain('no evidence record is linked to this figure');
      await applyOverride('evidence', 'Median of the claims system export.');
      expect(api.applyCaseStudyOverride).toHaveBeenCalledWith(ID, {
        path: 'heroMetrics.0.measurement.methodology',
        value: 'Median of the claims system export.',
      });
    },
  },
  {
    name: 'artifacts',
    run: async () => {
      await mountDetail('artifacts');
      expect(H.text()).toContain('Routing diagram');
      expect(H.text()).toContain('1 of 2 would reach a visitor');
      await applyOverride('artifacts', 'Agent routing diagram');
      expect(api.applyCaseStudyOverride).toHaveBeenCalledWith(ID, {
        path: 'artifacts.0.title', value: 'Agent routing diagram',
      });
    },
  },
  {
    name: 'contributors',
    run: async () => {
      await mountDetail('contributors');
      expect(H.text()).toContain('Dana Reyes');
      expect(H.text()).toContain('1 anonymous');
      await applyOverride('contributors', 'Lead engineer, claims');
      expect(api.applyCaseStudyOverride).toHaveBeenCalledWith(ID, {
        path: 'contributors.0.role', value: 'Lead engineer, claims',
      });
    },
  },
  {
    name: 'consent',
    run: async () => {
      await mountDetail('consent');
      expect(H.text()).toContain('named without a recorded consent');
      H.toggle('cs-org-consent');
      H.click(control('consent'));
      await H.settle();
      expect(api.updateCaseStudy).toHaveBeenCalledWith(ID, {
        organizationIdentityMode: 'named',
        organizationDisplayName: 'Northwind Mutual',
        organizationNamingConsent: true,
        builderIdentityMode: 'role_only',
        builderNamingConsent: false,
        visibility: 'public',
      });
    },
  },
  {
    name: 'readiness gaps',
    run: async () => {
      await mountDetail('readiness gaps');
      expect(H.text()).toContain('the headline metric has no linked evidence record');
      expect(H.text()).toContain('attach the claims system export to the headline metric');
      expect(H.text()).toContain('Advisory only');
      api.getCaseStudy.mockClear();
      H.click(control('readiness gaps'));
      await H.settle();
      expect(api.getCaseStudy).toHaveBeenCalledWith(ID);
    },
  },
  {
    name: 'preview',
    run: async () => {
      await mountDetail('preview');
      await openPayload();
      api.previewCaseStudy.mockClear();
      H.click(control('preview'));
      await H.settle();
      expect(api.previewCaseStudy).toHaveBeenCalledWith(ID, { surfaceKey: 'enterprise' });
      // Both views, and the difference between them.
      expect(H.text()).toContain('Raw snapshot');
      expect(H.text()).toContain('Public projection');
      expect(H.text()).toContain('A national insurance carrier');
      expect(H.text()).toContain('What the projection withheld');
    },
  },
  {
    name: 'approve',
    run: async () => {
      await mountDetail('approve');
      H.click(control('approve'));
      await H.settle();
      expect(api.approveCaseStudySnapshot).toHaveBeenCalledWith(ID, F.SNAPSHOT_DRAFT_ID);
    },
  },
  {
    name: 'publish',
    run: async () => {
      await mountDetail('publish');
      // Readiness is 54/100 and "developing". That must not disable anything:
      // the gate decides, on the server, on every call.
      expect((H.el(control('publish')) as HTMLButtonElement).disabled).toBe(false);
      H.click(control('publish'));
      await H.settle();
      expect(api.publishCaseStudy).toHaveBeenCalledWith(ID, { surfaceKey: 'enterprise' });
    },
  },
  {
    name: 'unpublish',
    run: async () => {
      await mountDetail('unpublish');
      H.click(control('unpublish'));
      await H.settle();
      expect(api.unpublishCaseStudy).toHaveBeenCalledWith(ID, { surfaceKey: 'enterprise' });
    },
  },
  {
    name: 'archive',
    run: async () => {
      await mountDetail('archive');
      H.click(control('archive'));
      await H.settle();
      expect(api.archiveCaseStudy).toHaveBeenCalledWith(ID);
    },
  },
  {
    name: 'sync history',
    run: async () => {
      await mountDetail('sync history');
      H.click(control('sync history'));
      await H.settle();
      expect(api.listCaseStudySyncRuns).toHaveBeenCalledWith(ID, { limit: 20, offset: 0 });
      expect(H.text()).toContain('1 failed');
    },
  },
  {
    name: 'published-vs-draft diff',
    run: async () => {
      await mountDetail('published-vs-draft diff');
      api.previewCaseStudy.mockClear();
      H.click(control('published-vs-draft diff'));
      await H.settle();
      expect(api.previewCaseStudy).toHaveBeenCalledWith(ID, {
        snapshotId: F.SNAPSHOT_PUBLISHED_ID,
      });
      expect(H.text()).toContain('Proof warnings');
    },
  },
];

it.each(REQUIRED_CONTROLS)(
  'spec §18 capability: $name — renders, and drives the API it claims to',
  async ({ run }) => { await run(); },
);

describe('spec §18 coverage guard', () => {
  it('declares one control per capability, and names any that is missing', () => {
    const declared = REQUIRED_CONTROLS.map((c) => c.name);
    const missing = SPEC_18_CAPABILITIES.filter((name) => !declared.includes(name));
    const unexpected = declared.filter((name) => !SPEC_18_CAPABILITIES.includes(name));
    // A failure here prints the capability names, not a count.
    expect(missing).toEqual([]);
    expect(unexpected).toEqual([]);
    expect(declared).toHaveLength(SPEC_18_CAPABILITIES.length);
  });

  it('gives every capability a distinct data-testid', () => {
    const ids = SPEC_18_CAPABILITIES.map((name) => CASE_STUDY_CONTROLS[name]);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

/**
 * THE GUARD ON THE TAB MAP.
 *
 * `mountDetail` navigates by reading `CAPABILITY_TAB`, so a capability missing
 * from that map, or pointing at a tab that does not exist, would make the
 * capability's own test fail with a confusing "no control rendered" rather than
 * naming the real cause. These three assertions name it directly.
 */
describe('Story Studio tab map', () => {
  it('assigns every spec §18 capability to a real tab or explicitly to none', () => {
    const tabKeys = new Set(CASE_STUDY_STUDIO_TABS.map((t) => t.key));
    const bad: string[] = [];
    for (const capability of SPEC_18_CAPABILITIES) {
      const tab = CAPABILITY_TAB[capability];
      if (tab !== null && !tabKeys.has(tab)) bad.push(`${capability} -> ${tab}`);
    }
    expect(bad).toEqual([]);
    // Non-vacuity: the map must actually be populated, or the loop above passes
    // by iterating nothing and this guard proves only that it ran.
    expect(SPEC_18_CAPABILITIES.length).toBeGreaterThan(20);
  });

  it('covers six of the seven tabs, and SURFACES is the one exception by design', () => {
    const used = new Set(
      SPEC_18_CAPABILITIES.map((c) => CAPABILITY_TAB[c]).filter((t): t is NonNullable<typeof t> => t !== null),
    );
    const uncovered = CASE_STUDY_STUDIO_TABS
      .map((t) => t.key).filter((key) => !used.has(key));

    // SURFACES owns no spec §18 capability, and that is correct rather than a
    // gap: the four-lens lab shipped on 2026-08-26, long after §18 was written,
    // so §18 has no vocabulary for it. Asserting the exact exception rather
    // than "at most one" means a SECOND tab drifting out of coverage fails
    // here, by name, instead of being absorbed by a loose bound.
    expect(uncovered).toEqual(['surfaces']);
  });

  it('leaves exactly the four list-page capabilities unmapped', () => {
    const unmapped = SPEC_18_CAPABILITIES.filter((c) => CAPABILITY_TAB[c] === null);
    expect(unmapped.sort()).toEqual([
      'candidate states', 'create from Project', 'create from a repo collection', 'dashboard',
    ]);
  });
});
