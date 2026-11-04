/**
 * texasFormsRules — table-driven tests. Each case fixes the buyer facts and asserts the disposition, timing and
 * severity of each form, with the Texas authority cited in docs/gov-proposal-studio/RESEARCH.md. The engine must
 * NEVER guess: an unknown trigger input yields `needs_input`, never a silent `not_required`.
 */
import { texasFormsRules, type TexasFormsInput } from '../texasFormsRules';
import type { RequiredForm } from '../proposalBlueprintTypes';

const byKey = (forms: RequiredForm[], key: string): RequiredForm => {
  const f = forms.find((x) => x.key === key);
  if (!f) throw new Error(`form ${key} not present`);
  return f;
};

describe('texasFormsRules — HSP (Gov\'t Code 2161.252)', () => {
  it('state agency, >= $100k, subcontracting probable → required + fatal, with the 7-working-day outreach note', () => {
    const hsp = byKey(texasFormsRules({ buyerType: 'state_agency', estimatedValue: 500_000, subcontractingProbable: true }), 'hsp');
    expect(hsp.disposition).toBe('required');
    expect(hsp.severity).toBe('fatal');
    expect(hsp.timing).toBe('with_proposal');
    expect(hsp.citation).toMatch(/2161\.252/);
    expect(hsp.triggerReason).toMatch(/7 working days/);
  });
  it('university, >= $100k, subcontracting probable → required + fatal', () => {
    const hsp = byKey(texasFormsRules({ buyerType: 'university', estimatedValue: 250_000, subcontractingProbable: true }), 'hsp');
    expect(hsp.disposition).toBe('required');
    expect(hsp.severity).toBe('fatal');
  });
  it('below the $100k threshold → not_required', () => {
    expect(byKey(texasFormsRules({ buyerType: 'state_agency', estimatedValue: 50_000, subcontractingProbable: true }), 'hsp').disposition).toBe('not_required');
  });
  it('subcontracting not probable → not_required', () => {
    expect(byKey(texasFormsRules({ buyerType: 'state_agency', estimatedValue: 500_000, subcontractingProbable: false }), 'hsp').disposition).toBe('not_required');
  });
  it('unknown value or subcontracting (state agency) → needs_input, never a guess', () => {
    expect(byKey(texasFormsRules({ buyerType: 'state_agency', subcontractingProbable: true }), 'hsp').disposition).toBe('needs_input');
    expect(byKey(texasFormsRules({ buyerType: 'state_agency', estimatedValue: 500_000 }), 'hsp').disposition).toBe('needs_input');
  });
  it('local government → not_required (HSP is state/university)', () => {
    expect(byKey(texasFormsRules({ buyerType: 'local_government', estimatedValue: 500_000, subcontractingProbable: true }), 'hsp').disposition).toBe('not_required');
  });
});

describe('texasFormsRules — Execution of Offer', () => {
  it('state/university → required + fatal', () => {
    expect(byKey(texasFormsRules({ buyerType: 'state_agency' }), 'execution_of_offer').disposition).toBe('required');
    expect(byKey(texasFormsRules({ buyerType: 'university' }), 'execution_of_offer').severity).toBe('fatal');
  });
  it('local/other → not_required', () => {
    expect(byKey(texasFormsRules({ buyerType: 'local_government' }), 'execution_of_offer').disposition).toBe('not_required');
    expect(byKey(texasFormsRules({ buyerType: 'other' }), 'execution_of_offer').disposition).toBe('not_required');
  });
});

describe('texasFormsRules — no-boycott certs (808/809/2274)', () => {
  it('state/university → all three required + fatal, each citing its statute', () => {
    const forms = texasFormsRules({ buyerType: 'state_agency' });
    const israel = byKey(forms, 'no_boycott_israel_808');
    const energy = byKey(forms, 'no_boycott_energy_809');
    const firearms = byKey(forms, 'no_discrimination_firearms_2274');
    expect([israel, energy, firearms].every((f) => f.disposition === 'required' && f.severity === 'fatal')).toBe(true);
    expect(israel.citation).toMatch(/\b808\b/);
    expect(energy.citation).toMatch(/\b809\b/);
    expect(firearms.citation).toMatch(/\b2274\b/);
  });
  it('local government → not_required', () => {
    expect(byKey(texasFormsRules({ buyerType: 'local_government' }), 'no_boycott_israel_808').disposition).toBe('not_required');
  });
});

describe('texasFormsRules — TX-RAMP', () => {
  it('state agency + cloud → required', () => {
    expect(byKey(texasFormsRules({ buyerType: 'state_agency', cloudSoftware: true }), 'tx_ramp').disposition).toBe('required');
  });
  it('state agency + cloud unknown → needs_input', () => {
    expect(byKey(texasFormsRules({ buyerType: 'state_agency' }), 'tx_ramp').disposition).toBe('needs_input');
  });
  it('state agency + not cloud → not_required', () => {
    expect(byKey(texasFormsRules({ buyerType: 'state_agency', cloudSoftware: false }), 'tx_ramp').disposition).toBe('not_required');
  });
  it('university/local → not_required (scoped to state agencies)', () => {
    expect(byKey(texasFormsRules({ buyerType: 'university', cloudSoftware: true }), 'tx_ramp').disposition).toBe('not_required');
    expect(byKey(texasFormsRules({ buyerType: 'local_government', cloudSoftware: true }), 'tx_ramp').disposition).toBe('not_required');
  });
});

describe('texasFormsRules — Form 1295 (Texas Ethics Commission)', () => {
  it('governing-body vote → at_award by default', () => {
    const f = byKey(texasFormsRules({ buyerType: 'local_government', governingBodyVote: true }), 'form_1295');
    expect(f.disposition).toBe('at_award');
    expect(f.timing).toBe('at_award');
  });
  it('value >= $1M → at_award', () => {
    expect(byKey(texasFormsRules({ buyerType: 'state_agency', estimatedValue: 2_000_000, governingBodyVote: false }), 'form_1295').disposition).toBe('at_award');
  });
  it('solicitation asks at submission → required + with_proposal + fatal', () => {
    const f = byKey(texasFormsRules({ buyerType: 'local_government', governingBodyVote: true, form1295AtSubmission: true }), 'form_1295');
    expect(f.disposition).toBe('required');
    expect(f.timing).toBe('with_proposal');
    expect(f.severity).toBe('fatal');
  });
  it('no vote and below $1M → not_required', () => {
    expect(byKey(texasFormsRules({ buyerType: 'state_agency', governingBodyVote: false, estimatedValue: 500_000 }), 'form_1295').disposition).toBe('not_required');
  });
  it('vote and value both unknown → needs_input', () => {
    expect(byKey(texasFormsRules({ buyerType: 'state_agency' }), 'form_1295').disposition).toBe('needs_input');
  });
  it('no vote but value unknown → still needs_input (an unknown value could trigger it)', () => {
    expect(byKey(texasFormsRules({ buyerType: 'state_agency', governingBodyVote: false }), 'form_1295').disposition).toBe('needs_input');
  });
});

describe('texasFormsRules — CIQ (Local Gov\'t Code 176)', () => {
  it('local government → required', () => {
    const ciq = byKey(texasFormsRules({ buyerType: 'local_government' }), 'ciq');
    expect(ciq.disposition).toBe('required');
    expect(ciq.citation).toMatch(/176/);
  });
  it('state/university/other → not_required', () => {
    expect(byKey(texasFormsRules({ buyerType: 'state_agency' }), 'ciq').disposition).toBe('not_required');
    expect(byKey(texasFormsRules({ buyerType: 'university' }), 'ciq').disposition).toBe('not_required');
  });
});

describe('texasFormsRules — out-of-scope buyer', () => {
  it('buyer "other" → every form not_required', () => {
    const forms = texasFormsRules({ buyerType: 'other', estimatedValue: 5_000_000, subcontractingProbable: true, cloudSoftware: true, governingBodyVote: true });
    expect(forms.every((f) => f.disposition === 'not_required')).toBe(true);
  });
  it('a garbage buyerType is treated as out-of-scope, not thrown', () => {
    const forms = texasFormsRules({ buyerType: 'martian' as unknown as TexasFormsInput['buyerType'] });
    expect(forms.every((f) => f.disposition === 'not_required')).toBe(true);
  });
});
