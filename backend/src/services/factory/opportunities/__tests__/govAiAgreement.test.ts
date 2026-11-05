import { aiAgreement, humanCall } from '../govAiAgreement';
import { summaryNote } from '../govPursuitEmail';
import type { QualFacts, VettingFacts } from '../govDiscoveryBoard';

const v = (verdict: VettingFacts['verdict'], status = 'completed'): VettingFacts => ({ status, verdict, reason: null, quote: null, coveragePct: 60, errorClass: null, opportunity: null });
const q = (decision: string): QualFacts => ({ decision, approvalRequested: false, establishedCount: 3, zipSha: 'x', title: null, agency: null, closeDate: null });
const facts = (over: any = {}) => ({ vettings: new Map(), qualifications: new Map(), assigned: new Set<string>(), humanPassed: new Set<string>(), ...over });

describe('humanCall: what counts as Ali deciding', () => {
  it('approval, an RFI response, or an intern is pursue', () => {
    expect(humanCall('a', facts({ qualifications: new Map([['a', q('approved_bid_pursuit')]]) }))).toBe('pursue');
    expect(humanCall('a', facts({ qualifications: new Map([['a', q('rfi_response')]]) }))).toBe('pursue');
    expect(humanCall('a', facts({ assigned: new Set(['a']) }))).toBe('pursue');
  });
  it('no-bid, or hiding it himself, is pass', () => {
    expect(humanCall('a', facts({ qualifications: new Map([['a', q('no_bid')]]) }))).toBe('pass');
    expect(humanCall('a', facts({ humanPassed: new Set(['a']) }))).toBe('pass');
  });
  it('established requirements alone are not a decision', () => {
    expect(humanCall('a', facts({ qualifications: new Map([['a', q('needs_evidence')]]) }))).toBeNull();
  });
});

describe('aiAgreement', () => {
  it('counts only bids both sides called, and how many matched', () => {
    const f = facts({
      vettings: new Map([['a', v('pursue')], ['b', v('pass')], ['c', v('pass')], ['d', v('inconclusive')], ['e', v('pass')], ['f', v(null, 'queued')]]),
      qualifications: new Map([['a', q('approved_bid_pursuit')], ['b', q('approved_bid_pursuit')], ['d', q('no_bid')]]),
      humanPassed: new Set(['c']),
      assigned: new Set(['f']),
    });
    expect(aiAgreement(f)).toEqual({ decided: 3, agreed: 2 }); // a agrees, b disagrees, c agrees; d, e, f not counted
  });
  it('is zero with nothing decided', () => expect(aiAgreement(facts({ vettings: new Map([['a', v('pass')]]) }))).toEqual({ decided: 0, agreed: 0 }));
});

describe('the email reports it', () => {
  const board = (agreement?: any): any => ({ rows: [], counts: { needs_zip: 0, analyzing: 0, vetted: 0, needs_read: 0, approved: 0, flagged: 0, below_bar: 0 }, dismissedCount: 0, assignedCount: 0, incomplete: false, currentProjects: [], agreement });
  it('says the match rate once Ali has decided a bid', () => {
    expect(summaryNote(board({ decided: 4, agreed: 3 }), [], '2026-11-05').join(' ')).toContain("So far the AI's call matched yours on 3 of 4 bids you decided.");
  });
  it('says nothing before any decision', () => {
    expect(summaryNote(board({ decided: 0, agreed: 0 }), [], '2026-11-05').join(' ')).not.toContain('matched yours');
  });
});
