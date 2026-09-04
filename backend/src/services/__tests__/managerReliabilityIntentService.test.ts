/**
 * managerReliabilityIntentService — Reese Agentic AI Employee mission,
 * Checkpoint B's manager confirmation workflow. Pure logic: pins real
 * trigger-phrase detection (both directions), the honest confirmation-card
 * text, the confirm/cancel/ambiguous reply classifier, and that a
 * confirmed change actually calls the real registry functions with the
 * pending record's real fields — never a bare status flip disconnected
 * from what was proposed.
 */
const mockDeclareReliabilityChange = jest.fn();
const mockRestoreMetric = jest.fn();
jest.mock('../metricReliabilityService', () => ({
  declareReliabilityChange: (...a: any[]) => mockDeclareReliabilityChange(...a),
  restoreMetric: (...a: any[]) => mockRestoreMetric(...a),
}));

import {
  applyConfirmedReliabilityChange,
  buildConfirmationCardText,
  detectConfirmationReply,
  detectReliabilityIntent,
  toPendingConfirmation,
} from '../managerReliabilityIntentService';

beforeEach(() => {
  jest.clearAllMocks();
  mockDeclareReliabilityChange.mockResolvedValue({});
  mockRestoreMetric.mockResolvedValue({});
});

describe('detectReliabilityIntent', () => {
  it.each([
    'Attendance is broken.',
    'Do not trust attendance numbers for the July cohort.',
    'The check-in system has been missing students since Monday.',
    "attendance isn't working",
    'attendance is unreliable',
  ])('quarantine direction: %p', (message) => {
    const result = detectReliabilityIntent(message);
    expect(result).not.toBeNull();
    expect(result?.direction).toBe('quarantine');
    expect(result?.sourceSystem).toBe('attendance');
    expect(result?.metricKey).toBe('attendance.*');
    expect(result?.reason).toBe(message);
  });

  it.each([
    'Attendance is fixed now.',
    'The check-in system is working again.',
    'attendance has been resolved',
  ])('restore direction: %p', (message) => {
    const result = detectReliabilityIntent(message);
    expect(result?.direction).toBe('restore');
    expect(result?.sourceSystem).toBe('attendance');
  });

  it('honesty boundary: mentions the source but no directional trigger phrase — no detection, no guessing', () => {
    expect(detectReliabilityIntent('How is attendance looking for this cohort?')).toBeNull();
  });

  it('honesty boundary: a directional phrase with no known source-system keyword — no detection', () => {
    expect(detectReliabilityIntent('The website is broken right now.')).toBeNull();
  });

  it('boundary: empty message', () => {
    expect(detectReliabilityIntent('')).toBeNull();
  });
});

describe('buildConfirmationCardText', () => {
  it('quarantine: restates what was understood, defaults to global scope explicitly, states the real effect', () => {
    const text = buildConfirmationCardText({ direction: 'quarantine', sourceSystem: 'attendance', metricKey: 'attendance.*', reason: 'Attendance is broken.' });

    expect(text).toContain('attendance');
    expect(text).toContain('Attendance is broken.');
    expect(text).toContain('globally');
    expect(text).toContain('confirm');
  });

  it('restore: uses restore-specific language, not quarantine language', () => {
    const text = buildConfirmationCardText({ direction: 'restore', sourceSystem: 'attendance', metricKey: 'attendance.*', reason: 'Attendance is fixed now.' });

    expect(text).toContain('resume using');
    expect(text).not.toContain('stop using');
  });
});

describe('toPendingConfirmation', () => {
  it('defaults to global scope and carries every real field forward', () => {
    const pending = toPendingConfirmation({ direction: 'quarantine', sourceSystem: 'attendance', metricKey: 'attendance.*', reason: 'Attendance is broken.' });

    expect(pending.direction).toBe('quarantine');
    expect(pending.sourceSystem).toBe('attendance');
    expect(pending.scopeType).toBe('global');
    expect(pending.scopeValue).toBeNull();
    expect(pending.reason).toBe('Attendance is broken.');
    expect(typeof pending.detectedAt).toBe('string');
  });
});

describe('detectConfirmationReply', () => {
  it.each(['confirm', 'Confirm', 'yes', 'yeah', 'confirmed', 'go ahead', 'proceed', "that's right"])('confirms on %p', (msg) => {
    expect(detectConfirmationReply(msg)).toBe('confirm');
  });

  it.each(['cancel', 'no', 'nope', 'never mind', 'stop'])('cancels on %p', (msg) => {
    expect(detectConfirmationReply(msg)).toBe('cancel');
  });

  it('ambiguous: an unrelated message is neither confirm nor cancel', () => {
    expect(detectConfirmationReply('What time is the next cohort session?')).toBe('ambiguous');
  });

  it('does not false-positive on a word that merely contains a confirm word as a substring', () => {
    // "nostop" is not "stop" — must not match on substring alone.
    expect(detectConfirmationReply('nostop')).toBe('ambiguous');
  });
});

describe('applyConfirmedReliabilityChange', () => {
  it('quarantine: calls declareReliabilityChange with the pending record\'s real fields, never restoreMetric', async () => {
    const pending = { direction: 'quarantine' as const, sourceSystem: 'attendance', metricKey: 'attendance.*', scopeType: 'global' as const, scopeValue: null, reason: 'Attendance is broken.', detectedAt: '2026-09-04T00:00:00.000Z' };

    const result = await applyConfirmedReliabilityChange(pending, 'ali@colaberry.com');

    expect(mockDeclareReliabilityChange).toHaveBeenCalledWith(expect.objectContaining({
      sourceSystem: 'attendance', metricKey: 'attendance.*', status: 'quarantined', reason: 'Attendance is broken.', declaredByEmail: 'ali@colaberry.com', declaredBySource: 'manager_report',
    }));
    expect(mockRestoreMetric).not.toHaveBeenCalled();
    expect(result.summary).toContain('quarantined');
  });

  it('restore: calls restoreMetric with the pending record\'s reason as recovery evidence, never declareReliabilityChange', async () => {
    const pending = { direction: 'restore' as const, sourceSystem: 'attendance', metricKey: 'attendance.*', scopeType: 'global' as const, scopeValue: null, reason: 'Attendance is fixed now.', detectedAt: '2026-09-04T00:00:00.000Z' };

    const result = await applyConfirmedReliabilityChange(pending, 'ali@colaberry.com');

    expect(mockRestoreMetric).toHaveBeenCalledWith(expect.objectContaining({
      sourceSystem: 'attendance', metricKey: 'attendance.*', recoveryEvidence: 'Attendance is fixed now.', restoredByEmail: 'ali@colaberry.com',
    }));
    expect(mockDeclareReliabilityChange).not.toHaveBeenCalled();
    expect(result.summary).toContain('restored');
  });
});
