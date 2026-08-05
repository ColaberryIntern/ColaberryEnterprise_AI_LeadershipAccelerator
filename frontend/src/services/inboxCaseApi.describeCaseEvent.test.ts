import { describeCaseEvent, InboxCaseEventRecord, InboxCaseItemRecord, InboxCaseActionRecord } from './inboxCaseApi';

// Pure-function coverage for the Activity-feed enrichment fix (loop-architect
// run 20260801-0200-inbox-cos-activity-and-errors): the events themselves are
// already scoped correctly to their case, but the plain label alone reads
// identically across different cases going through the same lifecycle. This
// proves two events of the SAME type but referencing DIFFERENT items/actions
// now produce genuinely different strings.

const baseEvent = (over: Partial<InboxCaseEventRecord> = {}): InboxCaseEventRecord => ({
  id: 'evt-1', case_id: 'case-1', item_id: null, action_id: null,
  event_type: 'assessment_completed', actor_type: 'ai', actor_id: 'case_assessment_service',
  previous_state: null, new_state: null, details: {}, correlation_id: 'corr-1',
  created_at: '2026-08-01T00:00:00Z', ...over,
});

const item = (over: Partial<InboxCaseItemRecord> = {}): InboxCaseItemRecord => ({
  id: 'item-1', case_id: 'case-1', source_type: 'email', source_id: 'msg-1', provider: 'gmail_colaberry',
  source_url: null, title: 'Untitled item', occurred_at: '2026-08-01T00:00:00Z', match_score: 0.9,
  match_reasons: [], inclusion_status: 'INCLUDED', disposition: null, disposition_reason: null,
  snapshot: {}, ai_recommendation: null, ai_recommendation_reason: null, ...over,
});

const action = (over: Partial<InboxCaseActionRecord> = {}): InboxCaseActionRecord => ({
  id: 'action-1', case_id: 'case-1', item_id: 'item-1', action_type: 'EMAIL_ARCHIVE', target_source: 'gmail_colaberry',
  target_id: 'msg-1', preview: 'Archive the email', payload: {}, risk_level: 'LOW', requires_individual_approval: false,
  status: 'PROPOSED', depends_on_action_ids: [], error_class: null, error_message: null, ...over,
});

describe('describeCaseEvent', () => {
  it('produces DIFFERENT text for two action_approved events referencing different actions (the exact "same activity list in all of them" complaint)', () => {
    const archiveAction = action({ id: 'a1', action_type: 'EMAIL_ARCHIVE' });
    const basecampAction = action({ id: 'a2', action_type: 'BASECAMP_COMMENT', item_id: 'item-2' });
    const item2 = item({ id: 'item-2', title: 'Second item' });

    const eventA = baseEvent({ event_type: 'action_approved', action_id: 'a1', item_id: 'item-1' });
    const eventB = baseEvent({ event_type: 'action_approved', action_id: 'a2', item_id: 'item-2' });

    const textA = describeCaseEvent(eventA, [item(), item2], [archiveAction, basecampAction]);
    const textB = describeCaseEvent(eventB, [item(), item2], [archiveAction, basecampAction]);

    expect(textA).not.toBe(textB);
    expect(textA).toContain('EMAIL_ARCHIVE');
    expect(textB).toContain('BASECAMP_COMMENT');
  });

  it('includes the item title for candidate_included/excluded events', () => {
    const event = baseEvent({ event_type: 'candidate_included', item_id: 'item-1' });
    const text = describeCaseEvent(event, [item({ title: 'Re: budget approval' })], []);
    expect(text).toContain('Re: budget approval');
  });

  it('includes the rejection reason for action_rejected events', () => {
    const event = baseEvent({ event_type: 'action_rejected', action_id: 'action-1', item_id: 'item-1', details: { reason: 'Not needed anymore' } });
    const text = describeCaseEvent(event, [item()], [action()]);
    expect(text).toContain('Not needed anymore');
  });

  it('includes mode and query for case_discovery_started', () => {
    const event = baseEvent({ event_type: 'case_discovery_started', details: { mode: 'PERSON', query: 'Kes' } });
    const text = describeCaseEvent(event, [], []);
    expect(text).toContain('person');
    expect(text).toContain('Kes');
  });

  it('includes the instruction text and failure reason for action_override_failed', () => {
    const event = baseEvent({ event_type: 'action_override_failed', details: { instruction: 'Just archive it', reason: 'schema validation failed' } });
    const text = describeCaseEvent(event, [], []);
    expect(text).toContain('Just archive it');
    expect(text).toContain('schema validation failed');
  });

  it('falls back to the generic label without throwing when the referenced action/item cannot be found', () => {
    const event = baseEvent({ event_type: 'action_approved', action_id: 'missing-action', item_id: 'missing-item' });
    expect(() => describeCaseEvent(event, [], [])).not.toThrow();
    expect(describeCaseEvent(event, [], [])).toBe('An action was approved');
  });

  it('falls back to the generic label for event types with no item/action linkage', () => {
    const event = baseEvent({ event_type: 'case_resolved' });
    expect(describeCaseEvent(event, [item()], [action()])).toBe('Case closed');
  });
});
