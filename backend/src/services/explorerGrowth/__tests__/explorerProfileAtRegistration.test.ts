import fs from 'fs';
import path from 'path';

const profileFindByPk = jest.fn();
const profileCreate = jest.fn();
const enrollmentFindByPk = jest.fn();
const leadFindOne = jest.fn();

jest.mock('../../../models', () => ({
  Enrollment: { findByPk: (...a: unknown[]) => enrollmentFindByPk(...a) },
  Lead: {
    findOne: (...a: unknown[]) => leadFindOne(...a),
    // `findLeadByEmail` matches on `lower(email)` through Sequelize's own helpers, so the
    // mock has to carry them. Worth recording why: without these the real bridge threw a
    // TypeError, the helper swallowed it exactly as designed, and the failure surfaced as
    // "create was never called" with no error printed — which is the cost of a function
    // that must never throw, and the reason the no-throw tests below assert the return
    // value AND the log rather than just the absence of a rejection.
    sequelize: {
      where: (...a: unknown[]) => ({ where: a }),
      fn: (...a: unknown[]) => ({ fn: a }),
      col: (...a: unknown[]) => ({ col: a }),
    },
  },
  ExplorerJourneyProfile: {
    findByPk: (...a: unknown[]) => profileFindByPk(...a),
    create: (...a: unknown[]) => profileCreate(...a),
  },
  CommunityMember: {},
}));

/**
 * Sender spies for the behavioural no-send check at the bottom of this file. These are the
 * two modules the bridge's import graph can actually reach a send through, and they are
 * spied rather than merely stubbed so the assertion can fail.
 */
const sendPortalMagicLink = jest.fn();
const sendTrainingWelcome = jest.fn();
jest.mock('../../emailService', () => ({
  sendPortalMagicLink: (...a: unknown[]) => sendPortalMagicLink(...a),
  sendTrainingWelcome: (...a: unknown[]) => sendTrainingWelcome(...a),
}));
const syncNewLeadToGhl = jest.fn();
jest.mock('../../ghlService', () => ({ syncNewLeadToGhl: (...a: unknown[]) => syncNewLeadToGhl(...a) }));
const senderSpies = [sendPortalMagicLink, sendTrainingWelcome, syncNewLeadToGhl];

import { bridgeExplorerProfileAtRegistration } from '../explorerProfileAtRegistration';

/**
 * Phase 2 T205 — the Explorer journey profile AT REGISTRATION.
 *
 * THE GAP THIS CLOSES, measured rather than asserted. `ExplorerJourneyProfile.create`
 * appeared in exactly ONE place in the tree — inside `resolveExplorerLead` — and the only
 * non-dry-run caller of that was `repairAllExplorerBridges`, the nightly reconciliation.
 * So no registration path created a profile at all: a new Explorer had no journey
 * identity until a nightly job happened to run.
 *
 * These tests drive the REAL bridge (only the models are mocked), so "a profile exists
 * immediately" is proven by `ExplorerJourneyProfile.create` actually being reached with no
 * job run — not by asserting that a mock of the helper was called.
 */
describe('T205 — a profile exists immediately, with no nightly job', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    enrollmentFindByPk.mockResolvedValue({ id: 'enr-1', email: 'Maya@Example.com ' });
    leadFindOne.mockResolvedValue({ id: 77 });
    profileFindByPk.mockResolvedValue(null);
    profileCreate.mockResolvedValue({});
  });

  it('creates the profile row, keyed on the enrollment, linked to the lead', async () => {
    const resolved = await bridgeExplorerProfileAtRegistration('enr-1', 'portal_free_signup');

    expect(profileCreate).toHaveBeenCalledTimes(1);
    const written = profileCreate.mock.calls[0][0];
    expect(written.enrollment_id).toBe('enr-1');
    expect(written.lead_id).toBe(77);
    // Normalized, because the bridge matches leads on a normalized email and the stored
    // value has to agree with what the next lookup will use.
    expect(written.email_normalized).toBe('maya@example.com');
    expect(resolved).toBe(true);
  });

  it('still writes the profile when no lead matches, and reports it as unresolved', async () => {
    // A registration whose lead capture failed, or an /enroll signup whose lead row is
    // written moments later. The profile must still exist — the journey identity is the
    // point; the lead link is recoverable by the nightly repair.
    leadFindOne.mockResolvedValue(null);

    const resolved = await bridgeExplorerProfileAtRegistration('enr-1', 'enroll_explorer');

    expect(profileCreate).toHaveBeenCalledTimes(1);
    expect(profileCreate.mock.calls[0][0].lead_id).toBeNull();
    expect(resolved).toBe(false);
  });

  it('creates NO second profile on a second registration — it updates the existing row', async () => {
    const update = jest.fn();
    profileFindByPk.mockResolvedValue({ enrollment_id: 'enr-1', update });

    await bridgeExplorerProfileAtRegistration('enr-1', 'portal_free_signup');

    expect(profileCreate).not.toHaveBeenCalled();
    expect(update).toHaveBeenCalledTimes(1);
  });

  it('is safe to call again after the nightly repair has already run', async () => {
    // The upsert is why registration-time bridging needs no new idempotency mechanism:
    // two calls, one row. CLAUDE.md treats a non-idempotent side effect as a production
    // defect, so this is the property that makes the change safe rather than clever.
    await bridgeExplorerProfileAtRegistration('enr-1', 'portal_free_signup');
    const update = jest.fn();
    profileFindByPk.mockResolvedValue({ enrollment_id: 'enr-1', update });
    await bridgeExplorerProfileAtRegistration('enr-1', 'portal_free_signup');

    expect(profileCreate).toHaveBeenCalledTimes(1);
    expect(update).toHaveBeenCalledTimes(1);
  });
});

describe('T205 — a bridge failure never fails a registration', () => {
  beforeEach(() => jest.clearAllMocks());

  it.each([
    ['the enrollment lookup throws', () => enrollmentFindByPk.mockRejectedValue(new TypeError('boom'))],
    ['the profile write throws', () => {
      enrollmentFindByPk.mockResolvedValue({ id: 'enr-1', email: 'a@b.co' });
      leadFindOne.mockResolvedValue(null);
      profileFindByPk.mockResolvedValue(null);
      profileCreate.mockRejectedValue(new Error('db down'));
    }],
  ])('returns false instead of throwing when %s', async (_label, arrange) => {
    const spy = jest.spyOn(console, 'error').mockImplementation(() => {});
    arrange();

    // Not `.rejects` — the point is that it resolves. A registration must survive this.
    await expect(bridgeExplorerProfileAtRegistration('enr-1', 'portal_free_signup'))
      .resolves.toBe(false);

    spy.mockRestore();
  });

  it('logs the failure by error CLASS, with no email anywhere in the line', async () => {
    const spy = jest.spyOn(console, 'error').mockImplementation(() => {});
    enrollmentFindByPk.mockRejectedValue(new TypeError('boom'));

    await bridgeExplorerProfileAtRegistration('enr-1', 'portal_free_signup');

    expect(spy).toHaveBeenCalledTimes(1);
    const [, payload] = spy.mock.calls[0];
    expect(payload).toMatchObject({
      error_class: 'TypeError',
      enrollment_id: 'enr-1',
      entry_point: 'portal_free_signup',
    });
    // The PII bar for this phase: no `@` and no address in any logged payload. The id is
    // logged instead, because an id is not PII and an email is.
    expect(JSON.stringify(spy.mock.calls[0])).not.toContain('@');

    spy.mockRestore();
  });
});

describe('T205 — the bridge cannot send, and the column has a deployment mechanism', () => {
  /**
   * A SOURCE-TEXT ASSERTION, declared as such per this phase's standing decision: it is
   * allowed only where no seam exists, must say so, and must carry a positive control.
   *
   * No seam exists for either claim. "This module reaches no mailer" is a property of the
   * import graph, not of a return value. And `ensureEnrollmentColumns` is an unexported
   * function that issues raw `ALTER TABLE` statements at server start — there is nothing
   * to call and nothing to observe without a live database.
   */
  const read = (p: string) => fs.readFileSync(path.join(__dirname, '..', '..', '..', p), 'utf8');

  /**
   * RETITLED AND NARROWED AFTER VERIFICATION, because the previous version asserted
   * something false.
   *
   * It was called "the bridge module reaches no mailer, queue, dialler or HTTP surface" and
   * the session log called that "a property of the import graph". **The import graph reaches
   * a mailer in three hops:** `explorerProfileAtRegistration` imports
   * `explorerIdentityBridge`, which imports `../participantService` (`:8`), which imports
   * `./emailService` (`:8`), which imports `nodemailer` (`:1`). Around 800 modules are
   * statically reachable. This check reads TWO FILES against a token list, so it can only
   * ever have been a statement about those two files - which is what it now says.
   *
   * The property that actually matters - that the executed bridge path performs no send - is
   * asserted behaviourally in the test below, on the real call path, where it can fail.
   */
  it('neither bridge FILE contains a sender token (a file-scope check, not an import-graph one)', () => {
    const src = read('services/explorerGrowth/explorerIdentityBridge.ts')
      + read('services/explorerGrowth/explorerProfileAtRegistration.ts');

    for (const forbidden of ['mandrill', 'axios', 'nodemailer', 'twilio', 'sendMail', 'sendEmail', 'fetch(']) {
      expect(src.toLowerCase()).not.toContain(forbidden.toLowerCase());
    }
    // POSITIVE CONTROL: the same read finds something it must find, so a path typo
    // cannot make this pass by reading an empty string.
    expect(src).toContain('ExplorerJourneyProfile');
  });

  /**
   * THE REAL NO-SEND CHECK: behavioural, on the executed path, and able to fail.
   *
   * `emailService` and `ghlService` are mocked with spies at the top of this file. A
   * successful bridge must invoke none of them. If someone ever adds a notification to
   * `resolveExplorerLead` - or to the helper - this goes red, which is a guarantee the
   * two-file token scan above could never give.
   */
  it('a successful bridge invokes nothing from emailService or ghlService', async () => {
    jest.clearAllMocks();
    enrollmentFindByPk.mockResolvedValue({ id: 'enr-1', email: 'maya@example.com' });
    leadFindOne.mockResolvedValue({ id: 77 });
    profileFindByPk.mockResolvedValue(null);
    profileCreate.mockResolvedValue({});

    await bridgeExplorerProfileAtRegistration('enr-1', 'portal_free_signup');

    expect(profileCreate).toHaveBeenCalledTimes(1);   // the path really ran
    for (const spy of senderSpies) expect(spy).not.toHaveBeenCalled();
  });

  it('the entry-timestamp column is in the drift-guard list, not only on the model', () => {
    // THE MECHANISM, not the model. Production acquires columns from this list; a column
    // that exists only in the Sequelize model is a 500 on the live registration path.
    const server = read('server.ts');

    expect(server).toContain(
      'ALTER TABLE enrollments ADD COLUMN IF NOT EXISTS explorer_entered_at TIMESTAMPTZ',
    );
    // POSITIVE CONTROL: a column known to be in this list already. If the read or the
    // list shape ever changes, this fails too, rather than the new line silently
    // appearing absent.
    expect(server).toContain(
      "ALTER TABLE enrollments ADD COLUMN IF NOT EXISTS enrollment_type VARCHAR(20) NOT NULL DEFAULT 'standard'",
    );
  });
});
