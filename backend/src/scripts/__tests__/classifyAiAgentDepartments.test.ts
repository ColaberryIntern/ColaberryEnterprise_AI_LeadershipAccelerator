/**
 * classifyAiAgentDepartments — the reporting rule + idempotency contract.
 *
 * `summarise` is what an operator reads before deciding to run `--apply`, so
 * the distinctions it draws are the ones that matter: an agent that already
 * had a department is never touched, and a "needs review" classification is
 * called out by name rather than folded into a total.
 */
import { summarise } from '../classifyAiAgentDepartments';

type Row = Parameters<typeof summarise>[0][number];

const row = (over: Partial<Row> = {}): Row => ({
  agentId: 'a1', agentName: 'SomeAgent', category: 'admissions',
  currentDepartment: null, newDepartment: 'admissions', confidence: 'auto', reason: 'test', applied: false,
  ...over,
} as Row);

describe('summarise', () => {
  it('never counts an agent that already had a department as one "to classify"', () => {
    const out = summarise([row({ currentDepartment: 'finance' }), row({ currentDepartment: null })]);
    expect(out).toContain('already had department: 1');
    expect(out).toContain('to classify:            1');
  });

  it('splits agents to classify by confidence', () => {
    const out = summarise([
      row({ confidence: 'auto' }),
      row({ confidence: 'auto' }),
      row({ confidence: 'needs_review', newDepartment: 'reporting' }),
    ]);
    expect(out).toContain('-> auto (confident):  2');
    expect(out).toContain('-> needs review:      1');
  });

  it('names each needs-review agent with its assigned department and reason', () => {
    const out = summarise([row({ agentName: 'WorkforceIntelligence', confidence: 'needs_review', newDepartment: null, reason: 'company-wide oversight agent, not owned by a single department' })]);
    expect(out).toContain('WorkforceIntelligence');
    expect(out).toContain('company-wide oversight agent');
  });

  it('counts a genuinely unclassifiable agent (department stays null) separately from a confident classification', () => {
    const out = summarise([row({ confidence: 'needs_review', newDepartment: null, reason: 'no known mapping' })]);
    expect(out).toContain('-> unclassifiable:    1');
    expect(out).toContain('UNCLASSIFIABLE');
  });

  it('counts what was actually applied this run, distinct from what was merely classified', () => {
    const out = summarise([row({ applied: true }), row({ applied: false })]);
    expect(out).toContain('applied this run:       1');
  });

  it('reports zeros cleanly on an empty run', () => {
    const out = summarise([]);
    expect(out).toContain('agents checked:         0');
    expect(out).toContain('already had department: 0');
  });
});
