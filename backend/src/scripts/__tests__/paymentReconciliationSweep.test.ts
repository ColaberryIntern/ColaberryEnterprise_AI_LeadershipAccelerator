/**
 * Routing of the daily reconciliation report. Every report until 2026-09-17 went
 * to Ali and every one was school-side ISA drafts that only matched a free Open
 * House row, so the owner learned to ignore the subject line. This pins who gets
 * what, and that a reader with nothing to read gets nothing.
 */
jest.mock('../../config/env', () => ({ env: { mandrillApiKey: '' } }));
jest.mock('../../config/database', () => ({ sequelize: { authenticate: jest.fn(), close: jest.fn() } }));
jest.mock('../../services/paymentReconciliationService', () => ({ runPaymentReconciliationSweep: jest.fn() }));

import { routeReport, OWNER_RECIPIENT, SCHOOL_PAYMENTS_RECIPIENT } from '../paymentReconciliationSweep';
import type { ReconciliationResult, FlaggedEntry } from '../../services/paymentReconciliationService';

const flag = (category: FlaggedEntry['category'], name: string): FlaggedEntry => ({
  paymentId: 1, customerId: 2, name, email: `${name}@example.com`, amount: 149, status: 'Settled', paymentDate: '2026-09-16', reason: 'r', category,
});
const base = (over: Partial<ReconciliationResult> = {}): ReconciliationResult => ({ scanned: 10, autoReconciled: [], flagged: [], errors: [], ...over });

describe('routeReport', () => {
  it('sends only the school-side flags to the school payments owner, and nothing to Ali', () => {
    const r = base({ flagged: [flag('prospect_only', 'vestine'), flag('prospect_only', 'ahmad')] });
    const out = routeReport(r);
    expect(out).toHaveLength(1);
    expect(out[0].to).toBe(SCHOOL_PAYMENTS_RECIPIENT);
    expect(out[0].result.flagged.map((f) => f.name)).toEqual(['vestine', 'ahmad']);
    expect(out[0].result.autoReconciled).toEqual([]);
    expect(out[0].result.errors).toEqual([]);
  });

  it('sends Accelerator flags (ambiguous, unsettled) to Ali without the school-side noise', () => {
    const r = base({ flagged: [flag('prospect_only', 'vestine'), flag('ambiguous', 'two-rows'), flag('unsettled', 'pending-card')] });
    const out = routeReport(r);
    const ali = out.find((o) => o.to === OWNER_RECIPIENT)!;
    expect(ali.result.flagged.map((f) => f.category)).toEqual(['ambiguous', 'unsettled']);
    const school = out.find((o) => o.to === SCHOOL_PAYMENTS_RECIPIENT)!;
    expect(school.result.flagged.map((f) => f.name)).toEqual(['vestine']);
  });

  it('sends auto-reconciliations and errors to Ali even when there are no flags', () => {
    const r = base({ autoReconciled: [{ paymentId: 5, customerId: 6, name: 'x', email: 'x@e', amount: 199, paymentDate: '2026-09-16', matchType: 'email' } as any], errors: [{ paymentId: 7, message: 'boom' }] });
    const out = routeReport(r);
    expect(out).toHaveLength(1);
    expect(out[0].to).toBe(OWNER_RECIPIENT);
  });

  it('sends nothing at all on a clean run', () => {
    expect(routeReport(base())).toEqual([]);
  });

  it('is a pure function: the same result routes the same way twice and the input is not mutated', () => {
    const r = base({ flagged: [flag('prospect_only', 'a'), flag('ambiguous', 'b')] });
    const a = routeReport(r);
    const b = routeReport(r);
    expect(a).toEqual(b);
    expect(r.flagged).toHaveLength(2);
  });
});
