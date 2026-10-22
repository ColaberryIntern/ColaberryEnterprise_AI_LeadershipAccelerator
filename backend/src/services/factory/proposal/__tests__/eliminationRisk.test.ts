/**
 * eliminationRisk — the deterministic "miss this and the bid is REJECTED" flag. It keys on the rejection
 * CONSEQUENCE (non-responsive / disqualified / material failure / pass-fail), deliberately NOT on every
 * "mandatory", so a flag means something. These pin the real rejection phrasings and prove ordinary requirements
 * are not flagged. Pure + total.
 */
import { isEliminationRisk } from '../eliminationRisk';

const risk = (text: string, section?: string) => isEliminationRisk({ text, section });

describe('isEliminationRisk — flags the rejection consequence', () => {
  it('flags explicit rejection / non-responsive / disqualification language', () => {
    expect(risk('Proposals that do not include a completed HUB Subcontracting Plan shall be rejected.')).toBe(true);
    expect(risk('A proposal that omits the cost volume will be deemed non-responsive.')).toBe(true);
    expect(risk('Offerors who are not registered in SAM.gov will be disqualified.')).toBe(true);
    expect(risk('Material failure to comply with this section is grounds for rejection.')).toBe(true);
    expect(risk('Late submissions will not be considered.')).toBe(true);
    expect(risk('This factor is evaluated on a pass/fail basis.')).toBe(true);
  });
  it('flags a "failure to <do> ... rejection" sentence (consequence within range)', () => {
    expect(risk('Failure to submit the required insurance certificate may result in rejection of the proposal.')).toBe(true);
  });
  it('uses the SECTION heading as a signal', () => {
    expect(risk('Complete as directed.', 'Mandatory Pass/Fail Requirements')).toBe(true);
  });

  it('does NOT flag an ordinary requirement (so the flag stays meaningful)', () => {
    expect(risk('Describe your technical approach and methodology.')).toBe(false);
    expect(risk('Provide three references for similar contracts.')).toBe(false);
    expect(risk('Submit a signed cover letter with the proposal.')).toBe(false);
    // "mandatory" alone (no rejection consequence) is intentionally NOT flagged — too noisy to be useful.
    expect(risk('A mandatory pre-bid conference is scheduled for October 23.')).toBe(false);
  });

  it('is total — garbage in yields false, never throws', () => {
    expect(isEliminationRisk({})).toBe(false);
    expect(isEliminationRisk({ text: null, section: null })).toBe(false);
    expect(isEliminationRisk(undefined as any)).toBe(false);
  });
});
