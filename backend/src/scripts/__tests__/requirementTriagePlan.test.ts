import {
  planTriageBackfill, renderTriagePlan, interpretationFor, TRIAGE_PREFIX,
  type TriagePlanRow,
} from '../lib/requirementTriagePlan';

const row = (over: Partial<TriagePlanRow> = {}): TriagePlanRow => ({
  id: 'u-1',
  canonicalReqId: 'REQ-001',
  statement: 'System must support bidirectional GIS integration.',
  kind: 'compliance',
  priority: 'must',
  interpretation: null,
  humanConfirmed: false,
  ...over,
});

describe('planTriageBackfill', () => {
  it('proposes the corrected kind for a misfiled technical requirement', () => {
    const plan = planTriageBackfill([row()]);
    expect(plan.changes).toHaveLength(1);
    expect(plan.changes[0].from.kind).toBe('compliance');
    expect(plan.changes[0].to.kind).toBe('technical');
  });

  it('records the verdict AND its evidence in the interpretation', () => {
    const plan = planTriageBackfill([row()]);
    expect(plan.changes[0].interpretation).toContain(TRIAGE_PREFIX);
    expect(plan.changes[0].interpretation).toContain('obligation');
    // The reason, not just the verdict - an unexplained classification is not checkable.
    expect(plan.changes[0].interpretation).toMatch(/obligation on the bidder/);
  });

  describe('a human decision outranks the classifier', () => {
    it('NEVER touches a row a human confirmed WITH a recorded interpretation', () => {
      const plan = planTriageBackfill([row({
        humanConfirmed: true, interpretation: 'Counsel reviewed: this binds us on delivery.',
      })]);
      expect(plan.changes).toEqual([]);
      expect(plan.skippedConfirmed).toEqual(['REQ-001']);
    });

    it('skips it even when the classifier strongly disagrees with what is stored', () => {
      const plan = planTriageBackfill([row({
        humanConfirmed: true, interpretation: 'Reviewed and agreed.', kind: 'pricing', priority: 'should',
      })]);
      expect(plan.changes).toEqual([]);
      expect(plan.skippedConfirmed).toHaveLength(1);
    });

    it('does NOT treat the flag alone as a decision when the interpretation is EMPTY', () => {
      // Measured on production 5 Nov 2026: all 56 Herriman rows carry human_confirmed with an
      // interpretation of '' - and 859 of 864 rows platform-wide carry the flag. A flag set on
      // 99.4% of rows with nothing behind it is a default, not anybody's judgement. Keying the
      // refusal on the flag alone protected the label and blocked the whole backfill.
      const plan = planTriageBackfill([row({ humanConfirmed: true, interpretation: '' })]);
      expect(plan.skippedConfirmed).toEqual([]);
      expect(plan.confirmedButEmpty).toEqual(['REQ-001']);
      expect(plan.changes).toHaveLength(1);
    });

    it('is not fooled by whitespace masquerading as a decision', () => {
      const plan = planTriageBackfill([row({ humanConfirmed: true, interpretation: '   \n ' })]);
      expect(plan.confirmedButEmpty).toEqual(['REQ-001']);
    });

    it('does not count its OWN earlier output as a human decision', () => {
      // Otherwise the first run would make every subsequent run think a person had agreed -
      // the machine confirming itself, one run removed.
      const first = planTriageBackfill([row({ humanConfirmed: true, interpretation: '' })]);
      const second = planTriageBackfill([row({
        humanConfirmed: true,
        interpretation: first.changes[0].interpretation,
        kind: first.changes[0].to.kind,
        priority: first.changes[0].to.priority,
      })]);
      expect(second.skippedConfirmed).toEqual([]);
      expect(second.alreadyCorrect).toEqual(['REQ-001']);
    });
  });

  describe('idempotency', () => {
    it('reports a row already carrying the triage as already correct, not as a change', () => {
      const first = planTriageBackfill([row()]);
      const applied = row({
        kind: first.changes[0].to.kind,
        priority: first.changes[0].to.priority,
        interpretation: first.changes[0].interpretation,
      });
      const second = planTriageBackfill([applied]);
      expect(second.changes).toEqual([]);
      expect(second.alreadyCorrect).toEqual(['REQ-001']);
    });

    it('separates "already correct" from "nothing found", so a no-op is visibly a no-op', () => {
      // If both collapsed to an empty changes list, a broken read would look like success.
      const empty = planTriageBackfill([]);
      expect(empty.alreadyCorrect).toEqual([]);
      expect(empty.changes).toEqual([]);
    });

    it('still changes a row whose kind matches but whose interpretation is missing', () => {
      const plan = planTriageBackfill([row({ kind: 'technical', priority: 'must', interpretation: null })]);
      expect(plan.changes).toHaveLength(1);
    });
  });

  it('counts every class, including the ones that bind nobody', () => {
    const plan = planTriageBackfill([
      row({ id: 'a', canonicalReqId: 'REQ-001' }),
      row({ id: 'b', canonicalReqId: 'REQ-002', statement: 'All Proposals received will be reviewed by a Review Panel.' }),
      row({ id: 'c', canonicalReqId: 'REQ-003', statement: 'Can you provide the expected number of users?' }),
      row({ id: 'd', canonicalReqId: 'REQ-004', statement: 'Integrations' }),
    ]);
    expect(plan.byClass).toEqual({ obligation: 1, city_process: 1, question: 1, note: 1 });
  });

  it('is deterministic', () => {
    expect(planTriageBackfill([row()])).toEqual(planTriageBackfill([row()]));
  });
});

describe('renderTriagePlan', () => {
  const plan = planTriageBackfill([
    row({ id: 'a', canonicalReqId: 'REQ-001' }),
    row({ id: 'b', canonicalReqId: 'REQ-002', statement: 'All Proposals received will be reviewed by a Review Panel.' }),
  ]);

  it('leads with how many rows actually bind us', () => {
    expect(renderTriagePlan('p', plan, false)).toContain('binding on us         : 1');
  });

  it('says plainly that nothing was written in preflight', () => {
    const text = renderTriagePlan('p', plan, false);
    expect(text).toContain('PREFLIGHT ONLY. Nothing was written.');
    expect(text).not.toContain('applying now');
  });

  it('states on execute that human_confirmed is not being set', () => {
    // A machine marking its own output human-confirmed is the self-certification failure.
    expect(renderTriagePlan('p', plan, true))
      .toContain('human_confirmed stays FALSE: this is a proposal, not a ruling');
  });

  it('makes the human-confirmed skip visible rather than silent', () => {
    const p = planTriageBackfill([row({
      humanConfirmed: true, interpretation: 'Counsel reviewed: this binds us on delivery.',
    })]);
    expect(renderTriagePlan('p', p, false))
      .toMatch(/skipped \(human-confirmed WITH content, never overwritten\) : 1/);
  });

  it('surfaces a flag with nothing behind it as its own line, not as a silent change', () => {
    // 56 of 56 Herriman rows land here. Burying that in the change count would hide a
    // data-integrity finding inside a routine number.
    const p = planTriageBackfill([row({ humanConfirmed: true, interpretation: '' })]);
    expect(renderTriagePlan('p', p, false))
      .toMatch(/flagged human-confirmed but EMPTY \(confirmed nothing\)\s+: 1/);
  });
});

describe('interpretationFor', () => {
  it('is recognisable on a re-read, which is what makes re-runs no-ops', () => {
    expect(interpretationFor('city_process', 'because')).toBe('TRIAGE: city_process - because');
  });
});
