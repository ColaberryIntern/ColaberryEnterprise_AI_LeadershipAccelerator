/**
 * DDL / model parity for the internship tables.
 *
 * ── THE BUG THIS EXISTS TO PREVENT ─────────────────────────────────────────
 *
 * `ensureInternshipSchema` declared `internship_interview_sessions.question_set_id`
 * as NOT NULL. The Sequelize model declared it `allowNull: true`, and
 * `openSession()` never set it. In production — where the table is created by the
 * DDL and there is no global sync — every session insert failed, which broke BOTH
 * saving an interview answer and placing an AI call, since `openSession()` runs
 * before the dial.
 *
 * It shipped because the end-to-end journey ran `sequelize.sync()` FIRST, so the
 * tables were built from the MODELS and the DDL's `CREATE TABLE IF NOT EXISTS`
 * did nothing. The journey passed 57/57 against a schema production does not have.
 *
 * This test compares the two declarations directly, with no database, so the
 * disagreement fails here rather than in front of a student.
 *
 * ── WHAT IT CHECKS ─────────────────────────────────────────────────────────
 *
 * For every internship-owned table: a column the DDL marks NOT NULL (and gives no
 * DEFAULT) must not be `allowNull: true` on the model. That combination is exactly
 * the trap — the model says "optional", the code omits it, the database refuses it.
 */
// A REAL Sequelize instance, because Model.init() needs one — but constructed
// without connecting, and with query() stubbed so importing this never opens a
// socket. Mocking it as a bare object breaks every model import.
jest.mock('../../config/database', () => {
  const { Sequelize } = jest.requireActual('sequelize');
  const instance = new Sequelize('postgres://user:pass@127.0.0.1:1/none', {
    logging: false,
  });
  instance.query = jest.fn();
  return { sequelize: instance };
});

import { sequelize } from '../../config/database';
import { ensureInternshipSchema } from '../ensureInternshipSchema';

import CohortMembership from '../../models/CohortMembership';
import InternshipApplication from '../../models/InternshipApplication';
import InternshipStatusEvent from '../../models/InternshipStatusEvent';
import InternshipAdministrativeIntake from '../../models/InternshipAdministrativeIntake';
import InternshipCardDismissal from '../../models/InternshipCardDismissal';
import InternshipInterviewSession from '../../models/InternshipInterviewSession';
import InternshipInterviewResponse from '../../models/InternshipInterviewResponse';
import InternshipDecision from '../../models/InternshipDecision';
import InternshipDocument from '../../models/InternshipDocument';
import InternshipRequirementAcknowledgement from '../../models/InternshipRequirementAcknowledgement';

const mockQuery = (sequelize as any).query as jest.Mock;

/** Tables that have a Sequelize model. The question-set tables have none. */
const MODELS: Record<string, any> = {
  cohort_memberships: CohortMembership,
  internship_applications: InternshipApplication,
  internship_status_events: InternshipStatusEvent,
  internship_administrative_intakes: InternshipAdministrativeIntake,
  internship_card_dismissals: InternshipCardDismissal,
  internship_interview_sessions: InternshipInterviewSession,
  internship_interview_responses: InternshipInterviewResponse,
  internship_decisions: InternshipDecision,
  internship_documents: InternshipDocument,
  internship_requirement_acknowledgements: InternshipRequirementAcknowledgement,
};

interface DdlColumn { name: string; notNull: boolean; hasDefault: boolean; }

/** Parse `CREATE TABLE IF NOT EXISTS <name> ( ... )` out of the issued statements. */
function parseCreateTables(statements: string[]): Map<string, DdlColumn[]> {
  const out = new Map<string, DdlColumn[]>();

  for (const sql of statements) {
    const head = /CREATE TABLE IF NOT EXISTS\s+(\w+)\s*\(/i.exec(sql);
    if (!head) continue;

    const body = sql.slice(head.index + head[0].length, sql.lastIndexOf(')'));
    const cols: DdlColumn[] = [];

    for (const rawLine of body.split('\n')) {
      const line = rawLine.trim().replace(/,$/, '');
      if (!line || line.startsWith('--')) continue;

      const m = /^(\w+)\s+(.+)$/.exec(line);
      if (!m) continue;
      const [, name, rest] = m;
      if (/^(PRIMARY|FOREIGN|UNIQUE|CONSTRAINT|CHECK)$/i.test(name)) continue;

      cols.push({
        name,
        notNull: /\bNOT NULL\b/i.test(rest),
        hasDefault: /\bDEFAULT\b/i.test(rest),
      });
    }
    out.set(head[1], cols);
  }
  return out;
}

let ddl: Map<string, DdlColumn[]>;

beforeAll(async () => {
  jest.spyOn(console, 'warn').mockImplementation(() => {});
  mockQuery.mockImplementation(async (sql: string) => {
    if (/pg_indexes/.test(sql)) return [[]];
    return [[]];
  });
  await ensureInternshipSchema();
  const issued = mockQuery.mock.calls.map((c) => String(c[0]));
  ddl = parseCreateTables(issued);
});

afterAll(() => jest.restoreAllMocks());

describe('the DDL and the models agree', () => {
  it('parsed every internship table out of the DDL', () => {
    for (const table of Object.keys(MODELS)) {
      expect(ddl.has(table)).toBe(true);
    }
  });

  it.each(Object.keys(MODELS))(
    '%s: no column is NOT NULL in the DDL while optional on the model',
    (table) => {
      const model = MODELS[table];
      const attrs = model.getAttributes();

      // Map model attributes by their real column name.
      const byColumn = new Map<string, any>();
      for (const key of Object.keys(attrs)) {
        byColumn.set(attrs[key].field ?? key, attrs[key]);
      }

      const mismatches: string[] = [];
      for (const col of ddl.get(table) ?? []) {
        // A DEFAULT satisfies NOT NULL without the code supplying anything.
        if (!col.notNull || col.hasDefault) continue;

        const attr = byColumn.get(col.name);
        if (!attr) continue;                       // not modelled — nothing to disagree with

        if (attr.allowNull === true) {
          mismatches.push(
            `${table}.${col.name} — DDL says NOT NULL with no default, model says allowNull: true`,
          );
        }
      }

      expect(mismatches).toEqual([]);
    },
  );

  it('specifically pins the column that broke production', () => {
    // question_set_id must stay nullable: the bank lives in code, the version of
    // record is internship_interview_responses.question_set_version, and nothing
    // ever populates internship_interview_question_sets.
    const col = (ddl.get('internship_interview_sessions') ?? [])
      .find((c) => c.name === 'question_set_id');
    expect(col).toBeDefined();
    expect(col!.notNull).toBe(false);
  });

  it('ships the repair for databases created before the fix', () => {
    // CREATE TABLE IF NOT EXISTS cannot relax an existing column, so an
    // already-deployed environment needs the ALTER to self-heal at boot.
    const issued = mockQuery.mock.calls.map((c) => String(c[0])).join('\n');
    expect(issued).toMatch(
      /ALTER TABLE internship_interview_sessions ALTER COLUMN question_set_id DROP NOT NULL/,
    );
  });
});
