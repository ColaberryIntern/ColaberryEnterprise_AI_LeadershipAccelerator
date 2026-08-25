import React from 'react';
import { Route, Routes } from 'react-router-dom';
import AdminCaseStudiesPage from '../AdminCaseStudiesPage';
import AdminCaseStudyDetailPage from '../AdminCaseStudyDetailPage';
import * as adminApi from '../../../services/caseStudyAdminApi';
import {
  CASE_STUDY_CONTROLS, SPEC_18_CAPABILITIES,
} from '../../../components/admin/caseStudy/caseStudyDesk';
import type { CaseStudyCapability } from '../../../components/admin/caseStudy/caseStudyDesk';
import * as H from '../__fixtures__/domHarness';
import * as F from '../__fixtures__/caseStudyAdminFixtures';
import { installCaseStudyApiMocks } from '../__fixtures__/caseStudyApiMocks';

jest.mock('../../../services/caseStudyAdminApi');
const api = adminApi as jest.Mocked<typeof adminApi>;

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

async function mountDetail(): Promise<void> {
  H.mount(
    <Routes>
      <Route path="/admin/case-studies/:id" element={<AdminCaseStudyDetailPage />} />
    </Routes>,
    `/admin/case-studies/${ID}`,
  );
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
      await mountDetail();
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
      await mountDetail();
      H.click(control('remove repos'));
      await H.settle();
      expect(api.removeCaseStudyRepository).toHaveBeenCalledWith(ID, F.PUBLIC_REPO_ID);
    },
  },
  {
    name: 'assign repo roles',
    run: async () => {
      await mountDetail();
      H.setValue(control('assign repo roles'), 'backend');
      await H.settle();
      expect(api.setCaseStudyRepositoryRole).toHaveBeenCalledWith(ID, F.PUBLIC_REPO_ID, 'backend');
    },
  },
  {
    name: 'sync',
    run: async () => {
      await mountDetail();
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
      await mountDetail();
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
      await mountDetail();
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
      await mountDetail();
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
      await mountDetail();
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
      await mountDetail();
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
      await mountDetail();
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
      await mountDetail();
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
      await mountDetail();
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
      await mountDetail();
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
      await mountDetail();
      H.click(control('approve'));
      await H.settle();
      expect(api.approveCaseStudySnapshot).toHaveBeenCalledWith(ID, F.SNAPSHOT_DRAFT_ID);
    },
  },
  {
    name: 'publish',
    run: async () => {
      await mountDetail();
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
      await mountDetail();
      H.click(control('unpublish'));
      await H.settle();
      expect(api.unpublishCaseStudy).toHaveBeenCalledWith(ID, { surfaceKey: 'enterprise' });
    },
  },
  {
    name: 'archive',
    run: async () => {
      await mountDetail();
      H.click(control('archive'));
      await H.settle();
      expect(api.archiveCaseStudy).toHaveBeenCalledWith(ID);
    },
  },
  {
    name: 'sync history',
    run: async () => {
      await mountDetail();
      H.click(control('sync history'));
      await H.settle();
      expect(api.listCaseStudySyncRuns).toHaveBeenCalledWith(ID, { limit: 20, offset: 0 });
      expect(H.text()).toContain('1 failed');
    },
  },
  {
    name: 'published-vs-draft diff',
    run: async () => {
      await mountDetail();
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
