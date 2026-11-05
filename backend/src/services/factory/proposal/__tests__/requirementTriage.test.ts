import { triageStatement, tallyTriage, type TriageResult } from '../requirementTriage';

/**
 * FIXTURES ARE REAL SENTENCES FROM A PUBLIC-RECORD SOLICITATION, and that is a deliberate
 * deviation from this run's plan, which said synthetic.
 *
 * The plan called for paraphrases on a confidentiality concern the plan auditor then WITHDREW:
 * a Herriman fixture is already committed at `proposalExtractor.test.ts:415`, and a municipal
 * RFP is a public record issued by the city, not client-confidential material. Paraphrasing
 * costs fidelity on exactly the sentences whose wording is the thing under test — the
 * attorney-negotiation clause is only interesting because of how it is phrased — so the real
 * wording is used where the wording IS the test case.
 */

const t = (s: string) => triageStatement(s);

describe('triageStatement — the four classes', () => {
  it('calls a system requirement an obligation, kind technical', () => {
    const r = t('System must support bidirectional GIS integration to select assets and autofill multiple fields into a work order.');
    expect(r.triageClass).toBe('obligation');
    expect(r.kind).toBe('technical');
    expect(r.priority).toBe('must');
  });

  it('calls a submission duty an obligation, kind administrative', () => {
    const r = t('Proposals must be submitted no later than 5:00 p.m. MDT on November 30, 2026.');
    expect(r.triageClass).toBe('obligation');
    expect(r.kind).toBe('administrative');
  });

  it('REFUSES to call the attorney-negotiation clause a requirement', () => {
    // The row that proves the whole point: stored as compliance/must in production, binds
    // Colaberry to nothing, and the coverage gate would demand a task cite it.
    const r = t('If the selected Proposer and the City attorneys’ office are unable to negotiate an acceptable agreement, then another Proposer(s) will be selected by the City Manager or designee.');
    expect(r.triageClass).toBe('city_process');
    expect(r.reason).toMatch(/buyer's own process/);
  });

  it('calls a review-panel statement the buyer’s process, not our obligation', () => {
    expect(t('All Proposals received will be reviewed by a Review Panel (See Section 6).').triageClass)
      .toBe('city_process');
  });

  it('calls an unanswered vendor question a question', () => {
    const r = t('Can you provide the expected number of users by User Roles?');
    expect(r.triageClass).toBe('question');
  });

  it('classifies a question even when it contains a modal verb', () => {
    // Precedence check: interrogative must outrank the obligation signal, or every Q&A row
    // in the set would be filed as a duty.
    expect(t('Should the vendor provide training, and must it be on site?').triageClass).toBe('question');
  });

  it('falls back to note rather than guessing', () => {
    const r = t('Integrations');
    expect(r.triageClass).toBe('note');
    expect(r.reason).toMatch(/no obligation, question or buyer action found/);
  });
});

describe('the both-ways control', () => {
  it('emits EVERY class on a known case, so a zero in any class can be trusted', () => {
    // Without this, "no city_process rows" is indistinguishable from "the detector is broken".
    const seen = new Set([
      t('System must read from and write to the primary GIS database.').triageClass,
      t('All Proposals received will be reviewed by a Review Panel.').triageClass,
      t('Does the City plan to implement new or existing workflows?').triageClass,
      t('Integrations').triageClass,
    ]);
    expect([...seen].sort()).toEqual(['city_process', 'note', 'obligation', 'question']);
  });

  it('emits more than one kind, which is the 858-of-864 defect', () => {
    const kinds = new Set([
      t('System must support bidirectional GIS integration.').kind,
      t('Proposals must include a signed certification.').kind,
      t('All Proposers must comply with applicable federal, state, and local laws.').kind,
      t('Ongoing maintenance and support must be provided during the contract term.').kind,
    ]);
    expect(kinds.size).toBeGreaterThan(1);
  });
});

describe('prohibitions bind as hard as duties', () => {
  it('treats "no late response will be accepted" as an obligation', () => {
    expect(t('No late response, modification, or amendment will be accepted.').triageClass)
      .toBe('obligation');
  });

  it('treats a shall-not as an obligation', () => {
    expect(t('The Proposer shall not subcontract without written consent.').triageClass)
      .toBe('obligation');
  });
});

describe('naming the City does not make it the City’s process', () => {
  it('still binds us when the duty is ours and the City is merely the recipient', () => {
    const r = t('One (1) electronic (PDF) copy of Responses are required to be submitted by email to Herriman City.');
    expect(r.triageClass).toBe('obligation');
  });
});

describe('priority', () => {
  it('reads should as should', () => {
    expect(t('Proposals should identify and describe any potential problems.').priority).toBe('should');
  });

  it('lets a mandatory verb outrank a should in the same sentence', () => {
    expect(t('Vendors should review the attachment and must sign the certification.').priority).toBe('must');
  });
});

describe('plurals and inflections reach the scope signal', () => {
  // REGRESSION PIN. The scope alternation ended in `)\b`, so "work order" could not match
  // "work orders" and "interface" could not match "interfaces" - the boundary landed on the
  // plural 's'. Those rows fell through to the 'rule' default and were stored as `compliance`
  // instead of `technical`. On Herriman's real 56 this moved 3 rows once fixed.
  it.each([
    ['Work orders must allow for the entry and assignment of multiple addresses.', 'technical'],
    ['Mobile and map interfaces must geolocate the user’s active position in real time.', 'technical'],
    ['The platforms must support configuration by asset type.', 'technical'],
    ['Data migrations must preserve attachments.', 'technical'],
  ])('%s -> %s', (text, kind) => {
    expect(t(text).kind).toBe(kind);
  });

  it('still refuses a word that merely CONTAINS a signal', () => {
    // "ghost" must not match "host". The leading \b is what prevents it, and this pins that
    // the added suffix group did not loosen the front of the alternation.
    expect(t('The ghost of a prior vendor lingers in the documentation.').kind).not.toBe('technical');
  });
});

describe('pricing is unreachable, by design and on the record', () => {
  it('files a cost proposal as administrative, never pricing', () => {
    // SIGNALS.submit already matches "cost proposal"/"fee schedule". Zero pricing rows is an
    // artefact of signal order, not a finding about a solicitation. Pinned so a later reader
    // cannot mistake it for a bug in the data.
    expect(t('The cost proposal and fee schedule must be submitted in a separate sealed envelope.').kind)
      .toBe('administrative');
  });
});

describe('tallyTriage', () => {
  const mk = (...texts: string[]): TriageResult[] => texts.map(t);

  it('counts binding rows separately from informational ones', () => {
    const tally = tallyTriage(mk(
      'System must support GIS integration.',
      'All Proposals received will be reviewed by a Review Panel.',
      'Can you provide the expected number of users?',
    ));
    expect(tally.total).toBe(3);
    expect(tally.binding).toBe(1);
    expect(tally.byClass.city_process).toBe(1);
    expect(tally.byClass.question).toBe(1);
  });

  it('flags a single-valued distribution, which is the production defect', () => {
    const tally = tallyTriage(mk(
      'System must integrate with GIS.',
      'System must support work order dashboards.',
    ));
    expect(tally.singleValued).toBe(true);
  });

  it('does NOT call an empty set single-valued', () => {
    // Zero rows is empty, not uniform. Calling it single-valued would be a false positive on
    // nothing at all - the same false-zero shape this module exists to catch.
    expect(tallyTriage([]).singleValued).toBe(false);
  });

  it('clears the flag once a second kind appears', () => {
    const tally = tallyTriage(mk(
      'System must integrate with GIS.',
      'Proposals must include a signed certification.',
    ));
    expect(tally.singleValued).toBe(false);
  });

  it('is deterministic', () => {
    const texts = ['System must integrate with GIS.', 'Can you confirm the user count?'];
    expect(tallyTriage(mk(...texts))).toEqual(tallyTriage(mk(...texts)));
  });
});
