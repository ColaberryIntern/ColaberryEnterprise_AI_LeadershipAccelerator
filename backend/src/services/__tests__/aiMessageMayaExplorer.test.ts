/**
 * OH1j: an Explorer Growth email written as Maya gets Maya's rules, not the general sales rules.
 * The final system and user prompts are captured and checked for every sales line.
 */
import { buildSystemPrompt, buildUserPromptForTests } from '../aiMessageService';

const composite: any = {
  lead: { name: 'Dana Reyes', email: 'dana@example.com', company: '', title: '', industry: '', notes: '' },
  campaign: { name: 'Explorer Digest', type: 'nurture', senderName: 'Maya' },
  engagement: { recentClickedUrls: [] },
  previousMessages: [],
  allowedUrls: { booking: 'https://enterprise.colaberry.ai/ai-architect', landingPage: 'https://enterprise.colaberry.ai/ai-architect', mainSite: 'https://enterprise.colaberry.ai', advisoryTool: 'https://advisor.colaberry.ai/advisory/' },
  cohort: { name: 'Nov cohort', startDate: 'December 2', daysUntilStart: 14, seatsRemaining: 5 },
};

const base: any = {
  channel: 'email', ai_instructions: 'Share the builder story.', lead: { name: 'Dana Reyes' },
  campaignContext: { type: 'nurture', name: 'Explorer Digest', system_prompt: 'You are Maya.' },
  compositeContext: composite,
};

describe('persona maya_explorer', () => {
  const p = { ...base, persona: 'maya_explorer', allowed_links: ['https://hire.refactored.ai/case-studies/x'] };
  it('system prompt has no CTA, team sign-off or booking link, and lists only the allowed links', () => {
    const sys = buildSystemPrompt('email', p);
    expect(sys).toContain('MAYA EXPLORER RULES');
    expect(sys).not.toMatch(/Include a clear CTA/);
    expect(sys).not.toMatch(/Sign off as the .* team/);
    expect(sys).not.toContain('ai-architect');
    expect(sys).toContain('https://hire.refactored.ai/case-studies/x');
  });
  it('user prompt has no booking/landing/advisory links and no cohort or seats line', () => {
    const user = buildUserPromptForTests(p);
    expect(user).not.toContain('ai-architect');
    expect(user).not.toContain('advisor.colaberry.ai');
    expect(user).not.toMatch(/COHORT|seats remaining/i);
    expect(user).toContain('https://hire.refactored.ai/case-studies/x');
  });
  it('every other caller keeps the general rules unchanged', () => {
    const sys = buildSystemPrompt('email', base);
    expect(sys).toMatch(/Include a clear CTA/);
    expect(buildUserPromptForTests(base)).toContain('Booking/Strategy call');
  });
});
