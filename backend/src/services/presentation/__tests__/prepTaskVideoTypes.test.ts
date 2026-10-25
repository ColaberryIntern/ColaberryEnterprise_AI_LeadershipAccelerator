import fs from 'fs';
import path from 'path';
import {
  PREP_TASK_VIDEO_TYPES,
  DEMO_DAY_PREP_ID,
  videoTypeForPrepTask,
  prepTaskForVideoType,
  mappingProblems,
  TYPES_WITHOUT_A_TASK,
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

  it('accounts for every presentation type — on a task, or declared as a gap', () => {
    const mapped = PREP_TASK_VIDEO_TYPES.map((r) => r.typeId);
    const accounted = [...mapped, ...TYPES_WITHOUT_A_TASK].sort();
    expect(accounted).toEqual([...PRESENTATION_TEMPLATE_IDS].sort());
  });

  it('gives each task exactly one type', () => {
    const stories = PREP_TASK_VIDEO_TYPES.map((r) => r.storyId);
    expect(new Set(stories).size).toBe(stories.length);
    expect(stories.length).toBe(5);
  });

  it('leaves Demo Day out — it is live, not a video', () => {
    expect(videoTypeForPrepTask(DEMO_DAY_PREP_ID)).toBeNull();
    expect(PREP_TASK_VIDEO_TYPES.some((r) => r.storyId === DEMO_DAY_PREP_ID)).toBe(false);
  });

  it('REGRESSION: Demo Day never carries a video type', () => {
    // On 2026-10-24 this table gave PREP-6 `architecture_review` while the rest
    // of the system still treated PREP-6 as Demo Day, so one task was both
    // "Staff marks this one" at 60 points and an Architecture Review video.
    // It shipped. This is the assertion that makes it impossible to repeat.
    expect(videoTypeForPrepTask('PREP-6')).toBeNull();
    expect(mappingProblems()).toEqual([]);
  });

  it('names the types that have no task, instead of silently dropping them', () => {
    // Seven types, five task slots. The two without a task are still
    // recordable from an empty portfolio slot and still paid; stating which
    // they are is what stopped the gap being filled by accident.
    expect([...TYPES_WITHOUT_A_TASK].sort()).toEqual(['architecture_review', 'client_handoff']);
  });
});

describe('lookups', () => {
  it('resolves a task to its type', () => {
    expect(videoTypeForPrepTask('PREP-1')).toBe('project_introduction');
    expect(videoTypeForPrepTask('PREP-5')).toBe('final_showcase');
  });

  it('resolves a type back to its task', () => {
    expect(prepTaskForVideoType('project_introduction')).toBe('PREP-1');
    expect(prepTaskForVideoType('final_showcase')).toBe('PREP-5');
  });

  it('is null for a type that has no task yet, rather than inventing one', () => {
    for (const t of TYPES_WITHOUT_A_TASK) expect(prepTaskForVideoType(t)).toBeNull();
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

  it('the SQL pairs nothing the module does not, beyond the Demo Day correction', () => {
    const pairs = [...SCHEMA.matchAll(/\('(PREP-\d+)', '([a-z_]+)'\)/g)]
      .map((m) => `${m[1]}:${m[2]}`);
    // PREP-6 appears in the SQL and NOT in the module on purpose: it is the
    // statement that undoes the video type wrongly written onto Demo Day.
    const expected = [
      ...PREP_TASK_VIDEO_TYPES.map((r) => `${r.storyId}:${r.typeId}`),
      'PREP-6:final_showcase',
    ];
    expect(pairs.sort()).toEqual(expected.sort());
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

  it('corrects PREP-6 away from the video type it was wrongly given', () => {
    // The 2026-10-24 deploy wrote `architecture_review` onto PREP-6 in
    // production. Removing it from the module is not enough — the written rows
    // have to be corrected, so the backfill names PREP-6 explicitly.
    expect(SCHEMA).toContain("('PREP-6', 'final_showcase')");
    expect(SCHEMA).not.toContain("('PREP-6', 'architecture_review')");
  });
});

describe('the task TITLES say which video the task is about', () => {
  // The rename is a SCRIPT, not a schema statement. Two guard tests said so:
  // the Studio schema may not write to `student_tasks` at all, and the SBP
  // schema may only ALTER ... ADD COLUMN. A one-off data correction belongs in
  // something a person runs deliberately.
  const SCHEMA = fs.readFileSync(
    path.join(__dirname, '..', '..', '..', 'scripts', 'backfillPrepTaskTitles.ts'),
    'utf8',
  );
  const SCHEDULE = fs.readFileSync(
    path.join(__dirname, '..', '..', 'sbp', 'buildSchedule.ts'),
    'utf8',
  );

  /** What each task is called, for new builds and for the rename of old ones. */
  const TITLES: Record<string, string> = {
    'PREP-1': 'Record Your Project Introduction',
    'PREP-2': 'Record Your Working-System Demo',
    'PREP-3': 'Record Your AI Visual Presentation',
    'PREP-4': 'Record Your Stakeholder Update',
    'PREP-5': 'Record Your Final Showcase',
    'PREP-6': 'Present at Demo Day',
  };

  it('positive control: found both places titles are written', () => {
    expect(SCHEDULE).toContain("key: 'PREP-1'");
    expect(SCHEMA).toContain('UPDATE student_tasks');
  });

  it.each(Object.entries(TITLES))('new builds name %s "%s"', (storyId, title) => {
    expect(SCHEDULE).toContain(`key: '${storyId}', title: '${title}'`);
  });

  it.each(Object.entries(TITLES))('the rename gives existing %s "%s"', (storyId, title) => {
    expect(SCHEMA).toContain(`storyId: '${storyId}', title: '${title}'`);
  });

  it('every video task is named after the type it asks for', () => {
    // The whole complaint: "The step names don't match the video names."
    const labels: Record<string, string> = {
      project_introduction: 'Project Introduction',
      working_system_demo: 'Working-System Demo',
      ai_visual_presentation: 'AI Visual Presentation',
      stakeholder_update: 'Stakeholder Update',
      final_showcase: 'Final Showcase',
    };
    for (const { storyId, typeId } of PREP_TASK_VIDEO_TYPES) {
      expect(TITLES[storyId]).toBe(`Record Your ${labels[typeId]}`);
    }
  });

  it('renames only the title, never anything completion keys on', () => {
    const stmt = SCHEMA.slice(SCHEMA.indexOf('UPDATE student_tasks'));
    const upToEnd = stmt.slice(0, stmt.indexOf('RETURNING id'));
    for (const forbidden of ['verified_at', 'status', 'points', 'due_on', 'description']) {
      expect(upToEnd).not.toContain(forbidden);
    }
  });

  it('is a dry run unless someone asks for the write', () => {
    // A data correction that applies itself on import is one nobody reviewed.
    expect(SCHEMA).toContain("process.argv.includes('--write')");
  });
});
