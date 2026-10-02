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
  it('passes server BLOCKING requirements through verbatim (mapped reason, kind blocking)', () => {
    const established = [req({ id: 'R1', text: 'Provide a plan.' })];
    const res = derivePotentialDisqualifiers(established, { blocking: [{ id: 'R1', reason: 'applicability_unknown' }] }, []);
    const b = res.items.find((i) => i.id === 'R1');
    expect(b?.kind).toBe('blocking');
    expect(b?.reason).toContain('Applicability unknown');
    expect(res.empty).toBeNull();
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
