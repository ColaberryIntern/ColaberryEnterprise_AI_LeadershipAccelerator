const mockChecklistCreate = jest.fn();
jest.mock('../../../models/ChecklistInstance', () => ({
  __esModule: true,
  default: { create: (...a: any[]) => mockChecklistCreate(...a) },
}));

import { deriveOutreachChecklistItems, createOutreachChecklistInstance } from '../outreachChecklist';

beforeEach(() => {
  jest.clearAllMocks();
  mockChecklistCreate.mockImplementation(async (attrs: any) => ({ id: 'checklist-1', ...attrs }));
});

function baseInput(overrides: Partial<Parameters<typeof deriveOutreachChecklistItems>[0]> = {}) {
  return {
    signalType: 'inactivity' as const,
    goal: 'Confirm the student is unblocked and re-engaged with the curriculum within 7 days.',
    message: 'Hi! I noticed you have not been active lately — is everything okay?',
    nextFollowUpDueAt: new Date('2026-09-14T00:00:00Z'),
    ...overrides,
  };
}

describe('deriveOutreachChecklistItems', () => {
  it('happy path: a real send with a real message/goal/follow-up date completes every required item', () => {
    const items = deriveOutreachChecklistItems(baseInput());

    expect(items).toEqual({
      confirm_eligible_population: true,
      validate_evidence_reliability: false,
      check_cadence_and_cap: true,
      check_duplicate_open_intervention: true,
      confirm_authorization_before_send: true,
      state_only_supported_observations: true,
      provide_one_clear_next_step: true,
      define_success_criteria: true,
      set_follow_up_date: true,
      link_to_work_ledger: true,
    });
  });

  it('honesty gap: validate_evidence_reliability is ALWAYS false — no reliability layer is wired for these signal sources today, and this must never be fabricated as true', () => {
    const items = deriveOutreachChecklistItems(baseInput());
    expect(items.validate_evidence_reliability).toBe(false);

    const anomalyItems = deriveOutreachChecklistItems(baseInput({ signalType: 'behavior_anomaly' }));
    expect(anomalyItems.validate_evidence_reliability).toBe(false);
  });

  it('boundary: an empty message fails state_only_supported_observations', () => {
    const items = deriveOutreachChecklistItems(baseInput({ message: '' }));
    expect(items.state_only_supported_observations).toBe(false);
  });

  it('boundary: an empty goal fails both provide_one_clear_next_step and define_success_criteria', () => {
    const items = deriveOutreachChecklistItems(baseInput({ goal: '' }));
    expect(items.provide_one_clear_next_step).toBe(false);
    expect(items.define_success_criteria).toBe(false);
  });

  it('boundary: a null follow-up date fails set_follow_up_date', () => {
    const items = deriveOutreachChecklistItems(baseInput({ nextFollowUpDueAt: null }));
    expect(items.set_follow_up_date).toBe(false);
  });
});

describe('createOutreachChecklistInstance', () => {
  it('persists checklist_type/subject_type/subject_id keyed on the real ticket id, plus the derived items and completion state', async () => {
    await createOutreachChecklistInstance(
      'ticket-1', 'inactivity',
      'Confirm the student is unblocked and re-engaged with the curriculum within 7 days.',
      'A real generated message.',
      new Date('2026-09-14T00:00:00Z'),
    );

    expect(mockChecklistCreate).toHaveBeenCalledWith(expect.objectContaining({
      checklist_type: 'outreach',
      subject_type: 'reese_outreach_ticket',
      subject_id: 'ticket-1',
      complete: true,
      incomplete_items: ['validate_evidence_reliability'],
    }));
  });

  it('never reports complete:true by omitting the one honestly-incomplete non-required item from incomplete_items entirely', async () => {
    await createOutreachChecklistInstance(
      'ticket-2', 'behavior_anomaly', 'A real goal.', 'A real message.', new Date(),
    );

    const call = mockChecklistCreate.mock.calls[0][0];
    // complete:true is correct (validate_evidence_reliability is non-required),
    // but the gap must still be visible in incomplete_items for honest display.
    expect(call.complete).toBe(true);
    expect(call.incomplete_items).toContain('validate_evidence_reliability');
  });

  it('a genuinely missing required field (empty message) is reflected in complete:false', async () => {
    await createOutreachChecklistInstance('ticket-3', 'inactivity', 'A real goal.', '', new Date());

    const call = mockChecklistCreate.mock.calls[0][0];
    expect(call.complete).toBe(false);
    expect(call.incomplete_items).toContain('state_only_supported_observations');
  });
});
