/**
 * The Flotation door into the one intake.
 *
 * What is being guarded: that a conversation becomes exactly ONE project, that it goes
 * through the same startBuild the portal wizard uses, and that an unconfirmed understanding
 * can be refused rather than silently built from.
 */

import * as fs from 'fs';
import * as path from 'path';

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

import { startBuildFromUnderstanding, MIN_ITEMS_TO_BUILD } from '../buildFromUnderstanding';

const record = (over: any = {}) => ({
  id: 'rec-1',
  status: 'extracted',
  title: 'Tool Loan Management System',
  proposed_surfaces: [],
  confirmed_at: null,
  scope: null,
  build_handoff: null,
  // Three, not two: MIN_ITEMS_TO_BUILD is the floor a real conversation clears easily
  // (live ones run 8-18 items) and a 37-second hang-up does not.
  items: [
    { dimension: 'problem', value: 'Managing tool loans is challenging with a paper sign-out sheet.', classification: 'FACT', provenance: 'source_message' },
    { dimension: 'actors', value: 'Marta runs the desk on Saturdays.', classification: 'FACT', provenance: 'source_message' },
    { dimension: 'desired_outcome', value: 'See what is out and chase overdue tools automatically.', classification: 'FACT', provenance: 'source_message' },
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

  it('remembers the hand-off in its OWN column, after the build has started', async () => {
    const rec = record();
    mockFindByPk.mockResolvedValue(rec);

    await startBuildFromUnderstanding({ recordId: 'rec-1', enrollmentId: 'enr-1' });

    expect(rec.update).toHaveBeenCalledWith({
      build_handoff: expect.objectContaining({ project_id: 'proj-1', enrollment_id: 'enr-1', correlation_id: 'corr-1' }),
    });
    // And never inside `scope`, which the scope generator replaces whole.
    const written = rec.update.mock.calls[0][0];
    expect(written).not.toHaveProperty('scope');
  });

  it('is one project per conversation: a second call returns the first project', async () => {
    // resolveProjectForNewBuild mints a NEW project once the first has build content, so
    // without this a retry would build the same conversation twice.
    mockFindByPk.mockResolvedValue(record({ build_handoff: { project_id: 'proj-earlier', correlation_id: 'corr-earlier' } }));

    const result = await startBuildFromUnderstanding({ recordId: 'rec-1', enrollmentId: 'enr-1' });

    expect(result).toMatchObject({ ok: true, projectId: 'proj-earlier', reused: true });
    expect(mockStartBuild).not.toHaveBeenCalled();
    expect(mockResolveProject).not.toHaveBeenCalled();
  });

  it('survives the scope cache being regenerated between two arrivals of the final turn', async () => {
    // THE 2026-09-17 DEFECT. The hand-off used to live at scope.build. Between two arrivals
    // of the same final turn the page fetched its preview, the scope generator wrote
    // `scope` whole, the hand-off was gone, and the second arrival built a second project
    // (85032431 then 35541e66, one conversation). A regenerated scope must not matter.
    const rec = record({
      build_handoff: { project_id: 'proj-first', correlation_id: 'corr-first' },
      scope: { version: 99, summary: 'freshly regenerated, no build key in here' },
    });
    mockFindByPk.mockResolvedValue(rec);

    const result = await startBuildFromUnderstanding({ recordId: 'rec-1', enrollmentId: 'enr-1' });

    expect(result).toMatchObject({ ok: true, projectId: 'proj-first', reused: true });
    expect(mockStartBuild).not.toHaveBeenCalled();
  });

  it('still honours a hand-off recorded the old way, under scope.build', async () => {
    // Conversations from before the column keep their project rather than getting a second.
    mockFindByPk.mockResolvedValue(record({ scope: { build: { project_id: 'proj-legacy', correlation_id: 'corr-legacy' } } }));

    const result = await startBuildFromUnderstanding({ recordId: 'rec-1', enrollmentId: 'enr-1' });

    expect(result).toMatchObject({ ok: true, projectId: 'proj-legacy', reused: true });
    expect(mockStartBuild).not.toHaveBeenCalled();
  });

  it('leaves the cached scope and prototypes alone when it records the hand-off', async () => {
    const rec = record({ scope: { version: 3, prototypes: { concepts: [] } } });
    mockFindByPk.mockResolvedValue(rec);

    await startBuildFromUnderstanding({ recordId: 'rec-1', enrollmentId: 'enr-1' });

    expect(rec.update).toHaveBeenCalledTimes(1);
    expect(rec.update.mock.calls[0][0]).toEqual({ build_handoff: expect.any(Object) });
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

describe('the hand-off has exactly one writer', () => {
  // The column exists because a cache write from another module erased the hand-off. That
  // stays fixed only while nothing else touches the column: the scope generator and the
  // prototype cache may write `scope`; only the bridge may write `build_handoff`.
  const delivery = path.resolve(__dirname, '..');
  const files = fs.readdirSync(delivery).filter((f) => f.endsWith('.ts'));

  it('is written only by buildFromUnderstanding.ts', () => {
    const writers = files.filter((f) => /update\(\s*\{[^}]*build_handoff/s.test(fs.readFileSync(path.join(delivery, f), 'utf8')));
    expect(writers).toEqual(['buildFromUnderstanding.ts']);
  });

  it('is never written inside scope again', () => {
    for (const f of files) {
      const src = fs.readFileSync(path.join(delivery, f), 'utf8');
      expect({ file: f, hit: /scope:\s*\{[^}]*build:/.test(src) }).toEqual({ file: f, hit: false });
    }
  });
});

describe('a conversation too thin to build from', () => {
  // WHAT HAPPENED. A 37-second call - "hello", "I'm an AI", "I just told you that",
  // hang up - extracted ONE item and published a project with nothing in it. The
  // write-up is still worth keeping; the project is not. This is a floor, not a gate:
  // nobody approves anything, it just has to have been a conversation.
  const thin = (n) => record({ items: Array.from({ length: n }, (_, i) => ({ dimension: 'problem', value: `item ${i}`, classification: 'FACT', provenance: 'source_message' })) });

  it('refuses to build from one understood item, and says so plainly', async () => {
    mockFindByPk.mockResolvedValue(thin(1));

    const result = await startBuildFromUnderstanding({ recordId: 'rec-1', enrollmentId: 'enr-1' });

    expect(result).toMatchObject({ ok: false, reason: 'too_thin' });
    expect((result as any).error).toMatch(/only 1 thing could be understood/);
    expect((result as any).error).toMatch(/write-up is kept/);
    expect(mockStartBuild).not.toHaveBeenCalled();
    expect(mockResolveProject).not.toHaveBeenCalled();
  });

  it('refuses an empty one too, with the plural right', async () => {
    mockFindByPk.mockResolvedValue(record({ items: [] }));
    const result = await startBuildFromUnderstanding({ recordId: 'rec-1', enrollmentId: 'enr-1' });
    expect((result as any).error).toMatch(/only 0 things could be understood/);
  });

  it('builds at the floor, so the floor is a floor and not a wall', async () => {
    mockFindByPk.mockResolvedValue(thin(MIN_ITEMS_TO_BUILD));
    const result = await startBuildFromUnderstanding({ recordId: 'rec-1', enrollmentId: 'enr-1' });
    expect(result.ok).toBe(true);
    expect(mockStartBuild).toHaveBeenCalledTimes(1);
  });

  it('is checked before anything is created, so nothing is left behind', async () => {
    const rec = thin(1);
    mockFindByPk.mockResolvedValue(rec);
    await startBuildFromUnderstanding({ recordId: 'rec-1', enrollmentId: 'enr-1' });
    expect(rec.update).not.toHaveBeenCalled();
  });
});
