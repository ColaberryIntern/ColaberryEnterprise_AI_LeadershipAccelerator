import { derivePotentialDisqualifiers } from '../govGaps';
import type { EstablishedRequirement, ServiceMatch } from '../../../services/factoryApi';

const req = (over: Partial<EstablishedRequirement>): EstablishedRequirement => ({
  id: 'R1', text: 'A requirement', applicability: 'always', dueStage: 'submission',
  bindingStatus: 'binding_solicitation_requirement', ...over,
});
const match = (over: Partial<ServiceMatch>): ServiceMatch => ({
  id: 's1', name: 'Enterprise AI Build', category: 'IT', score: 10, strength: 'strong',
  reason: '', matchedKeywords: [], categoryMatched: false, matchedNaics: [], ...over,
}) as ServiceMatch;

describe('derivePotentialDisqualifiers (pure gaps classifier — advisory, surfaces never decides)', () => {
  it('does NOT echo a non-eligibility blocking requirement (the full blocking set lives in "Requirements by due stage"; this panel no longer re-lists it)', () => {
    // Regression guard for the "I see them all twice" duplication: right after extraction every requirement
    // is blocking (no evidence yet). A generic, non-eligibility blocking requirement must NOT appear here.
    const established = [req({ id: 'R1', text: 'Provide a project plan.' })];
    const res = derivePotentialDisqualifiers(established, { blocking: [{ id: 'R1', reason: 'submission_prerequisite_no_evidence' }] }, []);
    expect(res.items).toHaveLength(0);
    expect(res.empty).toBe('none_flagged');
  });

  it('an ELIGIBILITY gate that is also blocking is surfaced once (kind blocking), annotating the server reason', () => {
    const established = [req({ id: 'E0', text: 'Offeror must be registered in SAM.gov.' })];
    const res = derivePotentialDisqualifiers(established, { blocking: [{ id: 'E0', reason: 'applicability_unknown' }] }, []);
    expect(res.items).toHaveLength(1);
    const b = res.items.find((i) => i.id === 'E0');
    expect(b?.kind).toBe('blocking');
    expect(b?.basis).toContain('Applicability unknown');      // server reason annotated into the basis
    expect(b?.basis).toContain('no evidence attached');
  });

  it('an ELIGIBILITY gate that is evidenced AND capable but still blocking (non-evidence reason) is surfaced', () => {
    const matches = [match({ strength: 'strong', matchedKeywords: ['registered'] })];
    const established = [req({ id: 'E9', text: 'Offeror must be registered in SAM.gov.', evidenceRef: { docId: 'D9' } })];
    const res = derivePotentialDisqualifiers(established, { blocking: [{ id: 'E9', reason: 'not_applicable_unevidenced' }] }, matches);
    const b = res.items.find((i) => i.id === 'E9');
    expect(b?.kind).toBe('blocking');
    expect(b?.basis).not.toContain('no evidence attached');   // it IS evidenced
    expect(b?.basis).toContain('Marked not applicable');      // surfaced only because the server blocks it
  });

  it('flags an eligibility requirement with NO evidence', () => {
    const res = derivePotentialDisqualifiers([req({ id: 'E1', text: 'Offeror must be registered in SAM.gov.' })], { blocking: [] }, []);
    const e = res.items.find((i) => i.id === 'E1');
    expect(e?.kind).toBe('eligibility_gap');
    expect(e?.basis).toContain('no evidence attached');
  });

  it('flags an eligibility requirement WITH evidence but NO matching capability', () => {
    const res = derivePotentialDisqualifiers([req({ id: 'E2', text: 'Must hold an active Secret clearance.', evidenceRef: { docId: 'D1' } })], { blocking: [] }, []);
    const e = res.items.find((i) => i.id === 'E2');
    expect(e?.kind).toBe('eligibility_gap');
    expect(e?.basis).toContain('no matching capability');
    expect(e?.basis).not.toContain('no evidence attached');
  });

  it('does NOT flag a non-eligibility requirement that is evidenced and has a matching capability', () => {
    const matches = [match({ strength: 'strong', matchedKeywords: ['web application'] })];
    const res = derivePotentialDisqualifiers([req({ id: 'R3', text: 'Build a custom web application.', evidenceRef: { docId: 'D2' } })], { blocking: [] }, matches);
    expect(res.items).toHaveLength(0);
    expect(res.empty).toBe('none_flagged');
  });

  it('empty states: no established -> no_requirements; established-but-clean -> none_flagged', () => {
    expect(derivePotentialDisqualifiers([], { blocking: [] }, []).empty).toBe('no_requirements');
    const clean = [req({ id: 'R4', text: 'Deliver a monthly status report.', evidenceRef: { docId: 'D3' } })];
    expect(derivePotentialDisqualifiers(clean, { blocking: [] }, []).empty).toBe('none_flagged');
  });

  it('never emits a verified pass/fail verdict; a req that is both blocking and eligibility surfaces once; total/garbage-safe', () => {
    const established = [req({ id: 'E1', text: 'SAM.gov registration required.' })];
    const res = derivePotentialDisqualifiers(established, { blocking: [{ id: 'E1', reason: 'applicability_unknown' }] }, undefined as any);
    expect(res.items).toHaveLength(1);                 // surfaced once (as blocking), not duplicated as eligibility
    for (const i of res.items) {
      expect(`${i.reason} ${i.basis} ${i.kind}`.toLowerCase()).not.toContain('verified');
      expect(i.kind === 'blocking' || i.kind === 'eligibility_gap').toBe(true);
    }
    expect(() => derivePotentialDisqualifiers(null as any, null as any, null as any)).not.toThrow();
    expect(derivePotentialDisqualifiers(null as any, null as any, null as any).empty).toBe('no_requirements');
  });
});
