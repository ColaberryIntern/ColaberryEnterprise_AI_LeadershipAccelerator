/**
 * texasFormsRules — PURE, DETERMINISTIC rules engine for the Texas procurement forms a bid must file, keyed on the
 * buyer type and a few deal facts. Texas packages impose forms the generic requirement extractor will not name (an
 * HSP, no-boycott certifications, TX-RAMP, Form 1295, a CIQ), and whether each applies is a function of WHO is
 * buying and HOW BIG / WHAT KIND the deal is — not of the solicitation prose. So this is a rules engine, not a text
 * detector: given the buyer facts it returns the required / not-required / at-award / needs-input disposition for
 * each form, with the statute citation and the trigger reason.
 *
 * NEVER GUESS: when a trigger input is unknown, the form is `needs_input` — the engine refuses to assert a form is
 * not required (which could sink a bid) on missing data. PURE + TOTAL: no I/O, never throws; same facts in, same
 * dispositions out — which is what makes it table-testable against the citations in docs/gov-proposal-studio/RESEARCH.md.
 *
 * Scope note: this engine decides applicability from buyer facts. Whether the SOLICITATION additionally NAMES a form
 * (e.g. an Execution of Offer page) is detected separately in buildProposalBlueprint from the source text; the two
 * are merged there. Citations are the Texas authorities in RESEARCH.md, not invented.
 */
import type { RequiredForm, TexasBuyerType } from './proposalBlueprintTypes';

export interface TexasFormsInput {
  buyerType: TexasBuyerType;
  /** Total/estimated contract value in USD, when known. */
  estimatedValue?: number;
  /** Whether the deal is cloud/SaaS software (drives TX-RAMP). */
  cloudSoftware?: boolean;
  /** Whether subcontracting is probable (drives the HSP, with the value threshold). */
  subcontractingProbable?: boolean;
  /** Whether award requires a governing-body vote (one of the Form 1295 triggers). */
  governingBodyVote?: boolean;
  /** True when the solicitation itself asks for Form 1295 AT SUBMISSION (e.g. Harris County), overriding the
   *  default at-award timing. Detected from the source text by the blueprint builder. */
  form1295AtSubmission?: boolean;
}

const HSP_VALUE_THRESHOLD = 100_000;
const FORM_1295_VALUE_THRESHOLD = 1_000_000;

const CITATIONS = {
  hsp: "Tex. Gov't Code 2161.252 (nonresponsive if omitted); TDI HSP instructions — good-faith outreach to 3 HUBs + 2 trade organizations, 7 working days to respond",
  executionOfOffer: 'Texas state/university RFP Execution of Offer (signed offer with disclosures)',
  noBoycott808: "Tex. Gov't Code 808 (no boycott of Israel)",
  noBoycott809: "Tex. Gov't Code 809 (no boycott of energy companies)",
  noBoycott2274: "Tex. Gov't Code 2274 (no discrimination against firearm entities)",
  txRamp: 'TX-RAMP (DIR) — state cloud/SaaS security authorization',
  form1295: 'Texas Ethics Commission Form 1295 — governing-body vote, contract value >= $1M, or lobbying; due with the signed contract',
  ciq: "Local Gov't Code 176 — Conflict of Interest Questionnaire (local government only)",
} as const;

const isStateOrUniversity = (b: TexasBuyerType): boolean => b === 'state_agency' || b === 'university';

/** HSP — state/university, value >= $100k and subcontracting probable makes it fatal. Unknown value/subcontracting
 *  (for an in-scope buyer) is needs_input, never a silent not_required. */
function hspForm(input: TexasFormsInput): RequiredForm {
  const base = { key: 'hsp', label: 'HUB Subcontracting Plan (HSP)', citation: CITATIONS.hsp, timing: 'with_proposal' as const };
  if (!isStateOrUniversity(input.buyerType)) {
    return { ...base, disposition: 'not_required', severity: 'info', triggerReason: 'HSP is a Texas state-agency/university requirement; this buyer is not one.' };
  }
  if (input.estimatedValue === undefined || input.subcontractingProbable === undefined) {
    return { ...base, disposition: 'needs_input', severity: 'curable', triggerReason: 'Need the estimated value and whether subcontracting is probable to decide the HSP.' };
  }
  if (input.estimatedValue >= HSP_VALUE_THRESHOLD && input.subcontractingProbable) {
    return { ...base, disposition: 'required', severity: 'fatal', triggerReason: `Contract >= $${HSP_VALUE_THRESHOLD.toLocaleString()} and subcontracting probable at a state agency/university. Pass/fail; begin good-faith HUB outreach at least 7 working days before the proposal due date.` };
  }
  return { ...base, disposition: 'not_required', severity: 'info', triggerReason: input.estimatedValue < HSP_VALUE_THRESHOLD ? `Contract below the $${HSP_VALUE_THRESHOLD.toLocaleString()} HSP threshold.` : 'Subcontracting is not probable, so no HSP is required.' };
}

/** Execution of Offer — the signed offer form for state/university solicitations. */
function executionOfOfferForm(input: TexasFormsInput): RequiredForm {
  const base = { key: 'execution_of_offer', label: 'Execution of Offer', citation: CITATIONS.executionOfOffer, timing: 'with_proposal' as const };
  if (!isStateOrUniversity(input.buyerType)) {
    return { ...base, disposition: 'not_required', severity: 'info', triggerReason: 'Execution of Offer is a Texas state/university form; this buyer is not one.' };
  }
  return { ...base, disposition: 'required', severity: 'fatal', triggerReason: 'State/university solicitations require a signed Execution of Offer; an unsigned offer is nonresponsive.' };
}

/** The three no-boycott certifications — required of state/university buyers. */
function noBoycottForms(input: TexasFormsInput): RequiredForm[] {
  const defs: Array<{ key: string; label: string; citation: string }> = [
    { key: 'no_boycott_israel_808', label: 'Non-boycott of Israel certification', citation: CITATIONS.noBoycott808 },
    { key: 'no_boycott_energy_809', label: 'Non-boycott of energy companies certification', citation: CITATIONS.noBoycott809 },
    { key: 'no_discrimination_firearms_2274', label: 'Non-discrimination against firearm entities certification', citation: CITATIONS.noBoycott2274 },
  ];
  const inScope = isStateOrUniversity(input.buyerType);
  return defs.map((d) => ({
    key: d.key,
    label: d.label,
    citation: d.citation,
    timing: 'with_proposal' as const,
    disposition: (inScope ? 'required' : 'not_required') as RequiredForm['disposition'],
    severity: (inScope ? 'fatal' : 'info') as RequiredForm['severity'],
    triggerReason: inScope ? 'Required certification for Texas state-agency/university contracts.' : 'No-boycott certifications under 808/809/2274 apply to Texas state agencies/universities; this buyer is not one.',
  }));
}

/** TX-RAMP — cloud/SaaS software for a state agency. Unknown cloud flag (for a state agency) is needs_input. */
function txRampForm(input: TexasFormsInput): RequiredForm {
  const base = { key: 'tx_ramp', label: 'TX-RAMP certification', citation: CITATIONS.txRamp, timing: 'with_proposal' as const };
  if (input.buyerType !== 'state_agency') {
    return { ...base, disposition: 'not_required', severity: 'info', triggerReason: 'TX-RAMP applies to cloud/SaaS software for Texas state agencies; this buyer is not a state agency.' };
  }
  if (input.cloudSoftware === undefined) {
    return { ...base, disposition: 'needs_input', severity: 'curable', triggerReason: 'Need to know whether the solution is cloud/SaaS to decide TX-RAMP.' };
  }
  if (input.cloudSoftware) {
    return { ...base, disposition: 'required', severity: 'curable', triggerReason: 'Cloud/SaaS software at a state agency requires TX-RAMP authorization (may be provisional/in-process).' };
  }
  return { ...base, disposition: 'not_required', severity: 'info', triggerReason: 'Solution is not cloud/SaaS, so TX-RAMP does not apply.' };
}

/** Form 1295 — governing-body vote OR value >= $1M. Due AT AWARD unless the solicitation asks for it at submission.
 *  Applies to any Texas governmental buyer (state or local). Unknown vote AND value is needs_input. */
function form1295(input: TexasFormsInput): RequiredForm {
  const base = { key: 'form_1295', label: 'Form 1295 (Certificate of Interested Parties)', citation: CITATIONS.form1295 };
  if (input.buyerType === 'other') {
    return { ...base, timing: 'unknown', disposition: 'not_required', severity: 'info', triggerReason: 'Form 1295 is a Texas requirement; this buyer is out of scope.' };
  }
  const valueTriggers = input.estimatedValue !== undefined && input.estimatedValue >= FORM_1295_VALUE_THRESHOLD;
  const valueRulesOut = input.estimatedValue !== undefined && input.estimatedValue < FORM_1295_VALUE_THRESHOLD;
  const applies = input.governingBodyVote === true || valueTriggers;
  if (applies) {
    if (input.form1295AtSubmission) {
      return { ...base, timing: 'with_proposal', disposition: 'required', severity: 'fatal', triggerReason: `${input.governingBodyVote ? 'Governing-body vote' : 'Contract value >= $1M'}; the solicitation asks for Form 1295 at submission.` };
    }
    return { ...base, timing: 'at_award', disposition: 'at_award', severity: 'curable', triggerReason: `${input.governingBodyVote ? 'Governing-body vote' : 'Contract value >= $1M'} triggers Form 1295, due with the signed contract (not at submission).` };
  }
  // Not triggered only if BOTH triggers are known-false; otherwise an unknown could still trigger it.
  if (input.governingBodyVote === false && valueRulesOut) {
    return { ...base, timing: 'unknown', disposition: 'not_required', severity: 'info', triggerReason: 'No governing-body vote and contract below $1M.' };
  }
  return { ...base, timing: 'unknown', disposition: 'needs_input', severity: 'curable', triggerReason: 'Need the governing-body-vote flag and/or the contract value to decide Form 1295.' };
}

/** CIQ — Conflict of Interest Questionnaire, local government only. */
function ciqForm(input: TexasFormsInput): RequiredForm {
  const base = { key: 'ciq', label: 'Conflict of Interest Questionnaire (CIQ)', citation: CITATIONS.ciq, timing: 'with_proposal' as const };
  if (input.buyerType === 'local_government') {
    return { ...base, disposition: 'required', severity: 'curable', triggerReason: 'Local-government contracts require a CIQ (Local Gov\'t Code 176).' };
  }
  return { ...base, disposition: 'not_required', severity: 'info', triggerReason: 'The CIQ applies to Texas local government only.' };
}

/**
 * Compute the Texas forms disposition set for a buyer. Returns every form the engine knows, each with its
 * disposition (required / not_required / at_award / needs_input), timing, severity, trigger reason and citation —
 * in a stable order. A caller filters to the ones it wants to show; keeping not_required entries makes the engine's
 * reasoning auditable ("why ISN'T an HSP required here?").
 */
export function texasFormsRules(input: TexasFormsInput): RequiredForm[] {
  const safe: TexasFormsInput = { ...input, buyerType: (['state_agency', 'university', 'local_government', 'other'] as TexasBuyerType[]).includes(input?.buyerType) ? input.buyerType : 'other' };
  return [
    hspForm(safe),
    executionOfOfferForm(safe),
    ...noBoycottForms(safe),
    txRampForm(safe),
    form1295(safe),
    ciqForm(safe),
  ];
}
