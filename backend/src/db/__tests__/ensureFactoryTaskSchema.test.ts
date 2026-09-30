/**
 * The factory task columns must be purely additive: only `ADD COLUMN IF NOT EXISTS` on
 * student_tasks, never a change to an existing column, so every existing task row is untouched.
 * Asserted against the actual DDL.
 */
import { FACTORY_TASK_STATEMENTS, REQUIRED_COLUMNS } from '../ensureFactoryTaskSchema';

describe('ensureFactoryTaskSchema is additive-only', () => {
  it('every statement is ALTER TABLE student_tasks ADD COLUMN IF NOT EXISTS', () => {
    for (const sql of FACTORY_TASK_STATEMENTS) {
      expect(sql.trim()).toMatch(/^ALTER TABLE student_tasks ADD COLUMN IF NOT EXISTS/i);
      expect(sql.toUpperCase()).not.toMatch(/\bDROP\b/);
      expect(sql.toUpperCase()).not.toMatch(/\bALTER COLUMN\b/);
      expect(sql.toUpperCase()).not.toMatch(/\bRENAME\b/);
      // No DEFAULT — a default would stamp every existing row (the archive/approval lesson).
      expect(sql.toUpperCase()).not.toMatch(/\bDEFAULT\b/);
    }
  });

  it('adds exactly the declared REQUIRED_COLUMNS and no others', () => {
    const added = FACTORY_TASK_STATEMENTS
      .map((s) => s.match(/ADD COLUMN IF NOT EXISTS\s+(\w+)/i)?.[1])
      .filter(Boolean) as string[];
    expect(added.sort()).toEqual([...REQUIRED_COLUMNS].sort());
  });

  it('touches only student_tasks, never another existing table', () => {
    for (const sql of FACTORY_TASK_STATEMENTS) {
      const table = sql.match(/ALTER TABLE\s+(\w+)/i)?.[1];
      expect(table).toBe('student_tasks');
    }
  });
});
