import { logAgentActivity } from '../../aiEventService';
import type { AgentExecutionResult, AgentAction } from '../types';

const AGENT_NAME = 'AdmissionsPageContextAgent';

// Page-specific conversation strategies
const PAGE_STRATEGIES: Record<string, { focus: string; suggestions: string[] }> = {
  homepage: {
    focus: 'Introduce the program value proposition and identify visitor interests',
    suggestions: ['What brings you to Colaberry today?', 'Are you interested in AI leadership for yourself or your team?'],
  },
  program: {
    focus: 'Provide curriculum details and highlight differentiation from other programs',
    suggestions: ['Which AI topics are most relevant to your role?', 'Would you like to know about our hands-on project work?'],
  },
  pricing: {
    focus: 'Contextualize the investment with ROI data and comparison anchoring',
    suggestions: ['Would you like to understand the ROI our participants typically see?', 'Have you explored our corporate sponsorship options?'],
  },
  enroll: {
    focus: 'Remove final objections and facilitate the enrollment process',
    suggestions: ['What questions do you have before getting started?', 'Would you prefer to discuss options on a quick strategy call?'],
  },
  sponsorship: {
    focus: 'Qualify enterprise opportunity: team size, budget, timeline',
    suggestions: ['How many team members are you considering?', 'What AI capabilities is your organization looking to build?'],
  },
  strategy_call_prep: {
    focus: 'Prepare visitor for a productive strategy call conversation',
    suggestions: ['What are your top priorities for the strategy call?', 'Would you like to review program details before your call?'],
  },
  case_studies: {
    focus: 'Leverage social proof and connect outcomes to visitor goals',
    suggestions: ['Which industry are you in? I can highlight relevant success stories.', 'What outcomes are most important to you?'],
  },
};

/**
 * Page-specific conversation strategy hints.
 * Trigger: on_demand.
 */
export async function runAdmissionsPageContextAgent(
  agentId: string,
  config: Record<string, any>,
): Promise<AgentExecutionResult> {
  const startTime = Date.now();
  const actions: AgentAction[] = [];
  const errors: string[] = [];

  try {
    const pageCategory = config.page_category || 'homepage';
    const strategy = PAGE_STRATEGIES[pageCategory] || PAGE_STRATEGIES.homepage;

    actions.push({
      campaign_id: '',
      action: 'page_context_provided',
      reason: `Strategy for ${pageCategory}: ${strategy.focus}`,
      confidence: 0.9,
      before_state: null,
      after_state: { page_category: pageCategory, ...strategy },
      result: 'success',
      entity_type: 'system',
      entity_id: agentId,
    });

    await logAgentActivity({
      agent_id: agentId,
      action: 'page_context_analysis',
      result: 'success',
      details: { page_category: pageCategory, focus: strategy.focus },
    }).catch(() => {});
  } catch (err: any) {
    errors.push(err.message);
  }

  return {
    agent_name: AGENT_NAME,
    campaigns_processed: 0,
    actions_taken: actions,
    errors,
    duration_ms: Date.now() - startTime,
    entities_processed: 1,
  };
}
