jest.mock('../../../config/database', () => ({ sequelize: { query: jest.fn() } }));

import { sequelize } from '../../../config/database';
import {
  isPresentationType, presentationTypeLabel, presentationTypeOptions, setTakePresentationType,
} from '../takePresentationType';
import { PRESENTATION_TEMPLATE_IDS } from '../index';

const q = sequelize.query as unknown as jest.Mock;

/**
 * CLASSIFYING A TAKE.
 *
 * Ali asked Practice to make the learner say what kind of presentation each video
 * is, so demos can be categorised and so the kind travels into the post.
 *
 * The property that matters most here is that there is ONE vocabulary. The Learn
 * stage already offers seven templates, the deck prompt is built from them, and
 * the lesson a student reads comes from them. A second list of "video kinds"
 * would drift within a month and then mean two different things in two places, so
 * these tests tie the type directly to the template registry rather than to a
 * copy of its contents.
 */

const REC = '5ff8c1cd-0929-4ab4-8e3f-df32c338a931';
const OWNER = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const PROJ = '6e4bd9da-a22b-4b90-b5b2-55686487f39f';

beforeEach(() => { jest.clearAllMocks(); q.mockReset(); });

describe('the vocabulary is the template registry, not a copy of it', () => {
  it('accepts every template id the registry declares', () => {
    expect(PRESENTATION_TEMPLATE_IDS.length).toBeGreaterThan(0);
    for (const id of PRESENTATION_TEMPLATE_IDS) {
      expect(isPresentationType(id)).toBe(true);
    }
  });

  it('rejects anything that is not one', () => {
    for (const bad of ['demo', 'Final showcase', '', null, undefined, 42, {}]) {
      expect(isPresentationType(bad)).toBe(false);
    }
  });

  it('labels come from the registry, so the chooser cannot drift from the lesson', () => {
    expect(presentationTypeLabel('final_showcase')).toBe('Final showcase');
    expect(presentationTypeLabel('working_system_demo')).toBe('Working-system demo');
  });

  it('an unknown id has NO label rather than a guessed one', () => {
    // Echoing the raw id back as a label would put `working_sytem_demo` in a feed
    // looking deliberate.
    expect(presentationTypeLabel('not_a_type')).toBeNull();
    expect(presentationTypeLabel(null)).toBeNull();
  });

  it('offers every registry template as an option, none invented, none missing', () => {
    const ids = presentationTypeOptions().map((o) => o.id);
    expect([...ids].sort()).toEqual([...PRESENTATION_TEMPLATE_IDS].sort());
  });

  it('puts the prominent ones first, so the chooser matches the Learn stage', () => {
    const opts = presentationTypeOptions();
    const firstNonProminent = opts.findIndex((o) => !o.prominent);
    if (firstNonProminent === -1) return; // all prominent is fine
    expect(opts.slice(firstNonProminent).every((o) => !o.prominent)).toBe(true);
  });
});

describe('storing a classification', () => {
  it('writes the type and reports the label back', async () => {
    q.mockResolvedValueOnce([[{ id: REC }], {}]);
    const r = await setTakePresentationType(OWNER, PROJ, 'PREP-4', REC, 'working_system_demo');
    expect(r).toEqual({
      ok: true, recordingId: REC, presentationType: 'working_system_demo', label: 'Working-system demo',
    });
  });

  it('REFUSES an unknown type without touching the database', async () => {
    // An unvalidated string here puts junk in a column the feed renders.
    const r = await setTakePresentationType(OWNER, PROJ, 'PREP-4', REC, 'whatever');
    expect(r).toEqual({ ok: false, reason: 'bad_type' });
    expect(q).not.toHaveBeenCalled();
  });

  it('refuses a non-uuid recording without querying', async () => {
    const r = await setTakePresentationType(OWNER, PROJ, 'PREP-4', 'nope', 'final_showcase');
    expect(r).toEqual({ ok: false, reason: 'not_found' });
    expect(q).not.toHaveBeenCalled();
  });

  it('PROVES OWNERSHIP INSIDE THE UPDATE, not before it', async () => {
    // A read-then-write would let a learner classify somebody else's rehearsal if
    // the two statements ever drifted. The enrollment, project and story are all
    // part of the write's own WHERE clause.
    q.mockResolvedValueOnce([[{ id: REC }], {}]);
    await setTakePresentationType(OWNER, PROJ, 'PREP-4', REC, 'final_showcase');

    const [sql, opts] = q.mock.calls[0];
    expect(String(sql)).toContain('UPDATE presentation_recordings');
    expect(String(sql)).toContain('asg.enrollment_id = :enrollmentId');
    expect(String(sql)).toContain('asg.project_id    = :projectId');
    expect(String(sql)).toContain('asg.story_id      = :storyId');
    expect(opts.replacements).toMatchObject({
      enrollmentId: OWNER, projectId: PROJ, storyId: 'PREP-4', recordingId: REC,
    });
  });

  it("someone else's recording is NOT FOUND, never forbidden", async () => {
    // Nothing updated, because the WHERE clause excluded it. Distinguishing
    // "yours" from "exists but not yours" would confirm the id is real.
    q.mockResolvedValueOnce([[], {}]);
    const r = await setTakePresentationType(OWNER, PROJ, 'PREP-4', REC, 'final_showcase');
    expect(r).toEqual({ ok: false, reason: 'not_found' });
  });

  it('passes values as replacements, never interpolated', async () => {
    q.mockResolvedValueOnce([[{ id: REC }], {}]);
    await setTakePresentationType(OWNER, PROJ, 'PREP-4', REC, 'final_showcase');
    expect(String(q.mock.calls[0][0])).not.toContain(REC);
    expect(String(q.mock.calls[0][0])).not.toContain(OWNER);
  });
});
