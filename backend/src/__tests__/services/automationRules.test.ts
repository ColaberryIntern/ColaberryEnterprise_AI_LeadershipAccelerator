/**
 * automationRulesService tests — focus on the escalate action and the
 * overdue condition matchers added for the Launch Readiness escalation rules.
 *
 * The engine is pure SQL orchestration, so we mock the database and assert on
 * (a) the SQL emitted per action, (b) idempotency guards, and (c) the run
 * bookkeeping (rules_fired, fire stats update).
 */
import { sequelize } from '../../config/database';
import {
  runAutomationRules,
  seedDefaultAutomationRules,
} from '../../services/ops/automationRulesService';

jest.mock('../../config/database', () => ({
  sequelize: { query: jest.fn() },
}));

const mockQuery = sequelize.query as jest.Mock;

describe('automationRulesService — escalate action', () => {
  beforeEach(() => jest.clearAllMocks());

  it('emits an idempotent INSERT into ops_approval_queue for an overdue+urgency escalate rule', async () => {
    const rule = {
      id: 'rule-esc-1',
      name: 'Escalate — overdue + red urgency (≥70)',
      condition_jsonb: { overdue: true, urgency_gte: 70 },
      action_jsonb: { do: 'escalate' },
    };
    mockQuery
      .mockResolvedValueOnce([rule]) // SELECT active rules
      .mockResolvedValueOnce([null, { rowCount: 3 }]) // INSERT ... escalate
      .mockResolvedValueOnce([null, { rowCount: 1 }]); // UPDATE fire stats

    const result = await runAutomationRules();

    expect(result.rules_evaluated).toBe(1);
    expect(result.rules_fired).toBe(1);
    expect(result.fire_results[0]).toMatchObject({
      rule_id: 'rule-esc-1',
      rows_affected: 3,
    });

    const insertSql = mockQuery.mock.calls[1][0] as string;
    expect(insertSql).toContain('INSERT INTO ops_approval_queue');
    expect(insertSql).toContain(`'escalate'`);
    // Condition matchers compiled into the WHERE.
    expect(insertSql).toContain(`status = 'active'`);
    expect(insertSql).toContain('urgency_score >= :cond_urgency');
    expect(insertSql).toContain('due_on < CURRENT_DATE');
    // Idempotency: never open a second escalation for the same todo.
    expect(insertSql).toContain('NOT EXISTS');
    expect(insertSql).toContain('q.decided_at IS NULL');
    expect(insertSql).toContain('is_dismissed = FALSE');

    const insertReplacements = mockQuery.mock.calls[1][1].replacements;
    expect(insertReplacements.cond_urgency).toBe(70);
    expect(insertReplacements.esc_rule).toBe(rule.name);
  });

  it('compiles overdue_days_gt into a parameterized interval comparison', async () => {
    const rule = {
      id: 'rule-esc-2',
      name: 'Escalate — overdue > 7 days',
      condition_jsonb: { overdue_days_gt: 7 },
      action_jsonb: { do: 'escalate' },
    };
    mockQuery
      .mockResolvedValueOnce([rule])
      .mockResolvedValueOnce([null, { rowCount: 0 }]); // 0 rows -> no fire-stats UPDATE

    const result = await runAutomationRules();

    const insertSql = mockQuery.mock.calls[1][0] as string;
    expect(insertSql).toContain(`(CURRENT_DATE - (:cond_overdue || ' days')::interval)`);
    expect(mockQuery.mock.calls[1][1].replacements.cond_overdue).toBe('7');
    // rows_affected = 0 means the rule did not fire and we skip the stats UPDATE.
    expect(result.rules_fired).toBe(0);
    expect(mockQuery).toHaveBeenCalledTimes(2);
  });

  it('records an error on the fire result without aborting the run when the INSERT throws', async () => {
    const rule = {
      id: 'rule-esc-3',
      name: 'Escalate — overdue > 7 days',
      condition_jsonb: { overdue_days_gt: 7 },
      action_jsonb: { do: 'escalate' },
    };
    mockQuery
      .mockResolvedValueOnce([rule])
      .mockRejectedValueOnce(new Error('insert blew up'));

    const result = await runAutomationRules();

    expect(result.fire_results[0]).toMatchObject({
      rule_id: 'rule-esc-3',
      rows_affected: 0,
      error: 'insert blew up',
    });
    expect(result.rules_fired).toBe(0);
  });

  it('still supports the pre-existing flag_for_archive action (regression)', async () => {
    const rule = {
      id: 'rule-arch-1',
      name: 'Flag for archive — no BC activity > 180d',
      condition_jsonb: { stale_days_gt: 180 },
      action_jsonb: { do: 'flag_for_archive' },
    };
    mockQuery
      .mockResolvedValueOnce([rule])
      .mockResolvedValueOnce([null, { rowCount: 5 }])
      .mockResolvedValueOnce([null, { rowCount: 1 }]);

    const result = await runAutomationRules();

    const sql = mockQuery.mock.calls[1][0] as string;
    expect(sql).toContain('UPDATE ops_bc_todos');
    expect(sql).toContain('archive_suggested');
    expect(result.fire_results[0].rows_affected).toBe(5);
  });
});

describe('seedDefaultAutomationRules', () => {
  beforeEach(() => jest.clearAllMocks());

  it('idempotently seeds the two escalation rules among the defaults', async () => {
    mockQuery.mockResolvedValue([null, { rowCount: 1 }]);

    await seedDefaultAutomationRules();

    const seededNames = mockQuery.mock.calls.map((c) => c[1].replacements.name);
    expect(seededNames).toContain('Escalate — overdue + red urgency (≥70)');
    expect(seededNames).toContain('Escalate — overdue > 7 days');

    // Every seed insert guards on NOT EXISTS so re-running never duplicates.
    for (const call of mockQuery.mock.calls) {
      expect(call[0]).toContain('WHERE NOT EXISTS');
    }
  });
});
