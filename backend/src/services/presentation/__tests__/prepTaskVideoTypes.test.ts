import fs from 'fs';
import path from 'path';
import {
  PREP_TASK_VIDEO_TYPES,
  DEMO_DAY_PREP_ID,
  videoTypeForPrepTask,
  prepTaskForVideoType,
  mappingProblems,
} from '../prepTaskVideoTypes';
import { PRESENTATION_TEMPLATE_IDS } from '..';

/**
 * ONE TASK, ONE TYPE.
 *
 * The pairing used to live in `presentation_assignments.template_slug`, a field
 * the UI writes as a side effect of navigating — so it drifted until one
 * project had PREP-1 ("Write the demo narrative") carrying `architecture_review`.
 *
 * Two things are worth guarding: the table is a bijection onto the seven real
 * types, and the copy of it embedded in the boot-time backfill SQL still says
 * the same thing as the module.
 */

describe('the table is a bijection onto the real types', () => {
  it('reports no problems', () => {
    expect(mappingProblems()).toEqual([]);
  });

  it('positive control: the checker can actually find a problem', () => {
    // A checker that returned [] unconditionally would make the test above
    // meaningless, which is how guards quietly rot.
    const known = new Set(PRESENTATION_TEMPLATE_IDS);
    expect(known.has('not_a_real_type')).toBe(false);
    expect(known.size).toBe(7);
  });

  it('covers every presentation type exactly once', () => {
    const mapped = PREP_TASK_VIDEO_TYPES.map((r) => r.typeId).sort();
    expect(mapped).toEqual([...PRESENTATION_TEMPLATE_IDS].sort());
  });

  it('gives each task exactly one type', () => {
    const stories = PREP_TASK_VIDEO_TYPES.map((r) => r.storyId);
    expect(new Set(stories).size).toBe(stories.length);
    expect(stories.length).toBe(7);
  });

  it('leaves Demo Day out — it is live, not a video', () => {
    expect(videoTypeForPrepTask(DEMO_DAY_PREP_ID)).toBeNull();
    expect(PREP_TASK_VIDEO_TYPES.some((r) => r.storyId === DEMO_DAY_PREP_ID)).toBe(false);
  });
});

describe('lookups', () => {
  it('resolves a task to its type', () => {
    expect(videoTypeForPrepTask('PREP-1')).toBe('project_introduction');
    expect(videoTypeForPrepTask('PREP-7')).toBe('client_handoff');
  });

  it('resolves a type back to its task', () => {
    expect(prepTaskForVideoType('project_introduction')).toBe('PREP-1');
    expect(prepTaskForVideoType('client_handoff')).toBe('PREP-7');
  });

  it('round-trips every pair', () => {
    for (const { storyId, typeId } of PREP_TASK_VIDEO_TYPES) {
      expect(prepTaskForVideoType(videoTypeForPrepTask(storyId))).toBe(storyId);
    }
  });

  it('is null for anything it does not know, rather than guessing', () => {
    expect(videoTypeForPrepTask('PREP-99')).toBeNull();
    expect(videoTypeForPrepTask(null)).toBeNull();
    expect(videoTypeForPrepTask(undefined)).toBeNull();
    expect(prepTaskForVideoType('not_a_type')).toBeNull();
    expect(prepTaskForVideoType(null)).toBeNull();
  });
});

describe('the backfill SQL says the same thing as the module', () => {
  // The DDL list cannot import application code, so the pairing is written
  // twice. Two copies of a fact are safe only while something fails loudly when
  // they diverge — this is that something.
  const SCHEMA = fs.readFileSync(
    path.join(__dirname, '..', '..', '..', 'db', 'ensurePresentationStudioSchema.ts'),
    'utf8',
  );

  it('positive control: found the backfill statement', () => {
    expect(SCHEMA).toContain('UPDATE presentation_assignments SET template_slug = v.type_id');
  });

  it.each(PREP_TASK_VIDEO_TYPES.map((r) => [r.storyId, r.typeId]))(
    'the SQL pairs %s with %s',
    (storyId, typeId) => {
      expect(SCHEMA).toContain(`('${storyId}', '${typeId}')`);
    },
  );

  it('the SQL pairs nothing the module does not', () => {
    const pairs = [...SCHEMA.matchAll(/\('(PREP-\d+)', '([a-z_]+)'\)/g)]
      .map((m) => `${m[1]}:${m[2]}`);
    const mine = PREP_TASK_VIDEO_TYPES.map((r) => `${r.storyId}:${r.typeId}`);
    expect(pairs.sort()).toEqual(mine.sort());
  });

  it('never re-labels a recording, only the task', () => {
    // A take's type is a fact about the day it was recorded. Re-pointing the
    // task it belongs to must not rewrite footage that already exists.
    const stmt = SCHEMA.slice(SCHEMA.indexOf('UPDATE presentation_assignments SET template_slug'));
    const upToEnd = stmt.slice(0, stmt.indexOf('`,'));
    expect(upToEnd).not.toContain('presentation_recordings');
  });

  it('skips rows that already match, so a re-run writes nothing', () => {
    expect(SCHEMA).toContain('template_slug IS DISTINCT FROM v.type_id');
  });
});
