/**
 * M2-T3: a gov build is a monitored side-project. createDetachedProjectForEnrollment
 * must create the project row WITHOUT repointing the enrollment's single
 * active_project_id, so an intern can own several gov projects at once and none
 * hijacks their primary student build. The student "+ New project" path
 * (createNewProjectForEnrollment) must still create AND activate, unchanged.
 */
jest.mock('../../config/database', () => ({ sequelize: { transaction: jest.fn() } }));
jest.mock('../../models/Project', () => ({ __esModule: true, default: { create: jest.fn(), findByPk: jest.fn(), findOne: jest.fn() } }));
jest.mock('../../models/ProjectArtifact', () => ({ __esModule: true, default: {} }));
jest.mock('../../models', () => ({
  Enrollment: { findByPk: jest.fn() },
  Cohort: {},
  UserCurriculumProfile: {},
  ArtifactDefinition: {},
  AssignmentSubmission: {},
}));
jest.mock('../projects/protectedProjects', () => ({ PROTECTED_PROJECT_IDS: [] }));

import { createDetachedProjectForEnrollment, createNewProjectForEnrollment } from '../projectService';
import Project from '../../models/Project';
import { Enrollment } from '../../models';

const mock = <T>(fn: T) => fn as unknown as jest.Mock;

function makeEnrollment(over: Record<string, unknown> = {}) {
  return {
    id: 'enr-1',
    company: 'Acme',
    active_project_id: 'existing-active',
    cohort: { program_id: 'prog-1' },
    curriculumProfile: null,
    save: jest.fn().mockResolvedValue(undefined),
    ...over,
  };
}

describe('createDetachedProjectForEnrollment (M2-T3)', () => {
  beforeEach(() => jest.clearAllMocks());

  it('creates the project row but LEAVES active_project_id untouched and never saves the enrollment', async () => {
    const enr = makeEnrollment();
    mock(Enrollment.findByPk).mockResolvedValue(enr);
    mock(Project.create).mockResolvedValue({ id: 'gov-proj-1' });

    const p = await createDetachedProjectForEnrollment('enr-1');

    expect(p.id).toBe('gov-proj-1');
    expect(mock(Project.create)).toHaveBeenCalledTimes(1);
    expect(enr.active_project_id).toBe('existing-active'); // pointer NOT moved
    expect(enr.save).not.toHaveBeenCalled();
  });

  it('lets one enrollment own MULTIPLE gov projects without clobbering the active pointer', async () => {
    const enr = makeEnrollment();
    mock(Enrollment.findByPk).mockResolvedValue(enr);
    mock(Project.create).mockResolvedValueOnce({ id: 'gov-1' }).mockResolvedValueOnce({ id: 'gov-2' });

    const a = await createDetachedProjectForEnrollment('enr-1');
    const b = await createDetachedProjectForEnrollment('enr-1');

    expect([a.id, b.id]).toEqual(['gov-1', 'gov-2']);
    expect(mock(Project.create)).toHaveBeenCalledTimes(2);
    expect(enr.active_project_id).toBe('existing-active'); // still the primary build
    expect(enr.save).not.toHaveBeenCalled();
  });

  it('still throws when the cohort has no program (same guard as the activating path)', async () => {
    const enr = makeEnrollment({ cohort: { program_id: null } });
    mock(Enrollment.findByPk).mockResolvedValue(enr);
    await expect(createDetachedProjectForEnrollment('enr-1')).rejects.toThrow(/no associated program/);
    expect(mock(Project.create)).not.toHaveBeenCalled();
  });

  it('REGRESSION: the student path still creates AND activates (repoints + saves)', async () => {
    const enr = makeEnrollment();
    mock(Enrollment.findByPk).mockResolvedValue(enr);
    mock(Project.create).mockResolvedValue({ id: 'student-proj' });

    const p = await createNewProjectForEnrollment('enr-1');

    expect(p.id).toBe('student-proj');
    expect(enr.active_project_id).toBe('student-proj'); // repointed
    expect(enr.save).toHaveBeenCalledTimes(1);
  });
});
