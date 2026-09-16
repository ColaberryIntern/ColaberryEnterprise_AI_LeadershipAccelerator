/**
 * The Flotation door into the one intake.
 *
 * What is being guarded: that a conversation becomes exactly ONE project, that it goes
 * through the same startBuild the portal wizard uses, and that an unconfirmed understanding
 * can be refused rather than silently built from.
 */

const mockFindByPk = jest.fn();
const mockResolveProject = jest.fn();
const mockStartBuild = jest.fn();

jest.mock('../../../models/ProjectUnderstandingRecord', () => ({
  __esModule: true,
  default: { findByPk: (...a: any[]) => mockFindByPk(...a) },
}));
jest.mock('../../projectService', () => ({
  resolveProjectForNewBuild: (...a: any[]) => mockResolveProject(...a),
}));
jest.mock('../../sbp/sbpOrchestrator', () => ({
  startBuild: (...a: any[]) => mockStartBuild(...a),
}));

import { startBuildFromUnderstanding } from '../buildFromUnderstanding';

const record = (over: any = {}) => ({
  id: 'rec-1',
  status: 'extracted',
  title: 'Tool Loan Management System',
  proposed_surfaces: [],
  confirmed_at: null,
  scope: null,
  items: [
    { dimension: 'problem', value: 'Managing tool loans is challenging with a paper sign-out sheet.', classification: 'FACT', provenance: 'source_message' },
    { dimension: 'actors', value: 'Marta runs the desk on Saturdays.', classification: 'FACT', provenance: 'source_message' },
  ],
  update: jest.fn().mockResolvedValue(undefined),
  ...over,
});

beforeEach(() => {
  jest.clearAllMocks();
  mockResolveProject.mockResolvedValue({ project: { id: 'proj-1' }, reused: false });
  mockStartBuild.mockResolvedValue({ projectId: 'proj-1', correlationId: 'corr-1', status: 'generating' });
});

describe('startBuildFromUnderstanding', () => {
  it('goes through the same startBuild the portal wizard uses', async () => {
    mockFindByPk.mockResolvedValue(record());

    const result = await startBuildFromUnderstanding({ recordId: 'rec-1', enrollmentId: 'enr-1' });

    expect(result).toMatchObject({ ok: true, projectId: 'proj-1', status: 'generating', reused: false });
    expect(mockResolveProject).toHaveBeenCalledWith('enr-1');
    expect(mockStartBuild).toHaveBeenCalledWith(
      expect.objectContaining({
        projectId: 'proj-1',
        enrollmentId: 'enr-1',
        name: 'Tool Loan Management System',
        answers: expect.arrayContaining([expect.objectContaining({ id: 'actors' })]),
      }),
    );
  });

  it('remembers the hand-off on the understanding, after the build has started', async () => {
    const rec = record();
    mockFindByPk.mockResolvedValue(rec);

    await startBuildFromUnderstanding({ recordId: 'rec-1', enrollmentId: 'enr-1' });

    expect(rec.update).toHaveBeenCalledWith({
      scope: expect.objectContaining({
        build: expect.objectContaining({ project_id: 'proj-1', enrollment_id: 'enr-1', correlation_id: 'corr-1' }),
      }),
    });
  });

  it('is one project per conversation: a second call returns the first project', async () => {
    // resolveProjectForNewBuild mints a NEW project once the first has build content, so
    // without this a retry would build the same conversation twice.
    mockFindByPk.mockResolvedValue(record({ scope: { build: { project_id: 'proj-earlier', correlation_id: 'corr-earlier' } } }));

    const result = await startBuildFromUnderstanding({ recordId: 'rec-1', enrollmentId: 'enr-1' });

    expect(result).toMatchObject({ ok: true, projectId: 'proj-earlier', reused: true });
    expect(mockStartBuild).not.toHaveBeenCalled();
    expect(mockResolveProject).not.toHaveBeenCalled();
  });

  it('keeps the cached prototypes when it records the hand-off', async () => {
    const rec = record({ scope: { prototypes: { concepts: [] } } });
    mockFindByPk.mockResolvedValue(rec);

    await startBuildFromUnderstanding({ recordId: 'rec-1', enrollmentId: 'enr-1' });

    expect(rec.update).toHaveBeenCalledWith({ scope: expect.objectContaining({ prototypes: { concepts: [] } }) });
  });

  it('refuses an understanding that does not exist', async () => {
    mockFindByPk.mockResolvedValue(null);
    expect(await startBuildFromUnderstanding({ recordId: 'nope', enrollmentId: 'enr-1' })).toMatchObject({ ok: false, reason: 'not_found' });
    expect(mockStartBuild).not.toHaveBeenCalled();
  });

  it('refuses one that failed extraction', async () => {
    mockFindByPk.mockResolvedValue(record({ status: 'failed' }));
    expect(await startBuildFromUnderstanding({ recordId: 'rec-1', enrollmentId: 'enr-1' })).toMatchObject({ ok: false, reason: 'not_extracted' });
  });

  it('can insist on §17 confirmation, and refuses an unconfirmed one when asked', async () => {
    mockFindByPk.mockResolvedValue(record({ confirmed_at: null }));

    const result = await startBuildFromUnderstanding({ recordId: 'rec-1', enrollmentId: 'enr-1', requireConfirmed: true });

    expect(result).toMatchObject({ ok: false, reason: 'not_confirmed' });
    expect(mockStartBuild).not.toHaveBeenCalled();
  });

  it('builds a confirmed one when confirmation is required', async () => {
    mockFindByPk.mockResolvedValue(record({ confirmed_at: new Date() }));
    expect(await startBuildFromUnderstanding({ recordId: 'rec-1', enrollmentId: 'enr-1', requireConfirmed: true })).toMatchObject({ ok: true });
  });

  it('does not record a hand-off when the build failed to start, so it can be retried', async () => {
    const rec = record();
    mockFindByPk.mockResolvedValue(rec);
    mockStartBuild.mockRejectedValue(new Error('queue full'));

    const result = await startBuildFromUnderstanding({ recordId: 'rec-1', enrollmentId: 'enr-1' });

    expect(result).toMatchObject({ ok: false, reason: 'failed' });
    expect(rec.update).not.toHaveBeenCalled();
  });

  it('still reports success when the build started but the hand-off note could not be saved', async () => {
    // The build is real either way. Losing the note allows a duplicate on retry, which is
    // the lesser evil against a hand-off that is recorded but never happened.
    const rec = record({ update: jest.fn().mockRejectedValue(new Error('db blip')) });
    mockFindByPk.mockResolvedValue(rec);

    expect(await startBuildFromUnderstanding({ recordId: 'rec-1', enrollmentId: 'enr-1' })).toMatchObject({ ok: true, projectId: 'proj-1' });
  });
});
