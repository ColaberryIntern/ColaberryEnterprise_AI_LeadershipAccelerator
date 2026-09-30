import { checkRequirements, requirementTally } from '../internshipRequirementChecks';

// checkRequirements takes a plain Map, so no database is touched. Rows are shaped
// like InternshipInterviewResponse but only the fields the checker reads are set.
function row(question_key: string, value: unknown, state = 'answered'): any {
  return { question_key, answer_value: value, answer_text: typeof value === 'string' ? value : null, state };
}
function mapOf(...rows: any[]): Map<string, any> {
  return new Map(rows.map((r) => [r.question_key, r]));
}

const byKey = (checks: ReturnType<typeof checkRequirements>) =>
  Object.fromEntries(checks.map((c) => [c.key, c.status]));

describe('checkRequirements', () => {
  it('marks a full-time applicant as not meeting the employment requirement', () => {
    const checks = checkRequirements(mapOf(row('employment_status', 'full_time')));
    expect(byKey(checks).not_employed_fulltime).toBe('not_met');
  });

  it('treats part-time, contract and not_employed as meeting it', () => {
    for (const v of ['part_time', 'contract', 'not_employed']) {
      const checks = checkRequirements(mapOf(row('employment_status', v)));
      expect(byKey(checks).not_employed_fulltime).toBe('met');
    }
  });

  it('reads a yes/no requirement as met on yes and not_met on no', () => {
    expect(byKey(checkRequirements(mapOf(row('weekly_hours_commitment', true)))).weekly_hours).toBe('met');
    expect(byKey(checkRequirements(mapOf(row('weekly_hours_commitment', false)))).weekly_hours).toBe('not_met');
  });

  it('tolerates a transcribed yes/no stored as text', () => {
    expect(byKey(checkRequirements(mapOf(row('can_attend_meetings', 'Yes')))).attend_meetings).toBe('met');
    expect(byKey(checkRequirements(mapOf(row('can_attend_meetings', 'no')))).attend_meetings).toBe('not_met');
  });

  it('is unclear when a requirement was skipped or never asked', () => {
    expect(byKey(checkRequirements(mapOf(row('weekly_hours_commitment', null, 'skipped')))).weekly_hours).toBe('unclear');
    expect(byKey(checkRequirements(new Map())).weekly_hours).toBe('unclear');
  });

  it('quotes the applicant answer as evidence', () => {
    const checks = checkRequirements(mapOf(row('weekly_hours_commitment', true)));
    const hours = checks.find((c) => c.key === 'weekly_hours');
    expect(hours?.evidence).toBe('Yes');
  });

  it('tallies met / not_met / unclear across all requirements', () => {
    const checks = checkRequirements(mapOf(
      row('employment_status', 'not_employed'),
      row('weekly_hours_commitment', true),
      row('can_attend_meetings', false),
    ));
    const t = requirementTally(checks);
    expect(t.total).toBe(checks.length);
    expect(t.met).toBeGreaterThanOrEqual(2);
    expect(t.not_met).toBeGreaterThanOrEqual(1);
    expect(t.met + t.not_met + t.unclear).toBe(t.total);
  });
});
