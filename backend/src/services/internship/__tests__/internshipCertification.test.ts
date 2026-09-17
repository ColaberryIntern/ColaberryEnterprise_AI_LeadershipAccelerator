import { summarizeOfficialClaim } from '../internshipCertification';

// Sequelize returns Date objects for the DATE columns (submitted_at / reviewed_at)
// and a 'YYYY-MM-DD' string for the DATEONLY column (passed_on) — mirror that here.
describe('summarizeOfficialClaim', () => {
  it('returns "none" when the student has claimed nothing', () => {
    expect(summarizeOfficialClaim([])).toEqual({
      status: 'none', passed_on: null, submitted_at: null, reviewed_at: null,
    });
  });

  it('prefers an approved claim over a more recent pending one', () => {
    const out = summarizeOfficialClaim([
      { status: 'approved', passed_on: '2026-08-01', submitted_at: new Date('2026-07-01T00:00:00Z'), reviewed_at: new Date('2026-07-05T00:00:00Z') },
      { status: 'pending', passed_on: null, submitted_at: new Date('2026-09-01T00:00:00Z'), reviewed_at: null },
    ]);
    expect(out.status).toBe('approved');
    expect(out.passed_on).toBe('2026-08-01');
    expect(out.reviewed_at).toBe('2026-07-05T00:00:00.000Z');
  });

  it('falls back to the most recently submitted when none is approved', () => {
    const out = summarizeOfficialClaim([
      { status: 'rejected', passed_on: null, submitted_at: new Date('2026-07-01T00:00:00Z'), reviewed_at: new Date('2026-07-02T00:00:00Z') },
      { status: 'pending', passed_on: null, submitted_at: new Date('2026-09-01T00:00:00Z'), reviewed_at: null },
    ]);
    expect(out.status).toBe('pending');
    expect(out.submitted_at).toBe('2026-09-01T00:00:00.000Z');
  });

  it('normalizes Date objects to ISO strings and passes null through', () => {
    const out = summarizeOfficialClaim([
      { status: 'approved', passed_on: '2026-08-01', submitted_at: new Date('2026-07-01T00:00:00Z'), reviewed_at: new Date('2026-07-05T00:00:00Z') },
    ]);
    expect(out.submitted_at).toBe('2026-07-01T00:00:00.000Z');
    expect(out.reviewed_at).toBe('2026-07-05T00:00:00.000Z');
    expect(out.passed_on).toBe('2026-08-01');
  });
});
