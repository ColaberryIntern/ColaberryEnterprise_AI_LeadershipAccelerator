/**
 * The contract file, pinned.
 *
 * The property that matters most here is the one that is easiest to get wrong:
 * a malformed file must be REJECTED LOUDLY, never quietly downgraded to "an
 * empty progress file". Those two states look identical to a naive parser and
 * mean opposite things to a student — one says "you have not started", the
 * other says "we cannot read what you did".
 */
import {
  parseProgressFile,
  renderProgressFile,
  mergeProgressFile,
  serialiseProgressFile,
  PROGRESS_SCHEMA_VERSION,
  PROGRESS_FILE_MAX_BYTES,
} from '../progressContract';

/** The merge's happy path, for tests that only care about the merged file. */
function mergedFile(rendered: ReturnType<typeof renderProgressFile>, existing: string | null) {
  const r = mergeProgressFile(rendered, existing);
  if (!r.ok) throw new Error(`merge refused: ${r.error_class}`);
  return r.file;
}

const CRIT = 'The roster endpoint returns 200';

describe('parseProgressFile', () => {
  it('accepts a well-formed file', () => {
    const raw = JSON.stringify({
      schema_version: PROGRESS_SCHEMA_VERSION,
      stories: [{ id: 'STORY-001', criteria: [{ text: CRIT, passed: true }] }],
    });
    const result = parseProgressFile(raw);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.file.stories[0].criteria[0].passed).toBe(true);
      // Defaulted, not missing — downstream never has to null-check them.
      expect(result.file.stories[0].files_touched).toEqual([]);
    }
  });

  it('rejects a missing file with its own class, distinct from malformed', () => {
    for (const raw of [null, undefined, '', '   ']) {
      const r = parseProgressFile(raw);
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.error_class).toBe('ProgressFileMissing');
    }
  });

  it('rejects broken JSON loudly, and does NOT read as "nothing done"', () => {
    const r = parseProgressFile('{ "schema_version": 1, "stories": [ }');
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error_class).toBe('ProgressFileNotJson');
      expect(r.reason).toMatch(/not valid JSON/);
      expect(r.issues?.length).toBeGreaterThan(0);
    }
  });

  it('names the story and the field for a nested failure, and does NOT tell the student to add schema_version', () => {
    // What the reporting learner saw: a file WITH schema_version and stories,
    // told to add schema_version and stories. He could not act on that.
    const raw = JSON.stringify({
      schema_version: PROGRESS_SCHEMA_VERSION,
      stories: [
        { id: 'STORY-000', criteria: [{ text: CRIT, passed: true }] },
        { id: 'STORY-006', criteria: [{ text: CRIT, passed: 'yes' }] },
      ],
    });
    const r = parseProgressFile(raw);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error_class).toBe('ProgressFileSchemaMismatch');
      expect(r.reason).toMatch(/STORY-006 criteria\.0\.passed/);
      expect(r.reason).not.toMatch(/top-level "schema_version"/);
      expect(r.reason).toMatch(/rest of the file is fine/);
      expect(r.issues?.[0]).toMatch(/^STORY-006 criteria\.0\.passed: /);
    }
  });

  it('rejects a hand-mangled shape with field-level detail', () => {
    const raw = JSON.stringify({
      schema_version: PROGRESS_SCHEMA_VERSION,
      stories: [{ id: 'STORY-001', criteria: [{ text: CRIT, passed: 'yes please' }] }],
    });
    const r = parseProgressFile(raw);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error_class).toBe('ProgressFileSchemaMismatch');
      expect(r.issues?.join(' ')).toMatch(/passed/);
    }
  });

  it('rejects a file with no schema_version at all', () => {
    const r = parseProgressFile(JSON.stringify({ stories: [] }));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error_class).toBe('ProgressFileSchemaMismatch');
  });

  /**
   * The advice has to be advice the student can actually take.
   *
   * It used to end "Sync your build plan from the portal to restore the file".
   * The platform writes repo files with `process.env.GITHUB_TOKEN`, and on a
   * bring-your-own repo it frequently holds only `pull` — confirmed live on
   * 2026-08-17, where the platform identity's permissions on one student's repo
   * were {"admin":false,"maintain":false,"push":false,"triage":false,
   * "pull":true}. A Sync could never restore her file, so the sentence sent her
   * round a loop that had no exit. The honest instruction is the SHAPE.
   */
  it('names the shape to fix rather than prescribing a sync the platform may be unable to perform', () => {
    const r = parseProgressFile(JSON.stringify({ project: 'Roster' }));
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error_class).toBe('ProgressFileSchemaMismatch');
      expect(r.reason).toMatch(/schema_version/);
      expect(r.reason).toMatch(/stories/);
      expect(r.reason).not.toMatch(/[Ss]ync/);
    }
  });

  it('names a version mismatch as a version problem, not a malformed file', () => {
    const r = parseProgressFile(JSON.stringify({ schema_version: 99, stories: [] }));
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error_class).toBe('ProgressFileUnsupportedVersion');
      expect(r.reason).toMatch(/schema_version 99/);
    }
  });
});

describe('renderProgressFile', () => {
  const stories = [
    { id: 'STORY-002', release: 'R1', acceptance: ['b1'] },
    { id: 'STORY-001', release: 'R1', acceptance: ['a1', 'a2'] },
  ];

  it('seeds every criterion from the plan, all unpassed, sorted by story id', () => {
    const file = renderProgressFile(stories, 'Test');
    expect(file.stories.map((s) => s.id)).toEqual(['STORY-001', 'STORY-002']);
    expect(file.stories[0].criteria).toEqual([
      { text: 'a1', passed: false },
      { text: 'a2', passed: false },
    ]);
    expect(file.stories[0].acceptance_total).toBe(2);
  });

  it('is deterministic — the same plan renders byte-identical output', () => {
    const a = serialiseProgressFile(renderProgressFile(stories, 'Test'));
    const b = serialiseProgressFile(renderProgressFile([...stories].reverse(), 'Test'));
    expect(a).toBe(b);
  });

  it('round-trips through the parser it will be read by', () => {
    expect(parseProgressFile(serialiseProgressFile(renderProgressFile(stories, 'Test'))).ok).toBe(true);
  });
});

describe('mergeProgressFile — a republish must not wipe the student\'s ticks', () => {
  const rendered = renderProgressFile([{ id: 'STORY-001', acceptance: ['a1', 'a2'] }], 'Test');

  it('carries the passed flags and notes across', () => {
    const existing = serialiseProgressFile({
      ...rendered,
      stories: [{
        ...rendered.stories[0],
        criteria: [{ text: 'a1', passed: true }, { text: 'a2', passed: false }],
        files_touched: ['src/x.ts'],
        tests_added: ['src/__tests__/x.test.ts'],
        notes: 'a2 blocked on the API key',
        updated_at: '2026-08-10T00:00:00Z',
      }],
    });
    const merged = mergedFile(rendered, existing);
    expect(merged.stories[0].criteria).toEqual([
      { text: 'a1', passed: true },
      { text: 'a2', passed: false },
    ]);
    expect(merged.stories[0].files_touched).toEqual(['src/x.ts']);
    expect(merged.stories[0].notes).toBe('a2 blocked on the API key');
  });

  it('does NOT carry a tick across when the plan reworded the criterion', () => {
    // The sentence the student ticked is not the sentence now being asked for.
    const reworded = renderProgressFile([{ id: 'STORY-001', acceptance: ['a1 but stricter', 'a2'] }], 'Test');
    const existing = serialiseProgressFile({
      ...rendered,
      stories: [{ ...rendered.stories[0], criteria: [{ text: 'a1', passed: true }, { text: 'a2', passed: true }] }],
    });
    const merged = mergedFile(reworded, existing);
    expect(merged.stories[0].criteria[0]).toEqual({ text: 'a1 but stricter', passed: false });
    expect(merged.stories[0].criteria[1]).toEqual({ text: 'a2', passed: true });
  });

  it('drops a story the plan no longer has, and adds one it gained', () => {
    const next = renderProgressFile([{ id: 'STORY-002', acceptance: ['b1'] }], 'Test');
    const existing = serialiseProgressFile({
      ...rendered,
      stories: [{ ...rendered.stories[0], criteria: [{ text: 'a1', passed: true }, { text: 'a2', passed: true }] }],
    });
    const merged = mergedFile(next, existing);
    expect(merged.stories.map((s) => s.id)).toEqual(['STORY-002']);
    expect(merged.stories[0].criteria[0].passed).toBe(false);
  });

  /**
   * This used to assert the opposite: an unreadable existing file fell back to
   * the clean render. That fallback is what wiped a student's seven verified
   * stories, twice, when one over-long notes field made his file unparseable.
   * A merge that cannot see one side must say so, not pick the side it can see.
   */
  it('REFUSES rather than falling back when the existing file cannot be read', () => {
    const r = mergeProgressFile(rendered, 'not json at all');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error_class).toBe('ProgressFileNotJson');
    const missing = mergeProgressFile(rendered, null);
    expect(missing.ok).toBe(false);
    if (!missing.ok) expect(missing.error_class).toBe('ProgressFileMissing');
  });

  /**
   * The file that started this. `stories.4.notes` and `stories.6.notes` were
   * over the old 4,000-character cap; nothing else was wrong with it.
   */
  it('carries long notes and long evidence across untouched, byte for byte', () => {
    const longNotes = 'Decision log. '.repeat(500);          // ~7,000 chars
    const longEvidence = 'pytest -q passed: '.repeat(200);    // ~3,600 chars
    expect(longNotes.length).toBeGreaterThan(4000);
    expect(longEvidence.length).toBeGreaterThan(2000);
    const existing = serialiseProgressFile({
      ...rendered,
      stories: [{
        ...rendered.stories[0],
        criteria: [{ text: 'a1', passed: true, evidence: longEvidence }, { text: 'a2', passed: false }],
        notes: longNotes,
      }],
    });
    const parsed = parseProgressFile(existing);
    expect(parsed.ok).toBe(true);
    const merged = mergedFile(rendered, existing);
    expect(merged.stories[0].notes).toBe(longNotes);
    expect(merged.stories[0].criteria[0].passed).toBe(true);
    expect(merged.stories[0].criteria[0].evidence).toBe(longEvidence);
  });

  it('the bound that remains is on the whole file, and it names the size', () => {
    const huge = JSON.stringify({ schema_version: PROGRESS_SCHEMA_VERSION, stories: [], pad: 'x'.repeat(PROGRESS_FILE_MAX_BYTES) });
    const r = parseProgressFile(huge);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error_class).toBe('ProgressFileTooLarge');
      expect(r.reason).toMatch(/KB/);
      expect(r.reason).not.toMatch(/schema_version/);
    }
  });
});
