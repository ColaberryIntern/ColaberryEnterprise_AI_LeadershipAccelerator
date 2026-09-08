const mockChecklistCreate = jest.fn();
jest.mock('../../../models/ChecklistInstance', () => ({
  __esModule: true,
  default: { create: (...a: any[]) => mockChecklistCreate(...a) },
}));

import { deriveClosureChecklistItems, createClosureChecklistInstance } from '../closureChecklist';

beforeEach(() => {
  jest.clearAllMocks();
  mockChecklistCreate.mockImplementation(async (attrs: any) => ({ id: 'checklist-1', ...attrs }));
});

function baseInput(overrides: Partial<Parameters<typeof deriveClosureChecklistItems>[0]> = {}) {
  return {
    goal: 'Confirm the student is unblocked and re-engaged with the curriculum within 7 days.',
    createdAt: new Date('2026-08-01T00:00:00Z'),
    resolvedAt: new Date('2026-08-05T00:00:00Z'),
    ...overrides,
  };
}

describe('deriveClosureChecklistItems', () => {
  it('happy path: a real resolution with a real goal and valid time span completes every required item', () => {
    const items = deriveClosureChecklistItems(baseInput());

    expect(items).toEqual({
      verify_reply_or_signal_change: true,
      verify_agreed_next_step: true,
      record_intervention_outcome: true,
      record_time_to_resolution: true,
      record_escalation_required: true,
      propose_lesson_learned_if_supported: false,
      close_on_success_criteria: true,
    });
  });

  it('honesty gap: propose_lesson_learned_if_supported is ALWAYS false — no lessons-learned mechanism exists today, and this must never be fabricated as true', () => {
    const items = deriveClosureChecklistItems(baseInput());
    expect(items.propose_lesson_learned_if_supported).toBe(false);
  });

  it('boundary: an empty goal fails verify_agreed_next_step', () => {
    const items = deriveClosureChecklistItems(baseInput({ goal: '' }));
    expect(items.verify_agreed_next_step).toBe(false);
  });

  it('boundary: a resolvedAt before createdAt (negative duration) fails record_time_to_resolution', () => {
    const items = deriveClosureChecklistItems(baseInput({
      createdAt: new Date('2026-08-05T00:00:00Z'),
      resolvedAt: new Date('2026-08-01T00:00:00Z'),
    }));
    expect(items.record_time_to_resolution).toBe(false);
  });

  it('boundary: resolvedAt equal to createdAt (zero duration) still passes — an instant resolution is not a defect', () => {
    const sameInstant = new Date('2026-08-01T00:00:00Z');
    const items = deriveClosureChecklistItems(baseInput({ createdAt: sameInstant, resolvedAt: sameInstant }));
    expect(items.record_time_to_resolution).toBe(true);
  });
});

describe('createClosureChecklistInstance', () => {
  it('persists checklist_type/subject_type/subject_id keyed on the real ticket id, plus the derived items and completion state', async () => {
    await createClosureChecklistInstance(
      'ticket-1',
      'Confirm the student is unblocked and re-engaged with the curriculum within 7 days.',
      new Date('2026-08-01T00:00:00Z'),
      new Date('2026-08-05T00:00:00Z'),
    );

    expect(mockChecklistCreate).toHaveBeenCalledWith(expect.objectContaining({
      checklist_type: 'closure',
      subject_type: 'reese_outreach_ticket',
      subject_id: 'ticket-1',
      complete: true,
      incomplete_items: ['propose_lesson_learned_if_supported'],
    }));
  });

  it('a genuinely missing required field (empty goal) is reflected in complete:false', async () => {
    await createClosureChecklistInstance('ticket-2', '', new Date('2026-08-01T00:00:00Z'), new Date('2026-08-05T00:00:00Z'));

    const call = mockChecklistCreate.mock.calls[0][0];
    expect(call.complete).toBe(false);
    expect(call.incomplete_items).toContain('verify_agreed_next_step');
  });
});
