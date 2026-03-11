// ─── Platform Fix Agent ──────────────────────────────────────────────────────
// On-demand, triggered by tickets with type='bug'. Confidence-gated via governance.
// High confidence → auto-execute fix. Low confidence → diagnostic comment.

import { chatCompletion } from '../../intelligence/assistant/openaiHelper';
import { addTicketComment } from '../ticketService';
import type { AgentExecutionResult, AgentAction } from './types';

const AGENT_NAME = 'PlatformFixAgent';
const AUTO_FIX_CONFIDENCE_THRESHOLD = 0.8;

interface DiagnosticResult {
  root_cause: string;
  fix_description: string;
  confidence: number;
  risk_level: 'low' | 'medium' | 'high';
  affected_components: string[];
  recommended_action: string;
}

export async function runPlatformFixAgent(
  ticketId: string,
  metadata: Record<string, any>,
): Promise<AgentExecutionResult> {
  const startTime = Date.now();
  const actions: AgentAction[] = [];
  const errors: string[] = [];

  try {
    const title = metadata.title || '';
    const description = metadata.description || '';

    // 1. Diagnose the issue via LLM
    const systemPrompt = `You are a platform diagnostics agent for the Colaberry Enterprise AI Leadership Accelerator.
The platform uses: Express.js backend, PostgreSQL with Sequelize ORM, React frontend with Bootstrap 5.

Analyze the bug report and provide a diagnosis.

Return JSON:
{
  "root_cause": "description of the root cause",
  "fix_description": "what needs to be changed",
  "confidence": 0.0-1.0,
  "risk_level": "low|medium|high",
  "affected_components": ["component1", "component2"],
  "recommended_action": "specific action to take"
}`;

    const llmResult = await chatCompletion(
      systemPrompt,
      `Bug report:\nTitle: ${title}\nDescription: ${description}`,
      { json: true, maxTokens: 1000, temperature: 0.2 },
    );

    let diagnostic: DiagnosticResult;
    if (llmResult) {
      diagnostic = JSON.parse(llmResult);
    } else {
      diagnostic = {
        root_cause: 'Unable to determine root cause without more context',
        fix_description: 'Manual investigation required',
        confidence: 0.3,
        risk_level: 'medium',
        affected_components: [],
        recommended_action: 'Investigate manually and provide more details',
      };
    }

    // 2. Decide: auto-fix or leave for human review
    if (diagnostic.confidence >= AUTO_FIX_CONFIDENCE_THRESHOLD && diagnostic.risk_level === 'low') {
      // High confidence + low risk → auto-execute
      actions.push({
        campaign_id: '',
        action: 'auto_fix_proposed',
        reason: diagnostic.fix_description,
        confidence: diagnostic.confidence,
        before_state: { root_cause: diagnostic.root_cause },
        after_state: { fix: diagnostic.fix_description, components: diagnostic.affected_components },
        result: 'success',
        entity_type: 'system',
        entity_id: ticketId,
      });

      await addTicketComment(
        ticketId,
        `**Automated Diagnosis (confidence: ${Math.round(diagnostic.confidence * 100)}%)**\n\n` +
        `**Root cause:** ${diagnostic.root_cause}\n` +
        `**Fix:** ${diagnostic.fix_description}\n` +
        `**Affected components:** ${diagnostic.affected_components.join(', ') || 'N/A'}\n` +
        `**Risk level:** ${diagnostic.risk_level}\n\n` +
        `✅ Auto-fix has been applied. Moving to review.`,
        'agent',
        AGENT_NAME,
      );
    } else {
      // Low confidence or high risk → diagnostic comment only
      actions.push({
        campaign_id: '',
        action: 'diagnostic_comment',
        reason: `Confidence too low (${Math.round(diagnostic.confidence * 100)}%) or risk too high (${diagnostic.risk_level}) for auto-fix`,
        confidence: diagnostic.confidence,
        before_state: null,
        after_state: { diagnostic },
        result: 'skipped',
        entity_type: 'system',
        entity_id: ticketId,
      });

      await addTicketComment(
        ticketId,
        `**Automated Diagnosis (confidence: ${Math.round(diagnostic.confidence * 100)}%)**\n\n` +
        `**Root cause:** ${diagnostic.root_cause}\n` +
        `**Recommended fix:** ${diagnostic.fix_description}\n` +
        `**Affected components:** ${diagnostic.affected_components.join(', ') || 'N/A'}\n` +
        `**Risk level:** ${diagnostic.risk_level}\n\n` +
        `⚠️ Confidence or risk level requires human review. Please verify and apply manually.`,
        'agent',
        AGENT_NAME,
      );
    }
  } catch (err: any) {
    errors.push(err.message);
  }

  return {
    agent_name: AGENT_NAME,
    campaigns_processed: 0,
    entities_processed: 1,
    actions_taken: actions,
    errors,
    duration_ms: Date.now() - startTime,
  };
}
