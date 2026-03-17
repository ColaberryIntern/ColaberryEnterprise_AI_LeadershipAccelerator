/**
 * Agent Governance Controller
 *
 * Admin endpoints for:
 * - Viewing/approving/rejecting proposed agent actions
 * - Activating pending dynamic agents
 * - Emergency stop / resume all agents
 * - Viewing agent write audit log
 */

import { Request, Response, NextFunction } from 'express';
import { Op } from 'sequelize';
import ProposedAgentAction from '../models/ProposedAgentAction';
import AgentWriteAudit from '../models/AgentWriteAudit';
import { ScheduledEmail, AiAgent } from '../models';
import { activatePendingAgent } from '../intelligence/agents/agentFactory';
import { emergencyStopAllAgents, resumeAgentsAfterStop, getAgentPermission } from '../services/agentPermissionService';
import { evaluateAllAgents } from '../services/agentResourceMonitor';
import { getProposalStats } from '../services/proposalCleanupService';
import { runSafetySweep } from '../services/agentSafetyAlertService';
import { logAiEvent } from '../services/aiEventService';

// ---------------------------------------------------------------------------
// Proposed Actions
// ---------------------------------------------------------------------------

/** GET /api/admin/agent-actions — list proposed agent actions */
export async function handleGetProposedActions(req: Request, res: Response, next: NextFunction) {
  try {
    const { status = 'pending', limit = 50, offset = 0, sort_by = 'priority' } = req.query;

    const where: Record<string, any> = {};
    if (status && status !== 'all') {
      where.status = status;
    }

    // Sort by priority_score (highest first) when requested, fallback to created_at
    const order: any[] = sort_by === 'priority'
      ? [['priority_score', 'DESC NULLS LAST'], ['created_at', 'DESC']]
      : [['created_at', 'DESC']];

    const { count, rows } = await ProposedAgentAction.findAndCountAll({
      where,
      order,
      limit: Math.min(Number(limit) || 50, 200),
      offset: Number(offset) || 0,
    });

    res.json({ total: count, proposals: rows });
  } catch (err) {
    next(err);
  }
}

/** POST /api/admin/agent-actions/:id/approve — approve and apply a proposed action */
export async function handleApproveProposal(req: Request, res: Response, next: NextFunction) {
  try {
    const id = req.params.id as string;
    const { notes } = req.body;
    const adminEmail = (req as any).admin?.email || 'unknown';

    const proposal = await ProposedAgentAction.findByPk(id);
    if (!proposal) return res.status(404).json({ error: 'Proposal not found' });
    if (proposal.status !== 'pending') return res.status(400).json({ error: `Proposal is already ${proposal.status}` });

    // Check expiry
    if (proposal.expires_at && new Date() > proposal.expires_at) {
      await proposal.update({ status: 'expired' });
      return res.status(400).json({ error: 'Proposal has expired' });
    }

    // Apply the proposed changes to the target record
    let applied = false;
    if (proposal.target_table === 'scheduled_emails') {
      const email = await ScheduledEmail.findByPk(proposal.target_id);
      if (email) {
        await email.update(proposal.proposed_changes);
        applied = true;
      }
    }

    await proposal.update({
      status: 'approved',
      reviewed_by: adminEmail,
      reviewed_at: new Date(),
      review_notes: notes || null,
      applied_at: applied ? new Date() : null,
    });

    await logAiEvent('agent_governance', 'proposal_approved', undefined, undefined, {
      proposal_id: id,
      agent_name: proposal.agent_name,
      action_type: proposal.action_type,
      reviewed_by: adminEmail,
      applied,
    });

    res.json({ success: true, applied, proposal });
  } catch (err) {
    next(err);
  }
}

/** POST /api/admin/agent-actions/:id/reject — reject a proposed action */
export async function handleRejectProposal(req: Request, res: Response, next: NextFunction) {
  try {
    const id = req.params.id as string;
    const { notes } = req.body;
    const adminEmail = (req as any).admin?.email || 'unknown';

    const proposal = await ProposedAgentAction.findByPk(id);
    if (!proposal) return res.status(404).json({ error: 'Proposal not found' });
    if (proposal.status !== 'pending') return res.status(400).json({ error: `Proposal is already ${proposal.status}` });

    await proposal.update({
      status: 'rejected',
      reviewed_by: adminEmail,
      reviewed_at: new Date(),
      review_notes: notes || null,
    });

    await logAiEvent('agent_governance', 'proposal_rejected', undefined, undefined, {
      proposal_id: id,
      agent_name: proposal.agent_name,
      action_type: proposal.action_type,
      reviewed_by: adminEmail,
    });

    res.json({ success: true, proposal });
  } catch (err) {
    next(err);
  }
}

// ---------------------------------------------------------------------------
// Proposal Impact Preview
// ---------------------------------------------------------------------------

/** GET /api/admin/agent-actions/:id/preview — preview the impact of approving a proposal */
export async function handleGetProposalPreview(req: Request, res: Response, next: NextFunction) {
  try {
    const id = req.params.id as string;
    const proposal = await ProposedAgentAction.findByPk(id);
    if (!proposal) return res.status(404).json({ error: 'Proposal not found' });

    // Resolve current state of the target record
    let currentRecord: Record<string, any> | null = null;
    if (proposal.target_table === 'scheduled_emails') {
      const email = await ScheduledEmail.findByPk(proposal.target_id);
      currentRecord = email ? email.toJSON() : null;
    }

    // Build field-by-field diff
    const fieldChanges: Array<{
      field: string;
      current_value: any;
      proposed_value: any;
      before_value: any;
      drift: boolean;
    }> = [];

    const proposedChanges = proposal.proposed_changes || {};
    const beforeState = proposal.before_state || {};

    for (const field of Object.keys(proposedChanges)) {
      const currentValue = currentRecord ? currentRecord[field] : undefined;
      const beforeValue = beforeState[field];
      const proposedValue = proposedChanges[field];

      // Drift = the current value no longer matches what the agent captured as before_state
      const drift = currentRecord !== null && JSON.stringify(currentValue) !== JSON.stringify(beforeValue);

      fieldChanges.push({
        field,
        current_value: currentValue,
        proposed_value: proposedValue,
        before_value: beforeValue,
        drift,
      });
    }

    const hasDrift = fieldChanges.some((f) => f.drift);

    res.json({
      proposal: {
        id: proposal.id,
        agent_name: proposal.agent_name,
        action_type: proposal.action_type,
        target_table: proposal.target_table,
        target_id: proposal.target_id,
        status: proposal.status,
        reason: proposal.reason,
        confidence: proposal.confidence,
        created_at: proposal.created_at,
        expires_at: proposal.expires_at,
      },
      target_record: currentRecord,
      field_changes: fieldChanges,
      has_drift: hasDrift,
      target_exists: currentRecord !== null,
    });
  } catch (err) {
    next(err);
  }
}

// ---------------------------------------------------------------------------
// Agent Activation
// ---------------------------------------------------------------------------

/** POST /api/admin/agents/:id/activate — activate a pending dynamic agent */
export async function handleActivateAgent(req: Request, res: Response, next: NextFunction) {
  try {
    const id = req.params.id as string;
    const agent = await activatePendingAgent(id);

    await logAiEvent('agent_governance', 'agent_activated', undefined, undefined, {
      agent_id: id,
      agent_name: agent.agent_name,
      activated_by: (req as any).admin?.email || 'unknown',
    });

    res.json({ success: true, agent });
  } catch (err: any) {
    if (err.message.includes('not found') || err.message.includes('Only dynamic')) {
      return res.status(400).json({ error: err.message });
    }
    next(err);
  }
}

/** GET /api/admin/agents/pending — list agents awaiting approval */
export async function handleGetPendingAgents(req: Request, res: Response, next: NextFunction) {
  try {
    const pending = await AiAgent.findAll({
      where: {
        agent_type: 'dynamic',
        enabled: false,
        status: 'paused',
      },
      order: [['created_at', 'DESC']],
    });

    // Filter to only those with pending_approval flag
    const pendingApproval = pending.filter((a: any) => a.config?.pending_approval === true);

    res.json({ agents: pendingApproval });
  } catch (err) {
    next(err);
  }
}

// ---------------------------------------------------------------------------
// Emergency Controls
// ---------------------------------------------------------------------------

/** POST /api/admin/agents/emergency-stop — disable ALL agents immediately */
export async function handleEmergencyStop(req: Request, res: Response, next: NextFunction) {
  try {
    const { reason } = req.body;
    if (!reason) return res.status(400).json({ error: 'Reason is required for emergency stop' });

    const adminEmail = (req as any).admin?.email || 'unknown';
    const count = await emergencyStopAllAgents(reason, adminEmail);

    await logAiEvent('agent_governance', 'emergency_stop', undefined, undefined, {
      agents_disabled: count,
      reason,
      stopped_by: adminEmail,
    });

    res.json({ success: true, agents_disabled: count, reason });
  } catch (err) {
    next(err);
  }
}

/** POST /api/admin/agents/resume — re-enable agents after emergency stop */
export async function handleResumeAgents(req: Request, res: Response, next: NextFunction) {
  try {
    const { agent_names } = req.body;
    const count = await resumeAgentsAfterStop(agent_names);

    await logAiEvent('agent_governance', 'agents_resumed', undefined, undefined, {
      agents_resumed: count,
      selective: !!agent_names,
      resumed_by: (req as any).admin?.email || 'unknown',
    });

    res.json({ success: true, agents_resumed: count });
  } catch (err) {
    next(err);
  }
}

// ---------------------------------------------------------------------------
// Write Audit
// ---------------------------------------------------------------------------

/** GET /api/admin/agent-audits — view agent write audit log */
export async function handleGetWriteAudits(req: Request, res: Response, next: NextFunction) {
  try {
    const { agent_name, was_allowed, limit = 50, offset = 0 } = req.query;

    const where: Record<string, any> = {};
    if (agent_name) where.agent_name = agent_name;
    if (was_allowed !== undefined) where.was_allowed = was_allowed === 'true';

    const { count, rows } = await AgentWriteAudit.findAndCountAll({
      where,
      order: [['created_at', 'DESC']],
      limit: Math.min(Number(limit) || 50, 200),
      offset: Number(offset) || 0,
    });

    res.json({ total: count, audits: rows });
  } catch (err) {
    next(err);
  }
}

// ---------------------------------------------------------------------------
// Permission Info
// ---------------------------------------------------------------------------

/** GET /api/admin/agent-permissions — view permission tiers for all classified agents */
export async function handleGetPermissions(req: Request, res: Response, next: NextFunction) {
  try {
    const agents = await AiAgent.findAll({
      attributes: ['id', 'agent_name', 'agent_type', 'category', 'enabled', 'status'],
      order: [['agent_name', 'ASC']],
    });

    const permissions = agents.map((a: any) => ({
      id: a.id,
      agent_name: a.agent_name,
      agent_type: a.agent_type,
      category: a.category,
      enabled: a.enabled,
      status: a.status,
      permission: getAgentPermission(a.agent_name),
    }));

    res.json({ agents: permissions });
  } catch (err) {
    next(err);
  }
}

// ---------------------------------------------------------------------------
// Agent Health Dashboard
// ---------------------------------------------------------------------------

/** GET /api/admin/agent-health — comprehensive agent health dashboard */
export async function handleGetAgentHealth(req: Request, res: Response, next: NextFunction) {
  try {
    const snapshots = await evaluateAllAgents(false);
    const proposalStats = await getProposalStats();

    // Compute risk level per agent
    const agents = snapshots.map((s) => {
      let risk_level: 'low' | 'medium' | 'high' | 'critical' = 'low';
      if (s.is_degraded) risk_level = 'high';
      if (s.error_rate > 0.5) risk_level = 'critical';
      else if (s.error_rate > 0.2 || s.avg_duration_ms > 20000) risk_level = 'medium';

      return {
        ...s,
        risk_level,
      };
    });

    // System-level summary
    const total = agents.length;
    const healthy = agents.filter((a) => a.risk_level === 'low').length;
    const degraded = agents.filter((a) => a.is_degraded).length;
    const critical = agents.filter((a) => a.risk_level === 'critical').length;
    const totalWritesLastHour = agents.reduce((sum, a) => sum + a.writes_last_hour, 0);
    const totalProposalsLastHour = agents.reduce((sum, a) => sum + a.proposals_last_hour, 0);
    const avgDuration = total > 0
      ? Math.round(agents.reduce((sum, a) => sum + a.avg_duration_ms, 0) / total)
      : 0;

    res.json({
      summary: {
        total_agents: total,
        healthy,
        degraded,
        critical,
        total_writes_last_hour: totalWritesLastHour,
        total_proposals_last_hour: totalProposalsLastHour,
        avg_execution_time_ms: avgDuration,
      },
      proposal_stats: proposalStats,
      agents,
    });
  } catch (err) {
    next(err);
  }
}

// ---------------------------------------------------------------------------
// Safety Alerts
// ---------------------------------------------------------------------------

/** GET /api/admin/agent-safety-alerts — run safety sweep and return active alerts */
export async function handleGetSafetyAlerts(req: Request, res: Response, next: NextFunction) {
  try {
    const alerts = await runSafetySweep();

    const criticalCount = alerts.filter((a) => a.severity === 'critical').length;
    const warningCount = alerts.filter((a) => a.severity === 'warning').length;

    res.json({
      total_alerts: alerts.length,
      critical: criticalCount,
      warnings: warningCount,
      alerts,
    });
  } catch (err) {
    next(err);
  }
}
