jest.mock('../../../config/database', () => ({ sequelize: { query: jest.fn() } }));
jest.mock('../../../models/PresentationRecordingView', () => ({
  __esModule: true,
  default: { findAll: jest.fn().mockResolvedValue([]) },
}));

import { sequelize } from '../../../config/database';
import PresentationRecordingView from '../../../models/PresentationRecordingView';
import { getPortfolio } from '../presentationPortfolio';
import { PRESENTATION_TEMPLATE_IDS } from '../index';

const q = sequelize.query as unknown as jest.Mock;
const views = PresentationRecordingView as unknown as { findAll: jest.Mock };

/**
 * SEVEN SLOTS, FILLED OR EMPTY.
 *
 * Steps 5 and 6 were both placeholders that read and wrote nothing. This is what
 * replaced them, and the property that carries the screen is that the grid is
 * ALWAYS seven — a portfolio showing only what exists makes an empty one look
 * finished, and the holes are what tell a learner there are six more kinds of
 * presentation to practise.
 */

const ENROLLMENT = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const PROJ = '6e4bd9da-a22b-4b90-b5b2-55686487f39f';
const STORY = 'PREP-4';
const REC = (n: number) => `${n}aaaaaa1-1111-4111-8111-11111111111${n}`;

/** The assignment lookup, then the recordings lookup, in that order. */
const arrange = (assignment: Record<string, any> | null, recordings: Array<Record<string, any>>) => {
  q.mockReset();
  q.mockResolvedValueOnce([assignment ? [assignment] : [], {}]);
  q.mockResolvedValueOnce([recordings, {}]);
};

const ASSIGNMENT = { id: 'as1', template_slug: 'ai_visual_presentation', reflection_notes: null };

const rec = (over: Record<string, unknown> = {}) => ({
  recording_id: REC(1),
  presentation_type: 'project_introduction',
  duration_seconds: 90,
  created_at: new Date('2026-10-12T18:00:00Z'),
  showcase_id: null,
  published_at: null,
  withdrawn_at: null,
  ...over,
});

beforeEach(() => {
  jest.clearAllMocks();
  views.findAll.mockResolvedValue([]);
});

describe('the grid is always seven', () => {
  it('ZERO recorded: seven slots, none filled', async () => {
    arrange(ASSIGNMENT, []);
    const p = (await getPortfolio(ENROLLMENT, PROJ, STORY))!;
    expect(p.slots).toHaveLength(7);
    expect(p.slots.every((s) => !s.recorded)).toBe(true);
    expect(p.recordedTypeCount).toBe(0);
  });

  it('ONE recorded: still seven slots, one filled', async () => {
    arrange(ASSIGNMENT, [rec()]);
    const p = (await getPortfolio(ENROLLMENT, PROJ, STORY))!;
    expect(p.slots).toHaveLength(7);
    expect(p.recordedTypeCount).toBe(1);
    expect(p.slots.find((s) => s.typeId === 'project_introduction')!.recorded).toBe(true);
  });

  it('ALL SEVEN recorded: nothing left to start', async () => {
    arrange(ASSIGNMENT, PRESENTATION_TEMPLATE_IDS.map((id, i) =>
      rec({ recording_id: REC(i % 9), presentation_type: id })));
    const p = (await getPortfolio(ENROLLMENT, PROJ, STORY))!;
    expect(p.recordedTypeCount).toBe(7);
    expect(p.slots.every((s) => s.recorded)).toBe(true);
    expect(p.nextTypeId).toBeNull();
  });

  it('slots follow the LEARN order, so the two screens read the same way round', async () => {
    arrange(ASSIGNMENT, []);
    const p = (await getPortfolio(ENROLLMENT, PROJ, STORY))!;
    expect(p.slots.map((s) => s.typeId)).toEqual([...PRESENTATION_TEMPLATE_IDS]);
  });

  it('names the FIRST missing type, for the "start the next one" link', async () => {
    arrange(ASSIGNMENT, [rec({ presentation_type: PRESENTATION_TEMPLATE_IDS[0] })]);
    const p = (await getPortfolio(ENROLLMENT, PROJ, STORY))!;
    expect(p.nextTypeId).toBe(PRESENTATION_TEMPLATE_IDS[1]);
  });
});

describe('what a filled slot carries', () => {
  it('the LATEST take represents the slot, with the count beside it', async () => {
    // Newest first from the query. A learner with four takes has one entry and
    // the most recent is the one they would want shown.
    arrange(ASSIGNMENT, [
      rec({ recording_id: REC(3), created_at: new Date('2026-10-17T10:00:00Z'), duration_seconds: 71 }),
      rec({ recording_id: REC(2), created_at: new Date('2026-10-14T10:00:00Z') }),
      rec({ recording_id: REC(1), created_at: new Date('2026-10-12T10:00:00Z') }),
    ]);
    const slot = (await getPortfolio(ENROLLMENT, PROJ, STORY))!
      .slots.find((s) => s.typeId === 'project_introduction')!;
    expect(slot.takeCount).toBe(3);
    expect(slot.recordingId).toBe(REC(3));
    expect(slot.durationSeconds).toBe(71);
  });

  it('carries a player, a poster AND a download, all on one ticket', async () => {
    arrange(ASSIGNMENT, [rec()]);
    const slot = (await getPortfolio(ENROLLMENT, PROJ, STORY))!
      .slots.find((s) => s.typeId === 'project_introduction')!;
    expect(slot.playbackUrl).toContain(`/recordings/${REC(1)}/file?t=`);
    expect(slot.thumbnailUrl).toContain(`/recordings/${REC(1)}/thumbnail?t=`);
    // Download is how a demo reaches social: the learner posts the file itself
    // rather than us publishing a public, indexable URL.
    expect(slot.downloadUrl).toContain(`/recordings/${REC(1)}/download?t=`);
  });

  it('an EMPTY slot carries no urls to click', async () => {
    arrange(ASSIGNMENT, []);
    const slot = (await getPortfolio(ENROLLMENT, PROJ, STORY))!.slots[0];
    expect(slot.playbackUrl).toBeNull();
    expect(slot.downloadUrl).toBeNull();
    expect(slot.recordingId).toBeNull();
    expect(slot.takeCount).toBe(0);
  });

  it('an empty slot still carries the words a learner needs to choose', async () => {
    arrange(ASSIGNMENT, []);
    const slot = (await getPortfolio(ENROLLMENT, PROJ, STORY))!.slots[0];
    expect(slot.typeLabel.length).toBeGreaterThan(0);
    expect(slot.timing.length).toBeGreaterThan(0);
    expect(slot.description.length).toBeGreaterThan(0);
  });
});

describe('type resolution matches the Practice panel', () => {
  it('a take with NO type of its own inherits the task', async () => {
    // One rule across the product: the grid and the chooser must agree.
    arrange(ASSIGNMENT, [rec({ presentation_type: null })]);
    const p = (await getPortfolio(ENROLLMENT, PROJ, STORY))!;
    expect(p.slots.find((s) => s.typeId === 'ai_visual_presentation')!.recorded).toBe(true);
    expect(p.recordedTypeCount).toBe(1);
  });

  it("a take's OWN type wins over the task's", async () => {
    arrange(ASSIGNMENT, [rec({ presentation_type: 'client_handoff' })]);
    const p = (await getPortfolio(ENROLLMENT, PROJ, STORY))!;
    expect(p.slots.find((s) => s.typeId === 'client_handoff')!.recorded).toBe(true);
    expect(p.slots.find((s) => s.typeId === 'ai_visual_presentation')!.recorded).toBe(false);
  });

  it('a take with no type and no task template counts for nothing, rather than guessing', async () => {
    arrange({ ...ASSIGNMENT, template_slug: null }, [rec({ presentation_type: null })]);
    const p = (await getPortfolio(ENROLLMENT, PROJ, STORY))!;
    expect(p.recordedTypeCount).toBe(0);
  });
});

describe('share state rides along', () => {
  it('published when the live showcase has published_at', async () => {
    arrange(ASSIGNMENT, [rec({ showcase_id: 's1', published_at: new Date() })]);
    const slot = (await getPortfolio(ENROLLMENT, PROJ, STORY))!
      .slots.find((s) => s.typeId === 'project_introduction')!;
    expect(slot.shareState).toBe('published');
    expect(slot.showcaseId).toBe('s1');
  });

  it('pending when a showcase exists but is unpublished', async () => {
    arrange(ASSIGNMENT, [rec({ showcase_id: 's1', published_at: null })]);
    const slot = (await getPortfolio(ENROLLMENT, PROJ, STORY))!
      .slots.find((s) => s.typeId === 'project_introduction')!;
    expect(slot.shareState).toBe('pending');
  });

  it('private when no showcase names it', async () => {
    arrange(ASSIGNMENT, [rec()]);
    const slot = (await getPortfolio(ENROLLMENT, PROJ, STORY))!
      .slots.find((s) => s.typeId === 'project_introduction')!;
    expect(slot.shareState).toBe('private');
    expect(slot.showcaseId).toBeNull();
  });
});

describe('ownership and the reflection', () => {
  it("someone else's task is NOT FOUND, never forbidden", async () => {
    arrange(null, []);
    expect(await getPortfolio(ENROLLMENT, PROJ, STORY)).toBeNull();
  });

  it('scopes the assignment lookup to the learner, the project and the story', async () => {
    arrange(ASSIGNMENT, []);
    await getPortfolio(ENROLLMENT, PROJ, STORY);
    const [sql, opts] = q.mock.calls[0];
    expect(String(sql)).toContain('asg.enrollment_id = :enrollmentId');
    expect(opts.replacements).toMatchObject({ enrollmentId: ENROLLMENT, projectId: PROJ, storyId: STORY });
  });

  it('returns the rehearsal notes so the box is not blank on reload', async () => {
    arrange({ ...ASSIGNMENT, reflection_notes: 'Sam said the cost number came too late.' }, []);
    const p = (await getPortfolio(ENROLLMENT, PROJ, STORY))!;
    expect(p.reflectionNotes).toBe('Sam said the cost number came too late.');
  });

  it('only INGESTED recordings count — a take still arriving is not a slot', async () => {
    arrange(ASSIGNMENT, []);
    await getPortfolio(ENROLLMENT, PROJ, STORY);
    expect(String(q.mock.calls[1][0])).toContain("r.ingest_status = 'ingested'");
  });
});
