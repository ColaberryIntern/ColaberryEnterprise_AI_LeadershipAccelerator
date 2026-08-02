import { DiagnosticAttempt } from '../../../models';
import { startDiagnostic, submitDiagnosticAttempt, CapeDiagnosticError } from '../capeDiagnosticService';
import { getDiagnosticItems } from '../../../constants/diagnosticItemBank';

jest.mock('../../../models', () => ({ DiagnosticAttempt: { findOrCreate: jest.fn() } }));

const mockFindOrCreate = DiagnosticAttempt.findOrCreate as unknown as jest.Mock;

const DENYLIST = ['fail', 'wrong', 'bad', 'you failed', 'incorrect', 'shame'];

function correctAnswersFor(skillId: string) {
  return getDiagnosticItems(skillId).map((item) => ({ item_id: item.id, selected_option: item.correct_option }));
}
function wrongAnswersFor(skillId: string) {
  return getDiagnosticItems(skillId).map((item) => ({ item_id: item.id, selected_option: 'not-a-real-option' }));
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe('startDiagnostic', () => {
  it('happy path: returns an attempt_id and items WITHOUT the correct_option leaked', () => {
    const result = startDiagnostic('agents_mcp');
    expect(result.attempt_id).toBeTruthy();
    expect(result.items.length).toBeGreaterThan(0);
    for (const item of result.items) {
      expect((item as any).correct_option).toBeUndefined();
    }
  });

  it('failure/boundary: rejects an unknown skill_id before returning anything', () => {
    expect(() => startDiagnostic('not_a_real_skill')).toThrow(CapeDiagnosticError);
  });

  it('trigger defaults to diagnostic_prompt but accepts test_out', () => {
    expect(startDiagnostic('rag').trigger).toBe('diagnostic_prompt');
    expect(startDiagnostic('rag', 'test_out').trigger).toBe('test_out');
  });
});

describe('submitDiagnosticAttempt', () => {
  beforeEach(() => {
    mockFindOrCreate.mockImplementation(async ({ defaults }: any) => [{ ...defaults }, true]);
  });

  it('happy path: all-correct answers -> confirmed', async () => {
    const result = await submitDiagnosticAttempt('e1', 'agents_mcp', 'att-1', correctAnswersFor('agents_mcp'));
    expect(result.outcome).toBe('confirmed');
    expect(result.bridge_recommended).toBe(false);
  });

  it('happy path: all-wrong answers -> not_confirmed, with no shaming/penalty language anywhere', async () => {
    const result = await submitDiagnosticAttempt('e1', 'agents_mcp', 'att-2', wrongAnswersFor('agents_mcp'));
    expect(result.outcome).toBe('not_confirmed');
    const serialized = JSON.stringify(result).toLowerCase();
    for (const bad of DENYLIST) {
      expect(serialized).not.toContain(bad);
    }
  });

  it('boundary: exactly one correct out of two -> partial, with bridge_recommended true', async () => {
    const items = getDiagnosticItems('rag');
    const answers = [
      { item_id: items[0].id, selected_option: items[0].correct_option },
      { item_id: items[1].id, selected_option: 'not-a-real-option' },
    ];
    const result = await submitDiagnosticAttempt('e1', 'rag', 'att-3', answers);
    expect(result.outcome).toBe('partial');
    expect(result.bridge_recommended).toBe(true);
  });

  it('idempotency: submitting the SAME attempt_id twice returns the identical stored outcome and inserts exactly once', async () => {
    const stored = { outcome: 'confirmed' };
    mockFindOrCreate.mockResolvedValueOnce([stored, true]).mockResolvedValueOnce([stored, false]);

    const first = await submitDiagnosticAttempt('e1', 'agents_mcp', 'att-4', correctAnswersFor('agents_mcp'));
    const second = await submitDiagnosticAttempt('e1', 'agents_mcp', 'att-4', wrongAnswersFor('agents_mcp')); // different answers on retry — ignored

    expect(first.outcome).toBe('confirmed');
    expect(second.outcome).toBe('confirmed'); // first submission is authoritative
    expect(mockFindOrCreate).toHaveBeenCalledTimes(2);
    expect(mockFindOrCreate.mock.calls[0][0].where.idempotency_key).toBe('diagnostic:att-4:agents_mcp');
    expect(mockFindOrCreate.mock.calls[1][0].where.idempotency_key).toBe('diagnostic:att-4:agents_mcp');
  });

  it('boundary: an unknown skill_id is rejected before touching the DB', async () => {
    await expect(submitDiagnosticAttempt('e1', 'not_a_real_skill', 'att-5', []))
      .rejects.toThrow(CapeDiagnosticError);
    expect(mockFindOrCreate).not.toHaveBeenCalled();
  });

  it('trigger metadata: test_out and diagnostic_prompt score identically for identical answers (same code path)', async () => {
    const answers = correctAnswersFor('governance');
    const a = await submitDiagnosticAttempt('e1', 'governance', 'att-6', answers, 'diagnostic_prompt');
    const b = await submitDiagnosticAttempt('e1', 'governance', 'att-7', answers, 'test_out');
    expect(a.outcome).toBe(b.outcome);
    expect(mockFindOrCreate.mock.calls[0][0].defaults.trigger).toBe('diagnostic_prompt');
    expect(mockFindOrCreate.mock.calls[1][0].defaults.trigger).toBe('test_out');
  });
});
