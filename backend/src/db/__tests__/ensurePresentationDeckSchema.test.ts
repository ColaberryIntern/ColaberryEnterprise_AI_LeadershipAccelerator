import { PRESENTATION_DECK_STATEMENTS, PRESENTATION_DECK_TABLES } from '../ensurePresentationDeckSchema';

/**
 * The statement contract for `presentation_decks`.
 *
 * Checked as SQL TEXT, because the trap this guards is invisible at runtime on a fresh
 * database and only bites where the table already exists: `CREATE TABLE IF NOT EXISTS`
 * is a no-op there, so a column added only to the CREATE body never appears in
 * production and every write to it is silently dropped.
 */

const CREATE = PRESENTATION_DECK_STATEMENTS.find((s) => /^CREATE TABLE/i.test(s))!;

/** Column names in the CREATE body, ignoring the constraint lines. */
function createdColumns(sql: string): string[] {
  const body = sql.slice(sql.indexOf('(') + 1, sql.lastIndexOf(')'));
  return body
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l && !/^(PRIMARY|UNIQUE|CONSTRAINT|FOREIGN|CHECK|EXCLUDE)/i.test(l))
    .map((l) => l.split(/\s+/)[0])
    .filter((c) => /^[a-z_]+$/.test(c));
}

describe('the deck table is created and extended in step', () => {
  it('positive control: the parser found a real set of columns', () => {
    // Without this a parser that silently matched nothing would make the next
    // assertion compare two empty sets and pass.
    expect(createdColumns(CREATE).length).toBeGreaterThan(8);
    expect(createdColumns(CREATE)).toContain('content_html');
  });

  it('every column in the CREATE body also has an explicit ADD COLUMN IF NOT EXISTS', () => {
    const altered = new Set(
      PRESENTATION_DECK_STATEMENTS
        .filter((s) => /ADD COLUMN IF NOT EXISTS/i.test(s))
        .map((s) => s.match(/ADD COLUMN IF NOT EXISTS\s+([a-z_]+)/i)![1]),
    );
    const missing = createdColumns(CREATE).filter((c) => c !== 'id' && !altered.has(c));
    expect(missing).toEqual([]);
  });

  it('creates exactly the one table it declares', () => {
    const created = PRESENTATION_DECK_STATEMENTS
      .filter((s) => /^CREATE TABLE/i.test(s))
      .map((s) => s.match(/CREATE TABLE IF NOT EXISTS\s+([a-z_]+)/i)![1]);
    expect(created).toEqual([...PRESENTATION_DECK_TABLES]);
  });

  it('every ALTER is additive — nothing drops or retypes a column', () => {
    for (const s of PRESENTATION_DECK_STATEMENTS.filter((x) => /^ALTER TABLE/i.test(x))) {
      expect(s).toMatch(/ADD COLUMN IF NOT EXISTS/i);
      expect(s).not.toMatch(/DROP COLUMN|ALTER COLUMN|TYPE /i);
    }
  });

  it('every index is IF NOT EXISTS, so a re-run is a no-op', () => {
    for (const s of PRESENTATION_DECK_STATEMENTS.filter((x) => /CREATE (UNIQUE )?INDEX/i.test(x))) {
      expect(s).toMatch(/IF NOT EXISTS/i);
    }
  });
});

describe('concurrency is the database\'s job, not the service\'s', () => {
  /**
   * THE RULE. Two clicks a second apart would both see "nothing running" under a
   * read-then-write and both start a paid model call. A partial unique index cannot
   * race.
   */
  it('allows only ONE generating row per assignment', () => {
    const idx = PRESENTATION_DECK_STATEMENTS.find((s) => s.includes('presentation_decks_one_in_flight'))!;
    expect(idx).toMatch(/CREATE UNIQUE INDEX/i);
    expect(idx).toMatch(/\(assignment_id\)/);
    expect(idx).toMatch(/WHERE state = 'generating'/);
  });

  it('numbers attempts uniquely per assignment', () => {
    const idx = PRESENTATION_DECK_STATEMENTS.find((s) => s.includes('presentation_decks_attempt_no'))!;
    expect(idx).toMatch(/CREATE UNIQUE INDEX/i);
    expect(idx).toMatch(/\(assignment_id, attempt_no\)/);
  });

  // A failed generation has to be findable by whoever is triaging, not just by the
  // student who hit it.
  it('indexes failures for the operations queue', () => {
    const idx = PRESENTATION_DECK_STATEMENTS.find((s) => s.includes('presentation_decks_failed'))!;
    expect(idx).toMatch(/WHERE state = 'failed'/);
  });
});

describe('what the table records', () => {
  it('keeps the prompt version AND a sha of what was sent', () => {
    expect(CREATE).toMatch(/prompt_version\s+VARCHAR/);
    expect(CREATE).toMatch(/prompt_sha\s+VARCHAR\(64\)/);
  });

  it('keeps the failure, not just the success', () => {
    expect(CREATE).toMatch(/error_class\s+VARCHAR/);
    expect(CREATE).toMatch(/tries\s+INTEGER/);
  });

  // Generating a deck is work in progress. Completion stays with the canonical writer.
  it('has no column that could be mistaken for task completion', () => {
    expect(CREATE).not.toMatch(/verified|complete|points|awarded/i);
  });
});
