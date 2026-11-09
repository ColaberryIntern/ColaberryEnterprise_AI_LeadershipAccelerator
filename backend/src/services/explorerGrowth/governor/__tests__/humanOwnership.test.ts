import * as fs from 'fs';
import * as path from 'path';
import { isHumanOwned } from '../humanOwnership';
import { hardStopReason } from '../candidates/hardStop';
import type { HardStopFlags } from '../types';

/**
 * M35 acceptance "taking ownership pauses the journey" (and M33's "human ownership pauses the journey", per M5):
 * an ACCEPTED admissions handoff for the learner stops the Explorer governor, with reason human_owned. A queued or
 * assigned handoff does not: nobody has taken them yet, so the AI is not yet standing aside.
 */

const CLEAR: HardStopFlags = { converted: false, unsubscribed: false, dnc: false, consentRevoked: false, killSwitch: false, campaignInactive: false };

let warnSpy: jest.SpyInstance;
beforeEach(() => { warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => undefined); });
afterEach(() => warnSpy.mockRestore());

describe('isHumanOwned', () => {
  it('true when an accepted handoff exists for the enrollment', async () => {
    const countAccepted = jest.fn(async () => 1);
    expect(await isHumanOwned('enr-1', { countAccepted })).toBe(true);
    expect(countAccepted).toHaveBeenCalledWith('enr-1');
  });
  it('false when none is accepted (queued and assigned are counted out by the query: status accepted only)', async () => {
    expect(await isHumanOwned('enr-1', { countAccepted: async () => 0 })).toBe(false);
  });
  it('a failed read FAILS CLOSED: treated as human-owned, logged with its class', async () => {
    expect(await isHumanOwned('enr-1', { countAccepted: async () => { throw new Error('db down'); } })).toBe(true);
    expect(JSON.parse(String(warnSpy.mock.calls[0][0]))).toMatchObject({ event: 'human_ownership_read_failed', context: { treated_as: 'human_owned' } });
  });
  it('the default query counts status accepted by enrollment_id, so a null lead_id still pauses', () => {
    const src = fs.readFileSync(path.join(__dirname, '..', 'humanOwnership.ts'), 'utf8');
    expect(src).toMatch(/WHERE enrollment_id = :enrollmentId AND status = 'accepted'/);
  });
});

describe('hardStopReason with humanOwned', () => {
  it('human_owned stops the decision', () => {
    expect(hardStopReason({ hardStop: { ...CLEAR, humanOwned: true } })).toBe('human_owned');
  });
  it('absent or false does not stop (Growth Journey strategies that never set it are unchanged)', () => {
    expect(hardStopReason({ hardStop: CLEAR })).toBeNull();
    expect(hardStopReason({ hardStop: { ...CLEAR, humanOwned: false } })).toBeNull();
  });
  it('a permanent reason still wins when both apply (converted is more informative)', () => {
    expect(hardStopReason({ hardStop: { ...CLEAR, converted: true, humanOwned: true } })).toBe('converted');
  });
  it('the Explorer governor sets it from isHumanOwned', () => {
    const src = fs.readFileSync(path.join(__dirname, '..', 'runGovernor.ts'), 'utf8');
    expect(src).toMatch(/isHumanOwned\(enrollmentId\)/);
    expect(src).toMatch(/humanOwned, \/\/ M35/);
  });
});
