import { describeBlastRadius, describeReversibility, describeExpectedResult } from '../proposedActionInspectorFields';

describe('describeBlastRadius', () => {
  it('happy path: scheduled_emails is always exactly 1 recipient', () => {
    expect(describeBlastRadius('scheduled_emails')).toBe('1 recipient');
  });

  it('happy path: proposed_agent_actions is self-referential, no downstream effect', () => {
    expect(describeBlastRadius('proposed_agent_actions')).toBe('No downstream effect (nothing executes automatically on approval)');
  });

  it('honesty boundary: an unrecognized target_table gets the honest fallback, never a guess', () => {
    expect(describeBlastRadius('some_future_table')).toBe('Not known for this proposal type');
  });
});

describe('describeReversibility', () => {
  // ScheduledEmail's real 6-value status set (ScheduledEmail.ts:134-139).
  // paused only ever transitions FROM pending (campaignService.ts's
  // pauseCampaign()) — must read as reversible, same as pending.
  it("scheduled_emails + pending: reversible", () => {
    expect(describeReversibility('scheduled_emails', 'pending')).toBe('Reversible — this email has not sent yet');
  });

  it("scheduled_emails + paused: reversible — same real guarantee as pending", () => {
    expect(describeReversibility('scheduled_emails', 'paused')).toBe('Reversible — this email has not sent yet');
  });

  it("scheduled_emails + processing: its own distinct label, never conflated with 'already sent'", () => {
    expect(describeReversibility('scheduled_emails', 'processing')).toBe('Not reversible — this email is actively being sent right now');
  });

  it("scheduled_emails + sent: outcome already decided", () => {
    expect(describeReversibility('scheduled_emails', 'sent')).toBe("Not reversible — this email's outcome is already decided (sent, failed to send, or cancelled)");
  });

  it("scheduled_emails + failed: outcome already decided", () => {
    expect(describeReversibility('scheduled_emails', 'failed')).toBe("Not reversible — this email's outcome is already decided (sent, failed to send, or cancelled)");
  });

  it("scheduled_emails + cancelled: outcome already decided", () => {
    expect(describeReversibility('scheduled_emails', 'cancelled')).toBe("Not reversible — this email's outcome is already decided (sent, failed to send, or cancelled)");
  });

  it('honesty boundary: a null targetStatus (target row not found) never assumed reversible or not', () => {
    expect(describeReversibility('scheduled_emails', null)).toBe('Not known for this proposal type');
  });

  it('proposed_agent_actions: nothing to reverse, real and honest, independent of targetStatus', () => {
    expect(describeReversibility('proposed_agent_actions', null)).toBe("N/A — nothing to reverse; approving only changes this proposal's own status.");
  });

  it('honesty boundary: an unrecognized target_table gets the honest fallback, never a guess', () => {
    expect(describeReversibility('some_future_table', 'pending')).toBe('Not known for this proposal type');
  });
});

describe('describeExpectedResult', () => {
  it('subject_rewrite: real before/after restated verbatim', () => {
    expect(describeExpectedResult('subject_rewrite', { subject: 'New subject' }, { subject: 'Old subject' }))
      .toBe("Subject changes from 'Old subject' to 'New subject'.");
  });

  it('body_rewrite: real before/after restated verbatim', () => {
    expect(describeExpectedResult('body_rewrite', { body: 'New body' }, { body: 'Old body' }))
      .toBe("Body changes from 'Old body' to 'New body'.");
  });

  it('propose_instruction_enhancement: real ai_instructions restated verbatim', () => {
    expect(describeExpectedResult('propose_instruction_enhancement', { ai_instructions: 'Be more concise.' }, {}))
      .toBe("Proposed instruction: 'Be more concise.'.");
  });

  it('propose_content_idea: real content_idea restated verbatim', () => {
    expect(describeExpectedResult('propose_content_idea', { content_idea: 'Headline: AI that ships.' }, {}))
      .toBe("Proposed content idea: 'Headline: AI that ships.'.");
  });

  it('honesty boundary: a missing field substitutes an honest placeholder, never a blank interpolation', () => {
    expect(describeExpectedResult('subject_rewrite', {}, {})).toBe("Subject changes from '(not recorded)' to '(not recorded)'.");
  });

  it('honesty boundary: an unrecognized action_type gets the honest fallback, never a fabricated guess', () => {
    expect(describeExpectedResult('some_future_action', {}, {})).toBe('No structured summary available for this proposal type.');
  });
});
