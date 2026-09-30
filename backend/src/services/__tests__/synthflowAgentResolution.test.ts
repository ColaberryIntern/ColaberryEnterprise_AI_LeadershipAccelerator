jest.mock('../../config/env', () => ({
  env: {
    // synthflowService transitively pulls in config/database, which constructs Sequelize
    // at module load. A mock carrying only the agent ids leaves databaseUrl undefined and
    // the suite dies before a single assertion runs, which is a confusing way to discover
    // that a pure function has an impure import chain.
    databaseUrl: 'postgres://user:pass@localhost:5432/test',
    nodeEnv: 'test',
    synthflowWelcomeAgentId: 'agent-welcome',
    synthflowInterestAgentId: 'agent-interest',
    synthflowCallbackAgentId: 'agent-callback',
    synthflowAiFlotationAgentId: 'agent-flotation',
  },
}));

import { resolveAgentId } from '../synthflowService';
import { env } from '../../config/env';

/**
 * Which agent speaks on the phone.
 *
 * The agent carries its own knowledge base server-side, so this is not a routing detail -
 * it decides what a stranger is told and on whose behalf. The case that matters is the
 * one where a slot is EMPTY, because every other route here degrades to a neighbour.
 */
describe('resolveAgentId', () => {
  const anyEnv = env as any;
  afterEach(() => {
    anyEnv.synthflowAiFlotationAgentId = 'agent-flotation';
    anyEnv.synthflowCallbackAgentId = 'agent-callback';
  });

  describe('the Colaberry agents, unchanged', () => {
    it('uses the welcome agent for a welcome call', () => {
      expect(resolveAgentId({ callType: 'welcome' })).toBe('agent-welcome');
    });

    it('uses the interest agent for an interest call', () => {
      expect(resolveAgentId({ callType: 'interest' })).toBe('agent-interest');
    });

    it('uses the callback agent for a callback', () => {
      expect(resolveAgentId({ callType: 'callback' })).toBe('agent-callback');
    });

    it('falls back to interest when the callback slot is unset', () => {
      // Existing behaviour, deliberately preserved: these agents all speak for the same
      // business, so a neighbour is an acceptable stand-in.
      anyEnv.synthflowCallbackAgentId = '';
      expect(resolveAgentId({ callType: 'callback' })).toBe('agent-interest');
    });
  });

  describe('AI Flotation', () => {
    it('uses its own agent', () => {
      expect(resolveAgentId({ callType: 'callback', brandSlug: 'ai-flotation' })).toBe('agent-flotation');
    });

    it('uses its own agent whatever the call type', () => {
      expect(resolveAgentId({ callType: 'interest', brandSlug: 'ai-flotation' })).toBe('agent-flotation');
      expect(resolveAgentId({ callType: 'welcome', brandSlug: 'ai-flotation' })).toBe('agent-flotation');
    });

    it('NEVER falls back to a Colaberry agent when unconfigured', () => {
      // THE assertion. An AI Flotation prospect answering the phone to a bootcamp agent,
      // speaking from a bootcamp knowledge base, is worse than no call at all - and it is
      // exactly what giving this brand its own agent was meant to prevent.
      anyEnv.synthflowAiFlotationAgentId = '';

      const resolved = resolveAgentId({ callType: 'callback', brandSlug: 'ai-flotation' });

      expect(resolved).toBe('');
      expect(resolved).not.toBe('agent-callback');
      expect(resolved).not.toBe('agent-interest');
      expect(resolved).not.toBe('agent-welcome');
    });

    it('an empty resolution is what makes the caller skip', () => {
      // triggerVoiceCall treats a falsy agent id as `skipped: no_agent_id` rather than
      // dialling. That deterministic no-op is the safety, so it is asserted here too.
      anyEnv.synthflowAiFlotationAgentId = '';
      expect(Boolean(resolveAgentId({ callType: 'callback', brandSlug: 'ai-flotation' }))).toBe(false);
    });
  });

  it('an unknown brand is treated as Colaberry, not as a failure', () => {
    // Other brands have no agent of their own yet. Falling through to the existing
    // behaviour keeps every current caller working unchanged.
    expect(resolveAgentId({ callType: 'callback', brandSlug: 'refactored' })).toBe('agent-callback');
  });
});
