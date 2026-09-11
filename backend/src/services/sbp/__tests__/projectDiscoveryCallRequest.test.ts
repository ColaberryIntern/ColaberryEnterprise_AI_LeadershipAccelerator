/**
 * "Have an AI call me", end to end, with the phone unplugged.
 *
 * The brief forbids a real call in any environment. These tests hold that
 * line in two ways: the Synthflow dial is a mock that THROWS if reached
 * without the test having armed it, and the agent id is '' by default, which
 * is what every environment has today. A test that wants to see the dial
 * branch has to configure the agent on purpose, and even then it reaches a
 * mock.
 */
const mockFindOne = jest.fn();
const mockCreate = jest.fn();
const mockQuery = jest.fn();
const mockLoadTruth = jest.fn();
const mockGetIntake = jest.fn();
const mockTrigger = jest.fn();
const mockEnv = { enableVoiceCalls: false, synthflowApiKey: '', synthflowProjectDiscoveryAgentId: '' };

jest.mock('../../../config/database', () => ({
  sequelize: {
    query: (...a: any[]) => mockQuery(...a),
    transaction: async (fn: any) => fn({ id: 'tx' }),
  },
}));
jest.mock('../../../config/env', () => ({ env: mockEnv }));
jest.mock('../../../models/ProjectDiscoveryCallRequest', () => ({
  __esModule: true,
  default: {
    findOne: (...a: any[]) => mockFindOne(...a),
    create: (...a: any[]) => mockCreate(...a),
  },
}));
jest.mock('../../consentService', () => ({
  normalizePhone: (p?: string | null) => {
    const digits = String(p ?? '').replace(/[^\d]/g, '');
    if (digits.length < 7) return null;
    return digits.length === 10 ? `+1${digits}` : `+${digits}`;
  },
}));
jest.mock('../../synthflowService', () => ({
  resolveAgentId: () => mockEnv.synthflowProjectDiscoveryAgentId,
  triggerVoiceCall: (...a: any[]) => mockTrigger(...a),
}));
jest.mock('../planStore', () => ({ getIntake: (...a: any[]) => mockGetIntake(...a) }));
jest.mock('../intakeTruthStore', () => ({ loadIntakeTruth: (...a: any[]) => mockLoadTruth(...a) }));

import {
  CALL_CONSENT_TEXT,
  CALL_CONSENT_VERSION,
  callAvailability,
  requestProjectDiscoveryCall,
} from '../projectDiscoveryCallRequest';
import type { UnderstandingItem } from '../../delivery/projectUnderstanding';

const PROJECT = '11111111-1111-1111-1111-111111111111';
const ENROLLMENT = '22222222-2222-2222-2222-222222222222';

const fact = (dimension: UnderstandingItem['dimension'], value: string): UnderstandingItem => ({
  dimension, value, classification: 'FACT', provenance: 'source_message', source_quote: value,
});
const KNOWN = [
  fact('problem', 'A tool that checks invoices against purchase orders.'),
  fact('approval_points', 'Priya signs off anything over 5k.'),
];

const INPUT = {
  projectId: PROJECT,
  enrollmentId: ENROLLMENT,
  phone: '(214) 555-0143',
  consent: true,
  consentVersion: CALL_CONSENT_VERSION,
  name: 'Sam',
};

function rowFrom(attrs: any) {
  const row: any = { id: 'req-1', created_at: new Date(), ...attrs };
  row.update = jest.fn(async (patch: any) => { Object.assign(row, patch); return row; });
  return row;
}

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(console, 'log').mockImplementation(() => undefined);
  jest.spyOn(console, 'error').mockImplementation(() => undefined);
  mockEnv.enableVoiceCalls = false;
  mockEnv.synthflowApiKey = '';
  mockEnv.synthflowProjectDiscoveryAgentId = '';
  mockQuery.mockResolvedValue([]);
  mockFindOne.mockResolvedValue(null);
  mockCreate.mockImplementation(async (attrs: any) => rowFrom(attrs));
  mockLoadTruth.mockResolvedValue(KNOWN);
  mockGetIntake.mockResolvedValue({ name: 'Invoice checker' });
  // The line the brief draws. Reaching this without arming it is a test failure.
  mockTrigger.mockImplementation(async () => { throw new Error('a real call was attempted in a test'); });
});

describe('the option is offered only when it can succeed', () => {
  it('is unavailable with no agent configured, which is every environment today', () => {
    expect(callAvailability().available).toBe(false);
  });

  it('needs the agent, the voice switch and the API key, all three', () => {
    mockEnv.synthflowProjectDiscoveryAgentId = 'agent-x';
    expect(callAvailability().available).toBe(false);
    mockEnv.enableVoiceCalls = true;
    expect(callAvailability().available).toBe(false);
    mockEnv.synthflowApiKey = 'k';
    expect(callAvailability().available).toBe(true);
  });

  it('carries the consent words and their version, so the wizard shows what will be stored', () => {
    const offer = callAvailability();
    expect(offer.consentText).toBe(CALL_CONSENT_TEXT);
    expect(offer.consentVersion).toBe(CALL_CONSENT_VERSION);
    expect(offer.consentText).toMatch(/not consent to marketing calls/);
    expect(offer.consentText).toMatch(/recorded/);
  });
});

describe('refusals that record nothing', () => {
  it('an unticked box is not a consent: no row, no number kept', async () => {
    const out = await requestProjectDiscoveryCall({ ...INPUT, consent: false });
    expect(out).toEqual({ placed: false, reason: 'no_consent', requestId: null });
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it('stale consent wording is refused rather than recorded against words never read', async () => {
    const out = await requestProjectDiscoveryCall({ ...INPUT, consentVersion: '2020-01-01' });
    expect(out).toEqual({ placed: false, reason: 'consent_text_stale', requestId: null });
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it('a number that is not a number is refused before anything is written', async () => {
    const out = await requestProjectDiscoveryCall({ ...INPUT, phone: '12' });
    expect(out).toEqual({ placed: false, reason: 'no_phone', requestId: null });
    expect(mockCreate).not.toHaveBeenCalled();
  });
});

describe('refusals that are recorded, because the student did consent', () => {
  it('records the consent and refuses no_agent_configured with nothing configured', async () => {
    const out = await requestProjectDiscoveryCall(INPUT);
    expect(out).toEqual({ placed: false, reason: 'no_agent_configured', requestId: 'req-1' });

    expect(mockCreate).toHaveBeenCalledTimes(1);
    const [attrs] = mockCreate.mock.calls[0];
    expect(attrs).toMatchObject({
      project_id: PROJECT,
      enrollment_id: ENROLLMENT,
      phone_e164: '+12145550143',
      consent_version: CALL_CONSENT_VERSION,
      consent_text: CALL_CONSENT_TEXT,
      decision: 'no_agent_configured',
      angles: [],
      prompt_sha256: null,
      call_id: null,
      placed_at: null,
    });
    expect(attrs.consented_at).toBeInstanceOf(Date);
    expect(mockTrigger).not.toHaveBeenCalled();
  });

  it('never writes the marketing consent ledger', async () => {
    // The only writes are to the project-scoped table. If consent_records
    // were touched, the marketing voice gate would read it as permission.
    await requestProjectDiscoveryCall(INPUT);
    const sql = mockQuery.mock.calls.map((c) => String(c[0])).join('\n');
    expect(sql).not.toMatch(/consent_records/i);
  });

  it('refuses no_intake_yet when there is no truth to continue from', async () => {
    mockLoadTruth.mockResolvedValue(null);
    const out = await requestProjectDiscoveryCall(INPUT);
    expect(out).toMatchObject({ placed: false, reason: 'no_intake_yet' });
    expect(mockGetIntake).not.toHaveBeenCalled();
  });

  it('refuses nothing_to_ask when every angle already has an answer', async () => {
    mockEnv.synthflowProjectDiscoveryAgentId = 'agent-x';
    mockLoadTruth.mockResolvedValue([
      ...KNOWN,
      fact('systems', 'x'), fact('human_only_decisions', 'x'), fact('success_definition', 'x'),
      fact('actors', 'x'), fact('current_workflow', 'x'), fact('desired_outcome', 'x'),
    ]);
    const out = await requestProjectDiscoveryCall(INPUT);
    expect(out).toMatchObject({ placed: false, reason: 'nothing_to_ask' });
    expect(mockTrigger).not.toHaveBeenCalled();
  });

  it('serialises requests per project and refuses a second within the cooldown', async () => {
    mockEnv.synthflowProjectDiscoveryAgentId = 'agent-x';
    mockFindOne.mockResolvedValue({ created_at: new Date(Date.now() - 30_000) });
    const out = await requestProjectDiscoveryCall(INPUT);
    expect(out).toMatchObject({ placed: false, reason: 'cooling_down' });
    // The lock is taken inside the transaction, keyed on the project.
    const lock = mockQuery.mock.calls.find((c) => /pg_advisory_xact_lock/.test(String(c[0])));
    expect(lock).toBeTruthy();
    expect(lock![1].replacements.key).toContain(PROJECT);
    expect(mockTrigger).not.toHaveBeenCalled();
  });

  it('refuses consent_not_recorded when the row cannot be written, and does not dial', async () => {
    mockEnv.synthflowProjectDiscoveryAgentId = 'agent-x';
    mockCreate.mockRejectedValue(new Error('database away'));
    const out = await requestProjectDiscoveryCall(INPUT);
    expect(out).toEqual({ placed: false, reason: 'consent_not_recorded', requestId: null });
    expect(mockTrigger).not.toHaveBeenCalled();
  });
});

describe('the dial branch, reachable only with an agent configured', () => {
  beforeEach(() => {
    mockEnv.synthflowProjectDiscoveryAgentId = 'agent-x';
  });

  it('records the decision first, then dials with the project-discovery call type and a prompt', async () => {
    const order: string[] = [];
    mockCreate.mockImplementation(async (attrs: any) => { order.push('record'); return rowFrom(attrs); });
    mockTrigger.mockImplementation(async () => { order.push('dial'); return { success: true, data: { call_id: 'sf-123' } }; });

    const out = await requestProjectDiscoveryCall(INPUT);

    expect(order).toEqual(['record', 'dial']);
    expect(out).toMatchObject({ placed: true, requestId: 'req-1', callId: 'sf-123' });
    expect((out as any).angles.length).toBeGreaterThan(0);

    const [params] = mockTrigger.mock.calls[0];
    expect(params.callType).toBe('project_discovery');
    expect(params.phone).toBe('+12145550143');
    expect(params.name).toBe('Sam');
    expect(params.prompt).toMatch(/Invoice checker/);
    // The row records what was dialled: the prompt's hash and the angles.
    const [attrs] = mockCreate.mock.calls[0];
    expect(attrs.decision).toBe('place');
    expect(attrs.prompt_sha256).toMatch(/^[0-9a-f]{64}$/);
    expect(attrs.angles.length).toBeGreaterThan(0);
  });

  it('a skip inside triggerVoiceCall is recorded as a skip, never as a call', async () => {
    // The kill switch, ENABLE_VOICE_CALLS and the API key all still apply
    // there; this is what the student is told when one of them says no.
    mockTrigger.mockResolvedValue({ success: true, data: { skipped: true, reason: 'feature_disabled' } });
    const out = await requestProjectDiscoveryCall(INPUT);
    expect(out).toMatchObject({ placed: false, reason: 'dial_skipped', requestId: 'req-1' });
    const row = await mockCreate.mock.results[0].value;
    expect(row.update).toHaveBeenCalledWith({ decision: 'dial_skipped:feature_disabled' });
    expect(row.placed_at).toBeNull();
  });

  it('an upstream failure is dial_failed, with the row marked, not placed', async () => {
    mockTrigger.mockResolvedValue({ success: false, error: '503' });
    const out = await requestProjectDiscoveryCall(INPUT);
    expect(out).toMatchObject({ placed: false, reason: 'dial_failed' });
    const row = await mockCreate.mock.results[0].value;
    expect(row.decision).toBe('dial_failed');
  });

  it('a thrown dial is dial_failed too, and the request id survives for triage', async () => {
    mockTrigger.mockRejectedValue(new Error('socket hang up'));
    const out = await requestProjectDiscoveryCall(INPUT);
    expect(out).toEqual({ placed: false, reason: 'dial_failed', requestId: 'req-1' });
  });

  it('addresses the student as "there" when no name was given, rather than inventing one', async () => {
    mockTrigger.mockResolvedValue({ success: true, data: { call_id: 'sf-1' } });
    await requestProjectDiscoveryCall({ ...INPUT, name: '   ' });
    expect(mockTrigger.mock.calls[0][0].name).toBe('there');
  });
});
