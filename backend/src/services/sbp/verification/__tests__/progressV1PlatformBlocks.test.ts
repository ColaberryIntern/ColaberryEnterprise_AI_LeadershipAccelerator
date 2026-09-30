/**
 * A v1 progress file must stay READABLE, even though its platform-owned blocks
 * are shaped differently from v2's.
 *
 * WHY THIS TEST EXISTS
 * --------------------
 * `MIN_READABLE_PROGRESS_VERSION = 1` is a promise, and `parseProgressFile`
 * documents the reasoning behind it: "a file from the past is readable (every
 * bump so far has only ADDED optional fields)."
 *
 * That promise was not being kept. The v1 writer emitted a `totals` block with
 * five keys and a per-story `verification` block with `state`/`commit`, while
 * the v2 schema requires eight keys on `totals` and `criteria_passed` plus
 * `criteria_total` on `verification`. Both are OPTIONAL, so an absent block was
 * fine, but a PRESENT-and-partial one failed the object check and took the
 * whole file down with it — including every criterion the student had ticked.
 *
 * Observed in production on 2026-08-17, on real student repos:
 *
 *   Abr246/Architect-Workspace        29 issues, all on totals/verification
 *   Million191/architect-workspace1   43 issues, all on totals/verification
 *
 * Both students had all five STORY-000 criteria marked passed with text
 * matching the plan word for word, and both were told nothing at all, because
 * a rejected read produces no verdict. One of them had reached the state by
 * following the instructions and setting `verification.commit` by hand, so the
 * act of engaging carefully with the file is what broke it.
 *
 * WHY LENIENCY IS CORRECT HERE AND NOT A WEAKENING
 * ------------------------------------------------
 * `totals` and `verification` are the PLATFORM's side of the file. The module
 * says so directly: the platform's conclusion is "never merged up from the
 * repo, because this side is not the student's to assert". We recompute both on
 * every run and never trust the repo's copy. A block we do not read has no
 * business invalidating the blocks we do.
 *
 * The student-owned contract is deliberately NOT relaxed: a missing
 * `schema_version`, a `stories` that is not an array, or a malformed criterion
 * still rejects the file. The last case in this file pins that down.
 */
import {
  parseProgressFile,
  PROGRESS_SCHEMA_VERSION,
} from '../progressContract';

/** The v1 shape as the old writer actually emitted it, trimmed to one story. */
const v1FileWithPartialPlatformBlocks = JSON.stringify({
  schema_version: 1,
  totals: {
    // Five of the eight keys v2 declares. The other three never existed in v1.
    stories_total: 13,
    stories_verified: 0,
    criteria_total: 21,
    criteria_passed: 5,
    points_awarded: 0,
  },
  stories: [
    {
      id: 'STORY-000',
      // v1's verification block: no criteria_passed, no criteria_total.
      verification: { state: 'submitted', commit: '1702952' },
      points: 0,
      criteria: [
        { text: 'Given the Command Center, when it is opened, then every tab is reachable.', passed: true },
        { text: 'Given sample mode, when any tab is shown, then sample data is labelled.', passed: true },
      ],
    },
  ],
});

describe('parseProgressFile: v1 files with partial platform-owned blocks', () => {
  it('reads the file rather than rejecting it', () => {
    const result = parseProgressFile(v1FileWithPartialPlatformBlocks);

    expect(result.ok).toBe(true);
  });

  it("preserves the student's criteria claims, which are the point of the file", () => {
    const result = parseProgressFile(v1FileWithPartialPlatformBlocks);
    if (!result.ok) throw new Error(`expected a readable file, got ${result.error_class}: ${result.reason}`);

    const story = result.file.stories.find((s) => s.id === 'STORY-000');
    expect(story).toBeDefined();
    expect(story!.criteria).toHaveLength(2);
    expect(story!.criteria.every((c) => c.passed)).toBe(true);
  });

  it('drops the unreadable platform-owned blocks instead of trusting them', () => {
    const result = parseProgressFile(v1FileWithPartialPlatformBlocks);
    if (!result.ok) throw new Error(`expected a readable file, got ${result.error_class}`);

    // Recomputed every run, so dropping is safe and trusting would not be.
    expect(result.file.totals ?? null).toBeNull();
    const story = result.file.stories.find((s) => s.id === 'STORY-000');
    expect(story!.verification ?? null).toBeNull();
  });

  it('still accepts a complete v2 file and keeps its platform blocks', () => {
    const v2 = JSON.stringify({
      schema_version: PROGRESS_SCHEMA_VERSION,
      stories: [
        {
          id: 'STORY-000',
          criteria: [{ text: 'Given the Command Center, it opens.', passed: true }],
          verification: {
            state: 'verified',
            criteria_passed: 1,
            criteria_total: 1,
            outstanding: [],
          },
        },
      ],
    });

    const result = parseProgressFile(v2);
    if (!result.ok) throw new Error(`expected a readable file, got ${result.error_class}`);

    const story = result.file.stories.find((s) => s.id === 'STORY-000');
    expect(story!.verification).not.toBeNull();
    expect(story!.verification!.state).toBe('verified');
  });

  it('does NOT relax the student-owned part of the contract', () => {
    // `stories` as an object rather than an array: a genuinely unreadable file,
    // and it must stay unreadable. Seen in production the same night.
    const malformed = JSON.stringify({
      stories: { 'STORY-000': { title: 'Command Center', status: 'complete' } },
    });

    const result = parseProgressFile(malformed);

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('unreachable');
    expect(result.error_class).toBe('ProgressFileSchemaMismatch');
  });
});
