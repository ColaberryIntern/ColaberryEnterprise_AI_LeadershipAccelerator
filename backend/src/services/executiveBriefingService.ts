// ─── Executive Briefing Service ──────────────────────────────────────────────
// Generates and delivers daily and weekly executive briefings combining
// digest data, alert intelligence, and agent fleet health.

import { compileDigestData } from './digestService';
import { getAlertStats } from './alertService';
import { AiAgent } from '../models';
import Ticket from '../models/Ticket';
import { Op } from 'sequelize';

// ─── Types ──────────────────────────────────────────────────────────────────

export interface ExecutiveBriefingData {
  generatedAt: Date;
  type: 'daily' | 'weekly';
  digest: any; // DigestData from digestService
  alertSummary: {
    openCount: number;
    criticalOpen: number;
    last24h: number;
    byType: Record<string, number>;
  };
  agentFleet: {
    total: number;
    healthy: number;
    errored: number;
    paused: number;
  };
  ticketSummary: {
    openCount: number;
    resolvedLast24h: number;
    criticalOpen: number;
  };
}

// ─── Compile Briefing Data ──────────────────────────────────────────────────

export async function compileExecutiveBriefing(
  type: 'daily' | 'weekly' = 'daily',
): Promise<ExecutiveBriefingData> {
  const cutoff24h = new Date(Date.now() - 24 * 60 * 60 * 1000);

  const [digest, alertSummary, agents, openTickets, resolvedTickets, criticalTickets] = await Promise.all([
    compileDigestData(type === 'daily' ? 'daily' : 'weekly'),
    getAlertStats().catch(() => ({ openCount: 0, criticalOpen: 0, last24h: 0, byType: {}, bySeverity: {}, byStatus: {} })),
    AiAgent.findAll({ attributes: ['status'] }),
    Ticket.count({ where: { status: { [Op.in]: ['backlog', 'todo', 'in_progress', 'in_review'] } } }),
    Ticket.count({ where: { status: 'done', completed_at: { [Op.gte]: cutoff24h } } }),
    Ticket.count({ where: { priority: 'critical', status: { [Op.in]: ['backlog', 'todo', 'in_progress'] } } }),
  ]);

  const agentStatuses = agents.map((a) => a.getDataValue('status'));

  return {
    generatedAt: new Date(),
    type,
    digest,
    alertSummary: {
      openCount: alertSummary.openCount,
      criticalOpen: alertSummary.criticalOpen,
      last24h: alertSummary.last24h,
      byType: alertSummary.byType,
    },
    agentFleet: {
      total: agents.length,
      healthy: agentStatuses.filter((s) => s === 'idle' || s === 'running').length,
      errored: agentStatuses.filter((s) => s === 'error').length,
      paused: agentStatuses.filter((s) => s === 'paused').length,
    },
    ticketSummary: {
      openCount: openTickets,
      resolvedLast24h: resolvedTickets,
      criticalOpen: criticalTickets,
    },
  };
}

// ─── Generate & Send Daily Briefing ─────────────────────────────────────────

export async function generateDailyBriefing(): Promise<void> {
  try {
    const data = await compileExecutiveBriefing('daily');
    const { sendBriefingEmail } = await import('./emailService');
    const { SystemSetting } = await import('../models');

    const setting = await SystemSetting.findOne({ where: { key: 'admin_notification_emails' } });
    const recipients = setting?.getDataValue('value')
      ? String(setting.getDataValue('value')).split(',').map((e: string) => e.trim()).filter(Boolean)
      : [];

    if (recipients.length === 0) {
      console.log('[Briefing] No admin email recipients configured. Skipping.');
      return;
    }

    for (const to of recipients) {
      await sendBriefingEmail(to, data).catch((err: any) => {
        console.error(`[Briefing] Email to ${to} failed:`, err.message);
      });
    }

    console.log(`[Briefing] Daily briefing sent to ${recipients.length} recipients`);
  } catch (err: any) {
    console.error('[Briefing] Failed to generate daily briefing:', err.message);
  }
}

// ─── Generate & Send Weekly Briefing ────────────────────────────────────────

export async function generateWeeklyStrategicBriefing(): Promise<void> {
  try {
    const data = await compileExecutiveBriefing('weekly');
    const { sendBriefingEmail } = await import('./emailService');
    const { SystemSetting } = await import('../models');

    const setting = await SystemSetting.findOne({ where: { key: 'admin_notification_emails' } });
    const recipients = setting?.getDataValue('value')
      ? String(setting.getDataValue('value')).split(',').map((e: string) => e.trim()).filter(Boolean)
      : [];

    for (const to of recipients) {
      await sendBriefingEmail(to, data).catch((err: any) => {
        console.error(`[Briefing] Weekly email to ${to} failed:`, err.message);
      });
    }

    console.log(`[Briefing] Weekly strategic briefing sent to ${recipients.length} recipients`);
  } catch (err: any) {
    console.error('[Briefing] Failed to generate weekly briefing:', err.message);
  }
}
