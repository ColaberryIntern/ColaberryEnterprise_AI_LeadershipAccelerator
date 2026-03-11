import { Lead } from '../models';
import DocumentDeliveryLog from '../models/DocumentDeliveryLog';
import AdmissionsMemory from '../models/AdmissionsMemory';

/**
 * Admissions Workflow Stages:
 * 1 - visitor_exploration: browsing, no form submitted
 * 2 - information_request: submitted info request form (has lead record)
 * 3 - executive_briefing: received executive briefing document
 * 4 - strategic_alignment_call: booked/completed strategy call
 * 5 - enrollment: enrolled
 */

export interface WorkflowStage {
  stage: number;
  stageName: string;
  completedSteps: string[];
}

const STAGE_NAMES: Record<number, string> = {
  1: 'visitor_exploration',
  2: 'information_request',
  3: 'executive_briefing',
  4: 'strategic_alignment_call',
  5: 'enrollment',
};

/**
 * Determine a visitor's current workflow stage based on their data.
 */
export async function getVisitorWorkflowStage(visitorId: string): Promise<WorkflowStage> {
  const completedSteps: string[] = [];
  let stage = 1; // default: exploration

  // Check if visitor has a lead record (information request completed)
  const memory = await AdmissionsMemory.findOne({ where: { visitor_id: visitorId } });
  const leadId = memory?.lead_id;

  if (leadId) {
    completedSteps.push('information_request');
    stage = 2;

    const lead = await Lead.findByPk(leadId);

    // Check if executive briefing was delivered
    const briefingDelivered = await DocumentDeliveryLog.findOne({
      where: { visitor_id: visitorId, document_type: 'executive_briefing' },
    });
    if (briefingDelivered) {
      completedSteps.push('executive_briefing');
      stage = 3;
    }

    // Check if strategy call was booked/completed
    if (lead) {
      const leadData = lead as any;
      const hasStrategyCall =
        leadData.status === 'strategy_call_scheduled' ||
        leadData.status === 'strategy_call_completed' ||
        leadData.status === 'enrolled';
      if (hasStrategyCall) {
        completedSteps.push('strategic_alignment_call');
        stage = 4;
      }

      // Check enrollment
      if (leadData.status === 'enrolled') {
        completedSteps.push('enrollment');
        stage = 5;
      }
    }
  }

  return {
    stage,
    stageName: STAGE_NAMES[stage] || 'visitor_exploration',
    completedSteps,
  };
}

/**
 * Check if a document can be delivered to a visitor based on workflow rules.
 *
 * Rules:
 * - Executive Briefing requires stage >= 2 (information_request completed)
 *   UNLESS previously delivered (re-send allowed)
 * - Other documents have no workflow restriction
 */
export async function canDeliverDocument(
  visitorId: string,
  documentType: string,
): Promise<{ allowed: boolean; reason: string }> {
  // Executive Briefing has workflow gate
  if (documentType === 'executive_briefing') {
    // Allow re-send if previously delivered
    const previousDelivery = await DocumentDeliveryLog.findOne({
      where: { visitor_id: visitorId, document_type: 'executive_briefing' },
    });
    if (previousDelivery) {
      return { allowed: true, reason: 'Re-sending previously delivered executive briefing' };
    }

    // Check workflow stage
    const { stage } = await getVisitorWorkflowStage(visitorId);
    if (stage < 2) {
      return {
        allowed: false,
        reason: 'Executive briefing requires information request form completion (visitor must have a lead record)',
      };
    }

    return { allowed: true, reason: 'Visitor has completed information request stage' };
  }

  // All other documents: no workflow restriction
  return { allowed: true, reason: 'No workflow restriction for this document type' };
}

/**
 * Advance a visitor's workflow stage. Currently this is derived from data state
 * rather than an explicit field, so this function is a placeholder for future
 * explicit stage tracking if needed.
 */
export async function advanceWorkflowStage(visitorId: string, _newStage: number): Promise<void> {
  // Workflow stage is currently computed from lead status and document delivery logs.
  // This function exists for future use if explicit stage tracking is needed.
  // For now, advancing the stage happens implicitly when:
  // - Lead record is created (stage 1 → 2)
  // - Executive briefing is delivered (stage 2 → 3)
  // - Strategy call is scheduled/completed (stage 3 → 4)
  // - Enrollment is completed (stage 4 → 5)
  void visitorId;
}
