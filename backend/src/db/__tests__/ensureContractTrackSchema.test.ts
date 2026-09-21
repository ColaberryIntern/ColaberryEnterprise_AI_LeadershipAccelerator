/**
 * The contract-track schema must be purely ADDITIVE: it may only create new tables/indexes,
 * never alter or drop an existing one, and its foreign keys may only reference existing tables
 * (delivery_projects, projects) — never re-shape them. This is asserted against the actual DDL
 * so a future edit that sneaks in an ALTER of an existing table fails here.
 */
import { CONTRACT_TRACK_STATEMENTS, REQUIRED_TABLES } from '../ensureContractTrackSchema';

describe('ensureContractTrackSchema is additive-only', () => {
  it('every statement is CREATE ... IF NOT EXISTS (no ALTER, no DROP, no TRUNCATE)', () => {
    for (const sql of CONTRACT_TRACK_STATEMENTS) {
      const s = sql.trim().toUpperCase();
      expect(s.startsWith('CREATE TABLE IF NOT EXISTS') || s.startsWith('CREATE INDEX IF NOT EXISTS') || s.startsWith('CREATE UNIQUE INDEX IF NOT EXISTS')).toBe(true);
      expect(s).not.toMatch(/\bALTER\s+TABLE\b/);
      expect(s).not.toMatch(/\bDROP\b/);
      expect(s).not.toMatch(/\bTRUNCATE\b/);
    }
  });

  it('every CREATE TABLE targets one of the new REQUIRED_TABLES (never an existing table)', () => {
    const created = CONTRACT_TRACK_STATEMENTS
      .map((s) => s.match(/CREATE TABLE IF NOT EXISTS\s+(\w+)/i)?.[1])
      .filter(Boolean) as string[];
    expect(created.sort()).toEqual([...REQUIRED_TABLES].sort());
  });

  it('foreign keys reference only existing tables (delivery_projects, projects)', () => {
    const refs = CONTRACT_TRACK_STATEMENTS
      .join('\n')
      .match(/REFERENCES\s+(\w+)\s*\(/gi)
      ?.map((r) => r.replace(/REFERENCES\s+/i, '').replace(/\s*\(/, '').trim()) ?? [];
    expect(refs.length).toBeGreaterThan(0);
    for (const t of refs) expect(['delivery_projects', 'projects']).toContain(t);
  });

  it('never references the internship tables or re-homes the parent onto student projects', () => {
    const joined = CONTRACT_TRACK_STATEMENTS.join('\n');
    // The parent is delivery_projects; a track's delivery_project_id must FK there.
    expect(joined).toMatch(/delivery_project_id\s+UUID\s+NOT NULL\s+REFERENCES\s+delivery_projects/i);
  });
});
