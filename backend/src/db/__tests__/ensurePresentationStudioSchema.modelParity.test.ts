import {
  PRESENTATION_STUDIO_STATEMENTS,
  PRESENTATION_STUDIO_TABLES,
  PRESENTATION_STUDIO_FOREIGN_TABLE_COLUMNS,
} from '../ensurePresentationStudioSchema';
import { modelsByTable, modelColumnNames, parseCreatedTables } from './schemaParityHelpers';
import '../../models';

/**
 * Schema/model parity for the five Presentation Studio tables, in the same shape as
 * the other ensure* parity suites.
 *
 * WHY THIS IS SEPARATE from the statement-contract suite: that one proves the right
 * SQL is issued, this one proves the Sequelize models AGREE with it. The two drift
 * silently and in the direction that hurts most. A DDL column missing from the model
 * is invisible to every query, so writes to it are dropped with no error at all. A
 * model column missing from the DDL makes Sequelize emit SQL for a column that does
 * not exist, which fails at runtime in production, on a path no local test hit —
 * `sync()` is disabled on this 215-model graph, so nothing reconciles them for you.
 *
 * CLAUDE.md states it plainly: "Sequelize models are the contract." This suite is
 * what keeps that true rather than aspirational.
 */

describe('ensurePresentationStudioSchema — DDL and models agree', () => {
  const created = parseCreatedTables(PRESENTATION_STUDIO_STATEMENTS);

  it('creates exactly the five Studio tables', () => {
    expect(created.map((t) => t.table).sort()).toEqual([...PRESENTATION_STUDIO_TABLES].sort());
  });

  it('positive control: the parser found real columns, so the parity checks are not vacuous', () => {
    // Without this, a parser that silently stopped matching would make every
    // assertion below compare two empty sets and pass.
    for (const t of created) {
      expect(t.columns.length).toBeGreaterThan(5);
    }
  });

  it.each([...PRESENTATION_STUDIO_TABLES])(
    'every DDL column of %s is declared on the model, and vice versa',
    (table) => {
      const model = modelsByTable()[table];
      expect(model).toBeDefined();
      const mapped = modelColumnNames(model);
      const ddl = created.find((t) => t.table === table)!.columns;
      // A DDL column with no model attribute is invisible to Sequelize — the write
      // is silently dropped.
      expect(ddl.filter((c) => !mapped.has(c))).toEqual([]);
      // A model attribute with no DDL column makes Sequelize emit SQL referencing a
      // column that does not exist.
      expect(Array.from(mapped).filter((c) => !ddl.includes(c))).toEqual([]);
    },
  );

  it('extends the existing projects table rather than recreating it', () => {
    // Recreating would be a silent no-op that masks the extension; dropping would
    // destroy every student project.
    expect(created.map((t) => t.table)).not.toContain('projects');
    const flat = PRESENTATION_STUDIO_STATEMENTS.map((s) => s.replace(/\s+/g, ' '));
    expect(flat.some((s) => /DROP TABLE|DROP COLUMN/i.test(s))).toBe(false);
    for (const col of PRESENTATION_STUDIO_FOREIGN_TABLE_COLUMNS) {
      const [, name] = col.split('.');
      expect(
        flat.some((s) => new RegExp(`ALTER TABLE projects ADD COLUMN IF NOT EXISTS ${name}\\b`, 'i').test(s)),
      ).toBe(true);
    }
  });

  it('the recording dedupe key is declared on the model, not only in the DDL', () => {
    const model = modelsByTable()['presentation_recordings'];
    const indexes = (model.options?.indexes || []) as Array<{
      name?: string; unique?: boolean; fields?: string[];
    }>;
    const idx = indexes.find((i) => i.name === 'presentation_recordings_unique_part');
    expect(idx).toBeDefined();
    expect(idx!.unique).toBe(true);
    expect(idx!.fields).toEqual(['occurrence_uuid', 'provider_file_id']);
  });

  it('closed-by-default flags carry the same default on the model as in the DDL', () => {
    const showcase = modelsByTable()['presentation_showcases'].getAttributes();
    expect(showcase.audience.defaultValue).toBe('private');
    // Approval is an act by a person, never an absence of one.
    expect(showcase.author_approved_at.defaultValue).toBeUndefined();
    expect(showcase.author_approved_at.allowNull).toBe(true);
    expect(showcase.staff_approved_at.defaultValue).toBeUndefined();

    const attempt = modelsByTable()['presentation_attempts'].getAttributes();
    expect(attempt.is_final_take.defaultValue).toBe(false);
    // 'expected' is honest: a session scheduled to record has produced nothing yet.
    expect(attempt.recording_state.defaultValue).toBe('expected');

    const feedback = modelsByTable()['presentation_feedback'].getAttributes();
    expect(feedback.visibility.defaultValue).toBe('private');

    const assignment = modelsByTable()['presentation_assignments'].getAttributes();
    expect(assignment.required.defaultValue).toBe(false);
  });

  it('a score may be absent, so an unassessable dimension is never stored as zero', () => {
    const feedback = modelsByTable()['presentation_feedback'].getAttributes();
    expect(feedback.score_json.allowNull).toBe(true);
    // Same reason: "not determined" must be distinguishable from "false".
    const rec = modelsByTable()['presentation_recordings'].getAttributes();
    expect(rec.has_audio.allowNull).toBe(true);
    expect(rec.has_shared_screen.allowNull).toBe(true);
  });
});
