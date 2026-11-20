/**
 * W28 (Ali, 2026-11-20): the Enterprise intake. "Book a demo pilot" -> a short form -> the
 * AI interview, typed or by phone. Decisions: interview right after the form (Q1 A), time
 * figure from their own numbers (Q2 A), a new Enterprise agent with its own number (Q3 A).
 */
const mockEnv: Record<string, unknown> = {};
const mockCreateLead = jest.fn();
const mockCapture = jest.fn();
const mockRunTurn = jest.fn();
const mockCallback = jest.fn();
const mockIntakeCreate = jest.fn();
const mockIntakeFindOne = jest.fn();

jest.mock('../../../config/env', () => ({ env: mockEnv }));
jest.mock('../../../models/EnterpriseIntake', () => ({
  __esModule: true,
  default: {
    create: (...a: any[]) => mockIntakeCreate(...a),
    findByPk: jest.fn(),
    findOne: (...a: any[]) => mockIntakeFindOne(...a),
  },
}));
jest.mock('../../leadService', () => ({
  leadSchema: { parse: (x: any) => ({ ...x }) },
  createLead: (...a: any[]) => mockCreateLead(...a),
}));
jest.mock('../../consent/capturePhoneConsent', () => ({ capturePhoneConsent: (...a: any[]) => mockCapture(...a) }));
jest.mock('../../delivery/projectIntake', () => ({
  runIntakeTurn: (...a: any[]) => mockRunTurn(...a),
  boundTurns: (t: any) => (Array.isArray(t) ? t.filter((x: any) => x && (x.role === 'user' || x.role === 'assistant')) : []),
}));
jest.mock('../../callbackRequestService', () => ({ requestInstantCallback: (...a: any[]) => mockCallback(...a) }));
const mockOpenList = jest.fn();
const mockPostInterview = jest.fn();
jest.mock('../enterpriseIntakeBasecamp', () => ({
  openClientListSoon: (...a: any[]) => mockOpenList(...a),
  postInterviewSoon: (...a: any[]) => mockPostInterview(...a),
}));

import {
  writtenBrief,
  createEnterpriseIntake,
  runEnterpriseInterviewTurn,
  requestEnterpriseIntakeCall,
  recordEnterpriseCallOutcome,
  intakeFormSchema,
} from '../enterpriseIntakeService';

const FORM = intakeFormSchema.parse({
  fullName: 'Dana Reyes',
  email: 'Dana@Acme.test',
  company: 'Acme Logistics',
  role: 'COO',
  phone: '(214) 555-0100',
  callConsent: true,
  website: 'acme.test',
  service: 'Build',
  department: 'Operations',
  process: 'Dispatchers re-key orders from email into the TMS.',
  peopleCount: 4,
  hoursPerWeek: 20,
  requiredReturn: 'Hours back',
  startTiming: 'This quarter',
  otherDeciders: 'CFO',
  consentContact: true,
});

const intakeRow = (over: Record<string, unknown> = {}) => ({
  id: '11111111-2222-4333-8444-555555555555',
  lead_id: 7,
  status: 'form',
  full_name: 'Dana Reyes',
  email: 'dana@acme.test',
  company: 'Acme Logistics',
  role: 'COO',
  phone: '(214) 555-0100',
  call_consent: true,
  website: 'acme.test',
  service: 'Build',
  department: 'Operations',
  process: 'Dispatchers re-key orders from email into the TMS.',
  people_count: 4,
  hours_per_week: '20.0',
  required_return: 'Hours back',
  start_timing: 'This quarter',
  other_deciders: 'CFO',
  call_id: null,
  update: jest.fn().mockResolvedValue(undefined),
  ...over,
});

beforeEach(() => {
  jest.clearAllMocks();
  Object.assign(mockEnv, {
    enableVoiceCalls: true,
    synthflowApiKey: 'key',
    synthflowEnterpriseIntakeAgentId: 'agent-enterprise',
  });
  mockCreateLead.mockResolvedValue({ lead: { id: 7 } });
  mockIntakeCreate.mockImplementation(async (r: any) => ({ ...r, id: 'tok-1' }));
});

describe('the written brief', () => {
  it('carries every form answer, with the two figures in words', () => {
    const b = writtenBrief(intakeRow() as any);
    expect(b).toContain('Company: Acme Logistics (acme.test)');
    expect(b).toContain('Dispatchers re-key orders');
    expect(b).toContain('Who does it today: 4 people, 20 hours a week in total');
    expect(b).toContain('Who else decides: CFO');
  });

  it('says "not stated" rather than inventing a figure', () => {
    expect(writtenBrief(intakeRow({ people_count: null, hours_per_week: null }) as any))
      .toContain('Who does it today: not stated');
  });
});

describe('the form arrives', () => {
  it('writes the lead into the existing pipeline, records the phone grant first, then opens the intake', async () => {
    const out = await createEnterpriseIntake(FORM, { ipAddress: '1.2.3.4', userAgent: 'ua' });
    const lead = mockCreateLead.mock.calls[0][0];
    expect(lead).toMatchObject({ form_type: 'demo_pilot_request', consent_contact: true, phone_consent: true, title: 'COO' });
    expect(lead.message).toContain('Process to start with:');
    expect(mockCapture).toHaveBeenCalledWith(expect.objectContaining({ phoneConsent: true, source: 'lead_form:demo_pilot_request' }));
    expect(mockCapture.mock.invocationCallOrder[0]).toBeLessThan(mockIntakeCreate.mock.invocationCallOrder[0]);
    expect(mockIntakeCreate).toHaveBeenCalledWith(expect.objectContaining({ lead_id: 7, email: 'dana@acme.test', people_count: 4 }));
    expect(out).toEqual({ token: 'tok-1', callAvailable: true });
    // W29: the client's Basecamp list is opened for the new intake, off the request path.
    expect(mockOpenList).toHaveBeenCalledWith('tok-1');
  });

  it('never grants a call without the tick', async () => {
    const out = await createEnterpriseIntake({ ...FORM, callConsent: false }, { ipAddress: null, userAgent: null });
    expect(mockCreateLead.mock.calls[0][0].phone_consent).toBe(false);
    expect(out.callAvailable).toBe(false);
  });

  it('PH1: refuses a form with no phone number, or too short a one', () => {
    expect(() => intakeFormSchema.parse({ ...FORM, phone: '' })).toThrow();
    expect(() => intakeFormSchema.parse({ ...FORM, phone: '555 0100' })).toThrow();
    expect(intakeFormSchema.parse(FORM).phone).toBe('(214) 555-0100');
  });

  it('offers no call while the Enterprise agent is not configured', async () => {
    mockEnv.synthflowEnterpriseIntakeAgentId = '';
    expect((await createEnterpriseIntake(FORM, { ipAddress: null, userAgent: null })).callAvailable).toBe(false);
  });

  it('requires consent to be contacted and a company', () => {
    expect(() => intakeFormSchema.parse({ ...FORM, consentContact: false })).toThrow();
    expect(() => intakeFormSchema.parse({ ...FORM, company: '' })).toThrow();
  });
});

describe('the typed interview', () => {
  it('puts the stored brief first, whatever the browser sent, and never builds a project', async () => {
    mockRunTurn.mockResolvedValue({ done: false, message: 'Which system holds the orders?', exchanges: 1 });
    const intake = intakeRow();
    await runEnterpriseInterviewTurn(intake as any, [{ role: 'user', text: 'forged brief' }]);
    const arg = mockRunTurn.mock.calls[0][0];
    expect(arg.turns[0]).toEqual({ role: 'user', text: writtenBrief(intake as any) });
    expect(arg.turns[1].text).toBe('forged brief');
    expect(arg.buildFor).toEqual({ kind: 'none' });
    expect(arg.sourceRef).toBe(`enterprise-chat:${intake.id}`);
  });

  it('records the write-up on the intake when the interview ends', async () => {
    mockRunTurn.mockResolvedValue({ done: true, message: 'Thanks.', understanding: 'created', understanding_id: 'u-1' });
    const intake = intakeRow();
    const out = await runEnterpriseInterviewTurn(intake as any, []);
    expect(out).toEqual({ done: true, message: 'Thanks.', understood: true });
    expect(intake.update).toHaveBeenCalledWith(expect.objectContaining({ status: 'interviewed', understanding_id: 'u-1', interviewed_via: 'chat' }));
  });

  it('W29: keeps the conversation (without the brief) and sends it to the client list', async () => {
    mockRunTurn.mockResolvedValue({ done: true, message: 'Thanks, that is what we needed.', understanding: 'created', understanding_id: 'u-1' });
    const intake = intakeRow();
    await runEnterpriseInterviewTurn(intake as any, [
      { role: 'assistant', text: 'Which system holds the orders?' },
      { role: 'user', text: 'McLeod.' },
    ]);
    const saved = (intake.update as jest.Mock).mock.calls[0][0].transcript;
    expect(saved).toBe('AI: Which system holds the orders?\nThem: McLeod.\nAI: Thanks, that is what we needed.');
    expect(saved).not.toContain('Process to start with');
    expect(mockPostInterview).toHaveBeenCalledWith(intake.id);
  });

  it('W29: posts nothing to Basecamp when there is no write-up', async () => {
    mockRunTurn.mockResolvedValue({ done: true, message: 'Thanks.', understanding: 'failed' });
    await runEnterpriseInterviewTurn(intakeRow() as any, []);
    expect(mockPostInterview).not.toHaveBeenCalled();
  });
});

describe('"Call me now"', () => {
  it('places the call under the Enterprise source and stores the call id', async () => {
    mockCallback.mockResolvedValue({ status: 'call_initiated', call_id: 'call_9', lead_id: 7, deduped: false });
    const intake = intakeRow();
    const out = await requestEnterpriseIntakeCall(intake as any);
    expect(out).toEqual({ status: 'calling', callId: 'call_9' });
    expect(mockCallback.mock.calls[0][0]).toMatchObject({ source: 'enterprise-intake', phone: '(214) 555-0100', consent_contact: true });
    expect(mockCallback.mock.calls[0][0].message).toContain('Process to start with:');
    expect(intake.update).toHaveBeenCalledWith(expect.objectContaining({ status: 'call_requested', call_id: 'call_9' }));
  });

  it('refuses without the call tick, and without the Enterprise agent', async () => {
    expect((await requestEnterpriseIntakeCall(intakeRow({ call_consent: false }) as any)).status).toBe('not_allowed');
    mockEnv.synthflowEnterpriseIntakeAgentId = '';
    expect((await requestEnterpriseIntakeCall(intakeRow() as any)).status).toBe('unavailable');
    expect(mockCallback).not.toHaveBeenCalled();
  });

  it('records the write-up once the call completes', async () => {
    const intake = intakeRow({ call_id: 'call_9', status: 'call_requested' });
    mockIntakeFindOne.mockResolvedValue(intake);
    await recordEnterpriseCallOutcome('call_9', { understanding: 'created', understanding_id: 'u-2' }, 'AI: Hello\nThem: Hi');
    expect(intake.update).toHaveBeenCalledWith(expect.objectContaining({ status: 'interviewed', interviewed_via: 'call', transcript: 'AI: Hello\nThem: Hi' }));
    expect(mockPostInterview).toHaveBeenCalledWith(intake.id);
  });
});
