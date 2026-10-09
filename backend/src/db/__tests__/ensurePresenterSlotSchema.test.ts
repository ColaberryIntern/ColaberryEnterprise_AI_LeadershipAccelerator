import {
  PRESENTER_SLOT_STATEMENTS,
  PRESENTER_SLOT_TABLES,
  PRESENTER_SLOT_REQUIRED_COLUMNS,
  PRESENTER_SLOT_STATES,
  PRESENTER_SLOT_ROLES,
} from '../ensurePresenterSlotSchema';

/** Static contract test — reads the DDL as source text, touches no database. */

const SQL = PRESENTER_SLOT_STATEMENTS.join('\n');

function columnsInCreate(): string[] {
  const create = PRESENTER_SLOT_STATEMENTS.find((s) => s.includes('CREATE TABLE IF NOT EXISTS'))!;
  const body = create.slice(create.indexOf('(') + 1, create.lastIndexOf(')'));
  return body
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith('--'))
    .map((l) => l.split(/\s+/)[0].replace(/,$/, ''))
    .filter((c) => /^[a-z_]+$/.test(c));
}

describe('presentation_presenter_slots DDL', () => {
  it('declares the one table it owns', () => {
    expect(PRESENTER_SLOT_TABLES).toEqual(['presentation_presenter_slots']);
  });

  it('gives EVERY column in the CREATE a matching ADD COLUMN IF NOT EXISTS', () => {
    const cols = columnsInCreate();
    // Positive control: a parser returning nothing would make the loop vacuous.
    expect(cols.length).toBeGreaterThan(8);
    expect(cols).toContain('position');

    const missing = cols
      .filter((c) => c !== 'id')
      .filter((c) => !SQL.includes(`ADD COLUMN IF NOT EXISTS ${c} `));
    expect(missing).toEqual([]);
  });

  it('allows one presenter per position', () => {
    // Two students both "third" is a running order that disagrees with itself
    // depending on how it is sorted — found on the day, never before.
    expect(SQL).toContain('presenter_slots_unique_position');
    expect(SQL).toMatch(/ON presentation_presenter_slots \(booking_id, position\)/);
  });

  it('allows one slot per learner per session', () => {
    expect(SQL).toContain('presenter_slots_unique_assignment');
    expect(SQL).toMatch(/ON presentation_presenter_slots \(booking_id, assignment_id\)/);
  });

  it('lets a cancelled slot free its position instead of blocking it forever', () => {
    // Both unique indexes are partial. Without that, cancelling the third presenter
    // leaves position 3 permanently unusable.
    const uniques = PRESENTER_SLOT_STATEMENTS.filter((s) => s.includes('CREATE UNIQUE INDEX'));
    expect(uniques.length).toBe(2);
    for (const u of uniques) expect(u).toMatch(/WHERE state <> 'cancelled'/);
  });

  it('every statement is re-runnable', () => {
    for (const stmt of PRESENTER_SLOT_STATEMENTS) {
      expect({ s: stmt.slice(0, 60), ok: /IF NOT EXISTS/.test(stmt) }).toEqual({ s: stmt.slice(0, 60), ok: true });
    }
  });

  it('stores no copy of a learners name, project or evidence', () => {
    // A slot points at an assignment. Denormalising anything readable here would
    // create a second place one student's work can surface on another's page.
    for (const forbidden of ['title', 'name', 'email', 'evidence', 'url']) {
      expect(SQL.toLowerCase()).not.toContain(` ${forbidden} `);
    }
  });

  it('keeps a slot distinct from having presented', () => {
    // 'done' means the slot elapsed. It is not a claim anyone presented well, or
    // at all — that is staff's to assert on PREP-6.
    expect(PRESENTER_SLOT_STATES).toEqual(['scheduled', 'presenting', 'done', 'cancelled']);
    expect(PRESENTER_SLOT_ROLES).toEqual(['presenter', 'peer']);
    expect(PRESENTER_SLOT_REQUIRED_COLUMNS).toContain('presentation_presenter_slots.position');
  });
});
