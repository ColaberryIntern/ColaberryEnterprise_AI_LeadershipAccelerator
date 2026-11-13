/**
 * MR1 defect 4, final success metric: *"a test asserts the site and portal SMS/voice posture
 * match"*.
 *
 * ── WHAT "MATCH" HAD TO MEAN, AND WHY THE TICKET'S FRAMING WAS WRONG ────────
 *
 * MR1 described this as the two halves disagreeing: the site belt holds `send_sms_summary` and
 * `initiate_voice_call` while the portal Maya refuses both by name, so one Maya contradicted the
 * other. The ticket's remedy was to pick one - *"route through `evaluateSend` plus an idempotency
 * key, or remove it from the site belt"*.
 *
 * Removing a capability from a live agent is a product decision and is not mine to take, so this
 * work took the other option. That means the two surfaces still differ in WHAT THEY OFFER, and
 * they always will: the portal is for a signed-in learner and hands "call me" to a person, while
 * the site chat is the public front door. Asserting that the two tool lists are identical would
 * be asserting a decision nobody made.
 *
 * What must match is the POSTURE, and it comes down to one property:
 *
 *   **Neither Maya may tell somebody an outbound action happened when it did not.**
 *
 * The portal achieves that by holding no such tool at all - it cannot misreport what it cannot
 * do. The site chat now achieves it by reporting the provider's real answer and by never
 * scripting the claim ahead of the result. Those are different mechanisms reaching the same
 * guarantee, and that is what these tests pin.
 *
 * The behavioral half lives in `mayaVoiceToolHonesty`, `mayaSmsToolHonesty` and
 * `mayaPhoneConsentGate`. This file pins the PROMPT, which is the half that caused the incident:
 * the handlers were wrong, but it was the script that put the sentence in her mouth before the
 * tool had answered.
 */
export {};

import fs from 'fs';
import path from 'path';

jest.mock('../admissionsMemoryService', () => ({
  buildMemoryContext: jest.fn(() => ''),
  loadMemory: jest.fn(async () => null),
  isCEO: jest.fn(() => false),
}));
jest.mock('../admissionsKnowledgeService', () => ({ buildKnowledgeContext: jest.fn(async () => '') }));
jest.mock('../admissionsPricing', () => ({ pricingPitchRule: () => 'Membership is monthly.' }));
jest.mock('../admissionsWorkflowService', () => ({ getVisitorWorkflowStage: jest.fn(async () => null) }));
jest.mock('../mayaPersonalizationService', () => ({ buildPersonalizedContext: jest.fn(async () => '') }));
jest.mock('../campaignContextService', () => ({
  getCampaignContext: jest.fn(async () => null),
  formatCampaignContextForPrompt: jest.fn(() => ''),
}));
jest.mock('../../models', () => ({ Lead: { findByPk: jest.fn(async () => null) } }));

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { buildMayaSystemPrompt } = require('../admissionsMayaService');

const REPO_ROOT = path.resolve(__dirname, '../../../..');

function readRepoFile(rel: string): string {
  return fs.readFileSync(path.join(REPO_ROOT, rel), 'utf8');
}

let prompt = '';

beforeAll(async () => {
  prompt = await buildMayaSystemPrompt({
    pageUrl: 'https://enterprise.colaberry.ai/',
    pageCategory: 'home',
    visitorId: 'visitor-1',
    leadId: null,
  });
});

/** The line of the prompt that contains a given phrase. */
function lineContaining(phrase: string): string {
  const line = prompt.split('\n').find((l) => l.includes(phrase));
  expect(line).toBeDefined();
  return line as string;
}

describe('the prompt never scripts an outcome before the tool has answered', () => {
  it('states the rule explicitly, and names what it cost', async () => {
    expect(prompt).toContain('NEVER announce the outcome of a tool before it has returned');
    // The two dates are in the prompt on purpose. A rule with a cost attached survives editing
    // better than a rule without one.
    expect(prompt).toMatch(/2026-10-24 and 2026-11-06/);
  });

  it.each([
    ["I'm placing a call to you now", 'voice'],
    ['I just texted you a recap', 'SMS'],
    ['I just sent the [document type] to your email', 'document'],
  ])('the %s claim is conditioned on success, not stated up front', async (claim) => {
    // The claim still exists - it is the right thing to say when the send worked. What changed is
    // that it now sits behind `success: true`. This asserts the CONDITION, which is the whole
    // fix; asserting the claim's absence would have failed the moment a correct version shipped.
    const line = lineContaining(claim);
    expect(line).toMatch(/success:\s*true/);
  });

  it.each([
    ['VOICE CALL FLOW', 'voice'],
    ['SMS SUMMARY FLOW', 'SMS'],
    ['DOCUMENT DELIVERY FLOW', 'document'],
  ])('%s tells her to wait for the result', async (flow) => {
    const section = prompt.slice(prompt.indexOf(flow), prompt.indexOf(flow) + 900);
    expect(section).toMatch(/WAIT FOR THE RESULT/);
    expect(section).toMatch(/success:\s*false/);
  });

  it('still tells her to relay a failure rather than apologise vaguely', async () => {
    // Pre-existing rule, and the one that only started working once the handlers stopped
    // returning success on paths where nothing happened.
    expect(prompt).toContain('relay the tool\'s summary message');
    expect(prompt).toMatch(/Do NOT say "I had trouble"/);
  });

  it('no longer demotes the one path that actually works to a last resort', async () => {
    // `schedule_callback` writes a real callback_requests row. While ENABLE_VOICE_CALLS is false
    // it is the ONLY working route for "call me", and the prompt used to say
    // "ONLY use as a last resort when initiate_voice_call is unavailable".
    expect(prompt).not.toMatch(/ONLY use as a last resort/);
    expect(lineContaining('schedule_callback: Queue a callback')).toMatch(/whenever/);
  });

  it('no longer tells her to place a call RIGHT NOW as though it cannot refuse', async () => {
    expect(prompt).not.toMatch(/Place an immediate AI voice call to the visitor RIGHT NOW/);
    expect(lineContaining('initiate_voice_call: Attempt')).toMatch(/can refuse/);
  });

  it('does not instruct her to use the voice tool INSTEAD of a callback', async () => {
    expect(prompt).not.toMatch(/Do NOT use schedule_callback/);
  });
});

describe('the portal Maya reaches the same guarantee by a different mechanism', () => {
  const PORTAL_TOOLS = 'backend/src/services/maya/mayaPortalTools.ts';
  const PORTAL_PROMPT = 'backend/src/services/maya/mayaPortalPrompt.ts';

  it('holds no SMS or voice tool at all, so it cannot misreport one', () => {
    const src = readRepoFile(PORTAL_TOOLS);
    const belt = src.slice(src.indexOf('MAYA_PORTAL_TOOLS'), src.indexOf('isMayaPortalTool'));
    expect(belt).not.toContain('send_sms_summary');
    expect(belt).not.toContain('initiate_voice_call');
  });

  it('says so in its prompt rather than leaving it implicit', () => {
    expect(readRepoFile(PORTAL_PROMPT)).toMatch(/cannot place phone calls yourself, send texts/i);
  });

  it('offers a real alternative instead, the same one the site chat now falls back to', () => {
    // Both surfaces now route an impossible call to the callback queue, which writes a row.
    expect(readRepoFile(PORTAL_TOOLS)).toContain('request_callback');
    expect(prompt).toContain('schedule_callback');
  });
});

describe('the site belt is unchanged in size, so nothing was quietly withdrawn', () => {
  it('still declares exactly 12 tools', () => {
    // Removing a capability from a live agent is a product decision and was explicitly out of
    // scope. This asserts that the honesty fix did not smuggle one in. `mayaAgentRegistration`
    // pins the same count from the registry side.
    const src = readRepoFile('backend/src/services/mayaActionService.ts');
    const belt = src.slice(src.indexOf('MAYA_TOOLS'), src.indexOf('export interface MayaActionResult'));
    const names = [...belt.matchAll(/name:\s*'([a-z_]+)'/g)].map((m) => m[1]);
    expect(new Set(names).size).toBe(12);
    expect(names).toContain('send_sms_summary');
    expect(names).toContain('initiate_voice_call');
  });
});
