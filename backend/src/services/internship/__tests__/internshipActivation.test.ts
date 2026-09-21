/**
 * Activation's checklist, fed what conversion writes.
 *
 * The rule this defends: a converted intern whose documents an administrator
 * certified as verified must have NO document blockers, and be held only by the
 * membership gate. Before this suite existed, conversion imported one of the three
 * signature documents and no generated letter, so `activate()` blocked every
 * converted intern on paperwork that had just been certified — and no test fed
 * the producer's rows to the consumer to notice.
 *
 * `outstandingRequirements` (the real document check) is deliberately NOT mocked.
 */

const mockApplication = { findByPk: jest.fn() };
const mockIntake = { findOne: jest.fn() };
const mockDecision = { findOne: jest.fn() };
const mockDocument = { findAll: jest.fn() };
const mockAck = { findAll: jest.fn() };
const mockEnrollment = { findByPk: jest.fn() };
const mockMembership = { findOrCreate: jest.fn(), findOne: jest.fn() };

jest.mock('../../../models/InternshipApplication', () => ({ __esModule: true, default: mockApplication }));
jest.mock('../../../models/InternshipAdministrativeIntake', () => ({ __esModule: true, default: mockIntake }));
jest.mock('../../../models/InternshipDecision', () => ({ __esModule: true, default: mockDecision }));
jest.mock('../../../models/InternshipDocument', () => ({ __esModule: true, default: mockDocument }));
jest.mock('../../../models/InternshipRequirementAcknowledgement', () => ({
  ...jest.requireActual('../../../models/InternshipRequirementAcknowledgement'),
  __esModule: true,
  default: mockAck,
}));
jest.mock('../../../models/Enrollment', () => ({ __esModule: true, default: mockEnrollment }));
jest.mock('../../../models/CohortMembership', () => ({ __esModule: true, default: mockMembership }));

const mockGetSubscription = jest.fn();
const mockActiveComps = jest.fn();
jest.mock('../../subscriptionService', () => ({
  PLANS: { annual: { per_month: 149 }, monthly: { per_month: 199 } },
  getSubscription: (...a: unknown[]) => mockGetSubscription(...a),
  activeCompEnrollmentIds: (...a: unknown[]) => mockActiveComps(...a),
}));
jest.mock('../../projectService', () => ({ getProjectByEnrollment: jest.fn().mockResolvedValue(null) }));
jest.mock('../../curriculumCompletionService', () => ({ getStudentWeekBreakdown: jest.fn().mockResolvedValue({ rows: [] }) }));
jest.mock('../../../config/upload', () => ({ SIGNED_DOC_DIR: '/tmp/nowhere' }));
jest.mock('../internshipPdf', () => ({ generatePdf: jest.fn(), newDocumentPublicId: jest.fn() }));
jest.mock('../internshipApplicationService', () => ({ transition: jest.fn() }));
jest.mock('../internshipMeetingRooms', () => ({ ensureInternInStandupRoom: jest.fn() }));
jest.mock('../internshipAnalytics', () => ({ emitInternshipEvent: jest.fn().mockResolvedValue({ written: true }) }));
jest.mock('../internshipCohortService', () => ({
  ...jest.requireActual('../internshipCohortService'),
  ensureInternshipCohort: jest.fn().mockResolvedValue({ cohort: { id: 'cohort-1', settings_json: {} }, created: false }),
}));

import { buildChecklist } from '../internshipActivationService';
import { activationBlockers } from '../internshipOnboarding';
import { importedSignatureDocumentTypes } from '../internshipConversionService';

const APP = { id: 'app-1', enrollment_id: 'enr-1', state: 'documents_verified' } as any;

/** The rows internshipConversionService writes for `documents_already_verified`. */
const importedRows = (types: readonly string[] = importedSignatureDocumentTypes()) => types.map((document_type) => ({
  document_type,
  kind: 'signed_upload',
  revision: 1,
  status: 'verified',
  required: true,
  storage_key: null,
}));

beforeEach(() => {
  jest.clearAllMocks();
  mockApplication.findByPk.mockResolvedValue(APP);
  mockIntake.findOne.mockResolvedValue(null);
  mockDecision.findOne.mockResolvedValue(null);
  mockAck.findAll.mockResolvedValue([]);
  mockEnrollment.findByPk.mockResolvedValue({ id: 'enr-1', cohort_id: 'class-1' });
  mockGetSubscription.mockResolvedValue({ subscription: null });
  mockActiveComps.mockResolvedValue(new Set());
});

describe('a converted intern with certified documents', () => {
  it('has no activation blockers once their membership is in order', async () => {
    mockDocument.findAll.mockResolvedValue(importedRows());
    mockActiveComps.mockResolvedValue(new Set(['enr-1']));

    const blockers = activationBlockers(await buildChecklist(APP));
    expect(blockers.map((b) => b.key)).toEqual([]);
  });

  it('is held ONLY by the membership gate when nobody has comped or paid', async () => {
    mockDocument.findAll.mockResolvedValue(importedRows());

    const blockers = activationBlockers(await buildChecklist(APP));
    expect(blockers.map((b) => b.key)).toEqual(['membership_active']);
  });

  it('completes the offer-letter step from the verified signed copy, with no generated row', async () => {
    mockDocument.findAll.mockResolvedValue(importedRows());
    const steps = await buildChecklist(APP);
    expect(steps.find((s) => s.key === 'sign_offer_letter')!.complete).toBe(true);
    expect(steps.find((s) => s.key === 'upload_signed_documents')!.complete).toBe(true);
    expect(steps.find((s) => s.key === 'documents_verified')!.complete).toBe(true);
  });
});

describe('what the old import would have produced', () => {
  it('still blocks on documents when only the offer letter was imported', async () => {
    // The exact failure this suite exists to catch: one verified document out of
    // three reads as "documents verified" nowhere.
    mockDocument.findAll.mockResolvedValue(importedRows(['unpaid_internship_offer']));
    mockActiveComps.mockResolvedValue(new Set(['enr-1']));

    const blockers = activationBlockers(await buildChecklist(APP));
    expect(blockers.map((b) => b.key)).toEqual(['documents_verified']);
  });

  it('does not treat an unverified signed upload as a signed offer letter', async () => {
    mockDocument.findAll.mockResolvedValue(
      importedRows().map((r) => ({ ...r, status: 'uploaded' })),
    );
    const steps = await buildChecklist(APP);
    expect(steps.find((s) => s.key === 'sign_offer_letter')!.complete).toBe(false);
  });
});
