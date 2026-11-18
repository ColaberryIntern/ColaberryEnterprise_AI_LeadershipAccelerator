jest.mock('../../config/database', () => ({ sequelize: { query: jest.fn(), transaction: jest.fn() } }));
// eslint-disable-next-line import/first
import { sequelize } from '../../config/database';
// eslint-disable-next-line import/first
import {
  OLD_NAME_PATTERN, PROGRAM_RENAME_MAP, RENAME_TARGETS, columnStatements, ensureProgramRenameFdae,
  hasOldProgramName, renameProgramText, replaceExpression,
} from '../ensureProgramRenameFdae';

/**
 * The program rename runs against production rows at boot. These tests pin what makes that safe:
 * the text transform is right and idempotent, only forward-facing content is touched, every change
 * is backed up first, and a failure never escapes into boot.
 */
const q = sequelize.query as unknown as jest.Mock;
const tx = sequelize.transaction as unknown as jest.Mock;

describe('renameProgramText', () => {
  it.each([
    ['Welcome to the AI Systems Architect Accelerator.', 'Welcome to the Forward Deployed AI Engineer Accelerator.'],
    ['what an AI Systems Architect builds', 'what a Forward Deployed AI Engineer builds'],
    ['An AI systems architect ships', 'A forward deployed AI engineer ships'],
    ['becoming AI Systems Architects', 'becoming Forward Deployed AI Engineers'],
    ['Managing Director / AI Systems Architect', 'Managing Director / Forward Deployed AI Engineer'],
    ['AI SYSTEMS ARCHITECT', 'FORWARD DEPLOYED AI ENGINEER'],
    ['AI Architect Readiness Score', 'Forward Deployed AI Engineer Readiness Score'],
  ])('%s', (input, expected) => {
    expect(renameProgramText(input)).toBe(expected);
  });

  it('leaves identifiers, the curriculum topic and the Anthropic certification alone', () => {
    const keep = '/ai-architect ai-systems-architect-training-system systems_architecture Systems Architecture Claude Certified Architect';
    expect(renameProgramText(keep)).toBe(keep);
  });

  it('never touches a longer word: Architecture, Architected, Architecting stay as they are', () => {
    for (const t of ['Design AI Systems Architecture', 'AI systems architecture', 'AI SYSTEMS ARCHITECTURE',
      'an AI Systems Architecture', 'AI Systems Architected', 'AI Systems Architecting', 'AI Architect Acceleratorx', 'XAI Systems Architect']) {
      expect(renameProgramText(t)).toBe(t);
      expect(hasOldProgramName(t)).toBe(false);
    }
  });

  it('does not match mixed casings it would not rewrite (so no row is re-renamed every boot)', () => {
    for (const t of ['AI Systems architect', 'AI systems Architect', 'AI SYSTEMS Architect']) {
      expect(hasOldProgramName(t)).toBe(false);
      expect(renameProgramText(t)).toBe(t);
    }
  });

  it('matches a name wrapped across lines, and punctuation after it', () => {
    expect(renameProgramText('in an AI Systems\nArchitect programme')).toBe('in a Forward Deployed AI Engineer programme');
    expect(renameProgramText('(AI Systems Architect), AI Systems Architect.')).toBe('(Forward Deployed AI Engineer), Forward Deployed AI Engineer.');
  });

  it('is idempotent and its output never matches the old-name guard', () => {
    for (const [from] of PROGRAM_RENAME_MAP) {
      const once = renameProgramText(`x ${from} y`);
      expect(renameProgramText(once)).toBe(once);
      expect(hasOldProgramName(once)).toBe(false);
      expect(hasOldProgramName(from)).toBe(true);
    }
  });

  it('the SQL expression applies the same map in the same order', () => {
    const expr = replaceExpression('c');
    const order = PROGRAM_RENAME_MAP.map(([from]) => expr.indexOf(`'\\m${from.split(' ').join('\\s+')}\\M'`));
    expect(order.every((i) => i >= 0)).toBe(true);
    // nested replace(): the innermost (first applied) key is written first, so offsets ascend
    expect([...order].sort((a, b) => a - b)).toEqual(order);
  });
});

describe('RENAME_TARGETS', () => {
  const tables = RENAME_TARGETS.map((t) => t.table);
  it('never touches history, other people\'s words, or case studies', () => {
    for (const t of ['communication_logs', 'inbox_emails', 'career_portfolio_pages', 'runtime_portfolio_artifacts',
      'user_curriculum_profiles', 'case_studies', 'case_study_snapshots', 'tickets', 'ops_bc_todos', 'page_events']) {
      expect(tables).not.toContain(t);
    }
  });
  it('only renames unsent mail and only Ali\'s enrollment title', () => {
    expect(RENAME_TARGETS.find((t) => t.table === 'scheduled_emails')?.where).toMatch(/NOT IN \('sent', 'cancelled', 'failed'\)/);
    expect(RENAME_TARGETS.find((t) => t.table === 'enrollments')?.where).toBe("title LIKE 'Managing Director%'");
  });
});

describe('columnStatements', () => {
  it('backs up before it updates, casts json back, and is guarded by the old-name match', () => {
    const [backup, update] = columnStatements({ table: 'timeline_cards', columns: ['metadata'] }, 'metadata', 'jsonb');
    expect(backup).toMatch(/^INSERT INTO program_rename_fdae_backup/);
    expect(update).toMatch(/^UPDATE "timeline_cards" SET "metadata" = \(regexp_replace\(/);
    expect(update).toMatch(/\)::jsonb WHERE "metadata"::text ~ /);
    expect(backup.split('WHERE')[1]).toBe(update.split('WHERE').pop());
  });
  it('rejects an unsafe identifier', () => {
    expect(() => columnStatements({ table: 'x; DROP TABLE leads', columns: ['a'] }, 'a', 'text')).toThrow(/unsafe identifier/);
  });
});

describe('ensureProgramRenameFdae', () => {
  beforeEach(() => { q.mockReset(); tx.mockReset(); });

  it('renames each present column in its own transaction and reports counts', async () => {
    q.mockImplementation(async (sql: string, opts?: { replacements?: { table: string } }) => {
      if (sql.includes('information_schema')) {
        return opts?.replacements?.table === 'program_blueprints' ? [{ column_name: 'name', data_type: 'character varying' }] : [];
      }
      if (sql.startsWith('UPDATE')) return [[], { rowCount: 1 }];
      return [[], {}];
    });
    tx.mockImplementation(async (fn: (t: unknown) => Promise<number>) => fn({}));
    const out = await ensureProgramRenameFdae();
    expect(out).toEqual([{ table: 'program_blueprints', column: 'name', rows: 1 }]);
  });

  it('never throws: a failing column is reported, not raised', async () => {
    q.mockImplementation(async (sql: string) => (sql.includes('information_schema') ? [{ column_name: 'name', data_type: 'text' }] : [[], {}]));
    tx.mockRejectedValue(new Error('boom'));
    const out = await ensureProgramRenameFdae();
    expect(out.length).toBeGreaterThan(0);
    expect(out.every((o) => o.error === 'boom' && o.rows === 0)).toBe(true);
  });

  it('skips the whole rename if the backup table cannot be created', async () => {
    q.mockRejectedValueOnce(new Error('no perms'));
    expect(await ensureProgramRenameFdae()).toEqual([]);
    expect(tx).not.toHaveBeenCalled();
  });
});
