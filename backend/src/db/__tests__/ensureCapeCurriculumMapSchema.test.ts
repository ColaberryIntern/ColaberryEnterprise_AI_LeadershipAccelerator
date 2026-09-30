/**
 * Static contract test for ensureCapeCurriculumMapSchema — asserts the SQL statement
 * array declares the 2 new tables + the 5 timeline_cards stamp columns, WITHOUT
 * requiring a live database (mocked sequelize.query, same convention as
 * ensureCapeSchema.test.ts / ensureCapePlacementSchema.test.ts).
 */
jest.mock('../../config/database', () => ({ sequelize: { query: jest.fn().mockResolvedValue([]) } }));

import { sequelize } from '../../config/database';
import { ensureCapeCurriculumMapSchema } from '../ensureCapeCurriculumMapSchema';

const mockQuery = sequelize.query as unknown as jest.Mock;

beforeEach(() => {
  jest.clearAllMocks();
});

describe('ensureCapeCurriculumMapSchema', () => {
  it('happy path: creates curriculum_skill_maps and architecture_skill_prerequisites, adds the 5 timeline_cards columns', async () => {
    await ensureCapeCurriculumMapSchema();
    const statements = mockQuery.mock.calls.map((c) => String(c[0]));

    expect(statements.some((s) => /CREATE TABLE IF NOT EXISTS curriculum_skill_maps/.test(s))).toBe(true);
    expect(statements.some((s) => /CREATE TABLE IF NOT EXISTS architecture_skill_prerequisites/.test(s))).toBe(true);
    for (const col of ['skill_mapping', 'skill_mapping_source', 'skill_mapping_map_id', 'skill_mapping_version', 'skill_mapping_resolved_at']) {
      expect(statements.some((s) => new RegExp(`ALTER TABLE timeline_cards ADD COLUMN IF NOT EXISTS ${col}\\b`).test(s))).toBe(true);
    }
  });

  it('boundary: declares partial-unique indexes per scope_type so only one is_current row can exist per scope key', async () => {
    await ensureCapeCurriculumMapSchema();
    const statements = mockQuery.mock.calls.map((c) => String(c[0]));

    expect(statements.some((s) => /idx_curriculum_skill_maps_type_current.*WHERE scope_type = 'type' AND is_current/.test(s))).toBe(true);
    expect(statements.some((s) => /idx_curriculum_skill_maps_week_current.*WHERE scope_type = 'week' AND is_current/.test(s))).toBe(true);
    expect(statements.some((s) => /idx_curriculum_skill_maps_card_current.*WHERE scope_type = 'card' AND is_current/.test(s))).toBe(true);
  });

  it('boundary: declares a unique pair index on architecture_skill_prerequisites so an edge cannot be duplicated', async () => {
    await ensureCapeCurriculumMapSchema();
    const statements = mockQuery.mock.calls.map((c) => String(c[0]));
    expect(statements.some((s) => /UNIQUE INDEX.*idx_arch_skill_prereq_pair.*\(skill_id, prerequisite_skill_id\)/.test(s))).toBe(true);
  });

  it('idempotency: a statement failure (e.g. column already exists under a partial DB state) does not stop the remaining statements from running', async () => {
    mockQuery.mockRejectedValueOnce(new Error('already exists')).mockResolvedValue([]);
    await expect(ensureCapeCurriculumMapSchema()).resolves.toBeUndefined();
    expect(mockQuery.mock.calls.length).toBeGreaterThan(5);
  });

  it('does not touch student_skill_evidence, student_architecture_skill, resume_skill_claims, diagnostic_attempts, or any promotion/XP table', async () => {
    await ensureCapeCurriculumMapSchema();
    const statements = mockQuery.mock.calls.map((c) => String(c[0]));
    const touchesExisting = statements.some((s) =>
      /\b(student_skill_evidence|student_architecture_skill|resume_skill_claims|diagnostic_attempts|xp_events|evidence_records|competency_domains|student_competencies|points_config)\b/.test(s) &&
      !/REFERENCES/.test(s));
    expect(touchesExisting).toBe(false);
  });

  it('references timeline_cards(id) for card_id — depends on timeline_cards already existing', async () => {
    await ensureCapeCurriculumMapSchema();
    const statements = mockQuery.mock.calls.map((c) => String(c[0]));
    expect(statements.some((s) => /card_id UUID REFERENCES timeline_cards\(id\)/.test(s))).toBe(true);
  });
});
