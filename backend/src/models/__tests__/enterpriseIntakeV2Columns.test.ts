import EnterpriseIntake from '../EnterpriseIntake';

/**
 * Intake v2 (2026-11-21): the columns the schedule, uploads, reminder and Ali's brief rely on.
 * addMissingColumns adds them at boot from these attributes, so a missing attribute here is a
 * column production never gets.
 */
const V2: Array<[string, boolean, unknown]> = [
  ['interview_mode', true, undefined],
  ['interview_via_pref', true, undefined],
  ['interview_scheduled_for', true, undefined],
  ['interview_reminder_sent_at', true, undefined],
  ['interview_reminder_attempts', false, 0],
  ['meeting_start', true, undefined],
  ['meeting_end', true, undefined],
  ['meeting_event_id', true, undefined],
  ['meeting_link', true, undefined],
  ['meeting_booking_at', true, undefined],
  ['bc_meeting_posted_at', true, undefined],
  ['bc_meeting_attempts', false, 0],
  ['client_files', true, undefined],
  ['client_research', true, undefined],
  ['ali_brief_claimed_at', true, undefined],
  ['ali_brief_sent_at', true, undefined],
  ['ali_brief_attempts', false, 0],
  ['demo_claimed_at', true, undefined],
  ['demo_attempted_at', true, undefined],
  ['demo_started_at', true, undefined],
  ['demo_attempts', false, 0],
  ['demo_failures', false, 0],
  ['demo_reason', true, undefined],
  ['demo_error', true, undefined],
];

describe('EnterpriseIntake v2 columns', () => {
  const attrs = EnterpriseIntake.getAttributes() as Record<string, { allowNull?: boolean; defaultValue?: unknown; field?: string }>;

  it.each(V2)('%s is declared (nullable %s, default %s)', (name, nullable, def) => {
    expect(attrs[name]).toBeDefined();
    expect(attrs[name].allowNull).toBe(nullable);
    expect(attrs[name].defaultValue).toBe(def);
  });

  it('keeps every earlier column (additive only)', () => {
    for (const k of ['process', 'researched_at', 'bc_todolist_id', 'signed_at', 'transcript']) expect(attrs[k]).toBeDefined();
  });
});
