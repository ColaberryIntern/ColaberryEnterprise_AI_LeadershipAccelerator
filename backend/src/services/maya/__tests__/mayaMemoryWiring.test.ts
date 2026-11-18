/**
 * OH1g (T1) - the one memory reaches every Maya surface's prompt: the website chat (buildMayaSystemPrompt), the
 * countdown email (buildEventUserPrompt via eventContext.memory_timeline), the countdown call brief
 * (countdownCallBrief memory) and, structurally, the scheduler that feeds the last two. The campus IM wire-in is
 * asserted in mayaReplyService.test.ts.
 */
import fs from 'fs';
import path from 'path';

const BLOCK = 'WHAT MAYA AND THIS PERSON HAVE SAID (all channels) - oldest first\n- Nov 16, 9:00 AM email Them ->: Can I bring my manager?';

jest.mock('../../admissionsMemoryService', () => ({
  buildMemoryContext: jest.fn(() => ''),
  loadMemory: jest.fn(async () => null),
  isCEO: jest.fn(() => false),
}));
jest.mock('../../admissionsKnowledgeService', () => ({ buildKnowledgeContext: jest.fn(async () => '') }));
jest.mock('../../admissionsPricing', () => ({ pricingPitchRule: () => 'Membership is monthly.' }));
jest.mock('../../admissionsWorkflowService', () => ({ getVisitorWorkflowStage: jest.fn(async () => null) }));
jest.mock('../../mayaPersonalizationService', () => ({ buildPersonalizedContext: jest.fn(async () => '') }));
jest.mock('../../campaignContextService', () => ({
  getCampaignContext: jest.fn(async () => null),
  formatCampaignContextForPrompt: jest.fn(() => ''),
}));
jest.mock('../../../models', () => ({ Lead: { findByPk: jest.fn(async () => null) } }));
jest.mock('../mayaMemory', () => ({ mayaMemoryBlock: jest.fn() }));

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { buildMayaSystemPrompt } = require('../../admissionsMayaService');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { mayaMemoryBlock } = require('../mayaMemory');

describe('website chat (admissionsMayaService.buildMayaSystemPrompt)', () => {
  it('adds the one-memory block, keyed by visitor and lead, without repeating the chat itself', async () => {
    (mayaMemoryBlock as jest.Mock).mockResolvedValue(BLOCK);
    const prompt = await buildMayaSystemPrompt({ pageUrl: '/', pageCategory: 'homepage', visitorId: 'vis-1', leadId: 42 });
    expect(prompt).toContain('WHAT MAYA AND THIS PERSON HAVE SAID (all channels)');
    expect(prompt).toContain('Can I bring my manager?');
    expect(mayaMemoryBlock).toHaveBeenCalledWith({ visitorId: 'vis-1', leadId: 42 }, expect.objectContaining({ excludeSources: ['chat_messages'] }));
  });
  it('adds nothing when the person has no history', async () => {
    (mayaMemoryBlock as jest.Mock).mockResolvedValue('');
    const prompt = await buildMayaSystemPrompt({ pageUrl: '/', pageCategory: 'homepage', visitorId: 'vis-2', leadId: null });
    expect(prompt).not.toContain('WHAT MAYA AND THIS PERSON HAVE SAID');
  });
});

describe('countdown email (aiMessageService.buildEventUserPrompt)', () => {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { buildEventUserPrompt } = jest.requireActual('../../aiMessageService');
  const base = {
    channel: 'email', ai_instructions: 'Write the reminder.', lead: { name: 'Sam Lee', email: 's@example.com' },
    compositeContext: { previousMessages: [{ channel: 'email', subject: 'Old subject', bodyPreview: 'old body', sentAt: 'Nov 15' }] },
    eventContext: { title: 'Open House', when: 'Thu 6:30 PM CT', join_url: 'https://enterprise.colaberry.ai/j', minutes_before: 4320 },
  };
  it('the timeline replaces the campaign-only "already sent" list', () => {
    const u = buildEventUserPrompt({ ...base, eventContext: { ...base.eventContext, memory_timeline: BLOCK } });
    expect(u).toContain('WHAT MAYA AND THIS PERSON HAVE SAID (all channels)');
    expect(u).not.toContain('WHAT WE ALREADY SENT THEM');
  });
  it('without a timeline the old list is kept (boundary: nothing lost for a person with no memory)', () => {
    const u = buildEventUserPrompt(base);
    expect(u).toContain('WHAT WE ALREADY SENT THEM');
    expect(u).not.toContain('WHAT MAYA AND THIS PERSON HAVE SAID');
  });
});

describe('countdown call (openHouseCountdown.countdownCallBrief)', () => {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { countdownCallBrief } = jest.requireActual('../../openHouseCountdown');
  const EVENT = { title: 'Colaberry Open House', when_label: 'Thursday 6:30 PM CT' };
  it('the timeline is the call history when present', () => {
    const b = countdownCallBrief({ firstName: 'Sam', event: EVENT, facts: null, history: '- Nov 1: email - Activity log line', memory: BLOCK });
    expect(b).toContain('Can I bring my manager?');
    expect(b).not.toContain('Activity log line');
  });
  it('falls back to the activity history when there is no timeline', () => {
    const b = countdownCallBrief({ firstName: 'Sam', event: EVENT, facts: null, history: '- Nov 1: email - Activity log line', memory: '' });
    expect(b).toContain('Activity log line');
  });
});

describe('scheduler wiring (structural)', () => {
  const src = fs.readFileSync(path.join(__dirname, '../../schedulerService.ts'), 'utf8');
  it('the countdown email and the countdown call both read the one memory', () => {
    expect(src).toMatch(/memory_timeline:\s*\(await mayaMemoryBlock\(\{ leadId:/);
    expect(src).toMatch(/const memory = await mayaMemoryBlock\(\{ leadId: action\.lead_id \}/);
    expect(src).toMatch(/countdownCallBrief\(\{[\s\S]{0,400}memory,\s*\}\)/);
  });
});
