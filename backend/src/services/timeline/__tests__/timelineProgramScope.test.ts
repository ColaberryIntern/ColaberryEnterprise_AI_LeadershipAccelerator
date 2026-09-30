/**
 * The shared student curriculum is scoped to ONE program.
 *
 * Regression guard for the 2026-08-19 classroom leak. A second program
 * ("DOL AI Literacy Training - Claims Examiners") was authored at global scope
 * — cohort_id NULL, visibility 'published', status 'active' — which is exactly
 * the shape the student feed selects on. Its 23 published week 1-3 cards
 * therefore rendered inside the AI Systems Architect Accelerator classroom,
 * reading as empty duplicates of the real cards ("Welcome to Session 1!"
 * beside "Welcome to Week 1!").
 *
 * Two independent reader paths carried the same unscoped query and both must
 * constrain program_id:
 *   - timelineService.getGlobalCards      (what the Classroom renders)
 *   - timelineGatingService.loadGlobalCards (the lock/enforcement choke point)
 */
import { Op } from 'sequelize';
import { CANONICAL_PROGRAM_ID } from '../../../data/weekBlueprints';

jest.mock('../../../models/TimelineCard', () => ({ __esModule: true, default: { findAll: jest.fn() } }));
jest.mock('../../../models/TimelineCardProgress', () => ({
  __esModule: true,
  default: { findAll: jest.fn().mockResolvedValue([]), findOne: jest.fn().mockResolvedValue(null), findOrCreate: jest.fn() },
}));
jest.mock('../../../models/TimelineSectionRule', () => ({ __esModule: true, default: { findAll: jest.fn().mockResolvedValue([]) } }));
jest.mock('../../../models/Enrollment', () => ({ __esModule: true, default: { findByPk: jest.fn().mockResolvedValue(null) } }));
jest.mock('../../../models/CurriculumTypeDefinition', () => ({ __esModule: true, default: { findAll: jest.fn().mockResolvedValue([]) } }));
jest.mock('../../access/contentEntitlement', () => ({ isFreePreviewTier: jest.fn().mockResolvedValue(false) }));
jest.mock('../networkVideoService', () => ({ selectTestimonialForEnrollment: jest.fn() }));
jest.mock('../podcastMediaService', () => ({ selectPodcastForEnrollment: jest.fn() }));
jest.mock('../blogMediaService', () => ({ selectBlogForEnrollment: jest.fn() }));
jest.mock('../../runtime/communityRituals', () => ({ ritualStudentLabel: jest.fn(() => null) }));

import TimelineCard from '../../../models/TimelineCard';
import { getGlobalCards } from '../timelineService';
import { assertCardUnlocked } from '../timelineGatingService';

const mockFindAll = TimelineCard.findAll as unknown as jest.Mock;

/** The foreign program whose cards leaked into the Accelerator classroom. */
const DOL_PROGRAM_ID = '7557ec5e-a7c1-4699-955d-c5b8021bdc03';

/**
 * Read the program_id constraint off a Sequelize `where` and decide whether a
 * given row's program_id would be admitted by it. Mirrors how Sequelize expands
 * `{ program_id: { [Op.or]: [...] } }` into `program_id = x OR program_id IS NULL`.
 */
function admitsProgram(where: any, programId: string | null): boolean {
  const constraint = where?.program_id;
  if (constraint === undefined) return true; // unconstrained: every program is admitted
  const alternatives: unknown[] = Array.isArray(constraint?.[Op.or])
    ? constraint[Op.or]
    : [constraint];
  return alternatives.some((a) => (a === null ? programId === null : a === programId));
}

beforeEach(() => {
  jest.clearAllMocks();
  mockFindAll.mockResolvedValue([]);
});

describe('timelineService.getGlobalCards — program scoping', () => {
  it('constrains the query by program_id', async () => {
    await getGlobalCards();

    const where = mockFindAll.mock.calls[0][0].where;
    expect(where).toHaveProperty('program_id');
  });

  it('admits the canonical Accelerator program', async () => {
    await getGlobalCards();

    const where = mockFindAll.mock.calls[0][0].where;
    expect(admitsProgram(where, CANONICAL_PROGRAM_ID)).toBe(true);
  });

  it('admits legacy rows that predate program_id (program_id IS NULL)', async () => {
    await getGlobalCards();

    const where = mockFindAll.mock.calls[0][0].where;
    expect(admitsProgram(where, null)).toBe(true);
  });

  it('EXCLUDES a foreign program authored at global scope', async () => {
    await getGlobalCards();

    const where = mockFindAll.mock.calls[0][0].where;
    expect(admitsProgram(where, DOL_PROGRAM_ID)).toBe(false);
  });

  it('still restricts to published, active, non-cohort cards', async () => {
    await getGlobalCards();

    const where = mockFindAll.mock.calls[0][0].where;
    expect(where).toMatchObject({ cohort_id: null, status: 'active', visibility: 'published' });
  });
});

describe('timelineGatingService.loadGlobalCards — program scoping', () => {
  it('EXCLUDES a foreign program when building the lock context', async () => {
    // assertCardUnlocked fails open on any non-423 error, so partial mocks are
    // safe here: we only care about the shape of the curriculum query it issues.
    await assertCardUnlocked('enrollment-1', { id: 'card-1', week: 1 } as any);

    const curriculumCall = mockFindAll.mock.calls.find(
      (c) => c[0]?.where?.visibility === 'published' && c[0]?.where?.status === 'active',
    );
    expect(curriculumCall).toBeDefined();
    expect(admitsProgram(curriculumCall![0].where, DOL_PROGRAM_ID)).toBe(false);
  });
});
