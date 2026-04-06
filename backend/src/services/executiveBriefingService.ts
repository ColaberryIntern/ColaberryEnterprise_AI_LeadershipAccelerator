// ─── Executive Briefing Service ──────────────────────────────────────────────
// Generates and delivers daily and weekly executive briefings combining
// digest data, alert intelligence, and agent fleet health.

import { compileDigestData } from './digestService';
import { getAlertStats } from './alertService';
import { AiAgent } from '../models';
import Ticket from '../models/Ticket';
import IntelligenceDecision from '../models/IntelligenceDecision';
import DepartmentReport from '../models/DepartmentReport';
import AgentTask from '../models/AgentTask';
import StrategicInitiative from '../models/StrategicInitiative';
import { Op } from 'sequelize';

// ─── Types ──────────────────────────────────────────────────────────────────

export interface CampaignMetrics {
  emailsSent: number;
  smsSent: number;
  callsMade: number;
  uniqueOpens: number;
  uniqueClicks: number;
  advisorClicks: number;
  replies: number;
  bookings: number;
  unsubscribes: number;
  openRate: string;
  clickRate: string;
  byCampaign: { type: string; sent: number }[];
  topClickers: { name: string; company: string; title: string; clicks: number }[];
  advisorVisitors: { name: string; company: string; pageviews: number }[];
  demoStarts: number;
  demoCompletes: number;
}

export interface ExecutiveBriefingData {
  generatedAt: Date;
  type: 'daily' | 'weekly';
  digest: any;
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
  strategicInsights: {
    count: number;
    critical: number;
    items: { problem: string; risk_tier: string; confidence: number }[];
  };
  departmentReports: {
    department: string;
    summary: string;
    health: string;
  }[];
  activeTasks: {
    total: number;
    completed: number;
    pending: number;
  };
  strategicInitiatives?: {
    total: number;
    proposed: number;
    in_progress: number;
    completed: number;
    recent: { title: string; type: string; priority: string; status: string }[];
  };
  campaignMetrics?: CampaignMetrics;
}

// ─── Compile Briefing Data ──────────────────────────────────────────────────

export async function compileExecutiveBriefing(
  type: 'daily' | 'weekly' = 'daily',
): Promise<ExecutiveBriefingData> {
  const cutoff24h = new Date(Date.now() - 24 * 60 * 60 * 1000);

  const lookback = type === 'daily' ? cutoff24h : new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

  const [digest, alertSummary, agents, openTickets, resolvedTickets, criticalTickets, insights, deptReports, taskCounts, initiativeData] = await Promise.all([
    compileDigestData(type === 'daily' ? 'daily' : 'weekly'),
    getAlertStats().catch(() => ({ openCount: 0, criticalOpen: 0, last24h: 0, byType: {}, bySeverity: {}, byStatus: {} })),
    AiAgent.findAll({ attributes: ['status'] }),
    Ticket.count({ where: { status: { [Op.in]: ['backlog', 'todo', 'in_progress', 'in_review'] } } }),
    Ticket.count({ where: { status: 'done', completed_at: { [Op.gte]: cutoff24h } } }),
    Ticket.count({ where: { priority: 'critical', status: { [Op.in]: ['backlog', 'todo', 'in_progress'] } } }),
    // Cory Brain data
    IntelligenceDecision.findAll({
      where: { timestamp: { [Op.gte]: lookback } },
      order: [['risk_score', 'DESC']],
      limit: 10,
    }).catch(() => [] as IntelligenceDecision[]),
    DepartmentReport.findAll({
      where: { created_at: { [Op.gte]: cutoff24h } },
      order: [['created_at', 'DESC']],
      limit: 20,
    }).catch(() => [] as DepartmentReport[]),
    AgentTask.findAll({
      attributes: ['status'],
      where: { created_at: { [Op.gte]: lookback } },
    }).catch(() => [] as AgentTask[]),
    StrategicInitiative.findAll({
      where: { created_at: { [Op.gte]: lookback } },
      order: [['created_at', 'DESC']],
      limit: 10,
    }).catch(() => [] as StrategicInitiative[]),
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
    // Cory Brain intelligence
    strategicInsights: {
      count: insights.length,
      critical: insights.filter((i) => i.risk_tier === 'risky' || i.risk_tier === 'dangerous').length,
      items: insights.map((i) => ({
        problem: i.problem_detected,
        risk_tier: i.risk_tier || 'safe',
        confidence: i.confidence_score || 0,
      })),
    },
    departmentReports: (() => {
      const seen = new Set<string>();
      return deptReports
        .filter((r) => { if (seen.has(r.department)) return false; seen.add(r.department); return true; })
        .map((r) => ({
          department: r.department,
          summary: r.summary,
          health: r.anomalies && (r.anomalies as any[]).length > 0 ? 'degraded' : 'healthy',
        }));
    })(),
    activeTasks: {
      total: taskCounts.length,
      completed: taskCounts.filter((t) => t.status === 'completed').length,
      pending: taskCounts.filter((t) => t.status === 'pending' || t.status === 'assigned').length,
    },
    strategicInitiatives: {
      total: initiativeData.length,
      proposed: initiativeData.filter((i) => i.status === 'proposed').length,
      in_progress: initiativeData.filter((i) => i.status === 'in_progress' || i.status === 'approved').length,
      completed: initiativeData.filter((i) => i.status === 'completed').length,
      recent: initiativeData.slice(0, 5).map((i) => ({
        title: i.title,
        type: i.initiative_type,
        priority: i.priority,
        status: i.status,
      })),
    },
    campaignMetrics: await compileCampaignMetrics(lookback),
  };
}

async function compileCampaignMetrics(since: Date): Promise<CampaignMetrics> {
  const { sequelize } = require('../config/database');
  const { QueryTypes } = require('sequelize');
  try {
    const [[emails], [sms], [calls], [opens], [clicks], [advClicks], [replies], [bookings], [unsubs], byCampaign, topClickers, advisorVisitors, [demoS], [demoC]] = await Promise.all([
      sequelize.query("SELECT COUNT(*) as cnt FROM scheduled_emails WHERE status='sent' AND sent_at >= :since", { replacements: { since }, type: QueryTypes.SELECT }),
      sequelize.query("SELECT COUNT(*) as cnt FROM communication_logs WHERE channel='sms' AND direction='outbound' AND created_at >= :since", { replacements: { since }, type: QueryTypes.SELECT }),
      sequelize.query("SELECT COUNT(*) as cnt FROM communication_logs WHERE channel='voice' AND direction='outbound' AND created_at >= :since", { replacements: { since }, type: QueryTypes.SELECT }),
      sequelize.query("SELECT COUNT(DISTINCT lead_id) as cnt FROM interaction_outcomes WHERE outcome='opened' AND created_at >= :since", { replacements: { since }, type: QueryTypes.SELECT }),
      sequelize.query("SELECT COUNT(DISTINCT lead_id) as cnt FROM interaction_outcomes WHERE outcome='clicked' AND created_at >= :since", { replacements: { since }, type: QueryTypes.SELECT }),
      sequelize.query("SELECT COUNT(DISTINCT lead_id) as cnt FROM interaction_outcomes WHERE outcome='clicked' AND created_at >= :since AND metadata::text LIKE '%advisor.colaberry.ai%'", { replacements: { since }, type: QueryTypes.SELECT }),
      sequelize.query("SELECT COUNT(*) as cnt FROM interaction_outcomes WHERE outcome='replied' AND created_at >= :since", { replacements: { since }, type: QueryTypes.SELECT }),
      sequelize.query("SELECT COUNT(*) as cnt FROM strategy_calls WHERE created_at >= :since", { replacements: { since }, type: QueryTypes.SELECT }),
      sequelize.query("SELECT COUNT(*) as cnt FROM leads WHERE status='unsubscribed' AND updated_at >= :since", { replacements: { since }, type: QueryTypes.SELECT }),
      sequelize.query("SELECT c.type, COUNT(*) as sent FROM scheduled_emails se JOIN campaigns c ON c.id = se.campaign_id WHERE se.status='sent' AND se.sent_at >= :since GROUP BY c.type ORDER BY sent DESC", { replacements: { since }, type: QueryTypes.SELECT }),
      sequelize.query("SELECT l.name, l.company, l.title, COUNT(*) as clicks FROM interaction_outcomes io JOIN leads l ON l.id = io.lead_id WHERE io.outcome='clicked' AND io.created_at >= :since GROUP BY l.name, l.company, l.title ORDER BY clicks DESC LIMIT 5", { replacements: { since }, type: QueryTypes.SELECT }),
      sequelize.query("SELECT l.name, l.company, COUNT(*) FILTER (WHERE pe.event_type='pageview') as pageviews FROM page_events pe JOIN visitors v ON v.id = pe.visitor_id JOIN leads l ON l.id = v.lead_id WHERE pe.page_url LIKE '%advisor.colaberry.ai%' AND pe.created_at >= :since GROUP BY l.name, l.company ORDER BY pageviews DESC LIMIT 5", { replacements: { since }, type: QueryTypes.SELECT }),
      sequelize.query("SELECT COUNT(*) as cnt FROM page_events WHERE event_type='demo_start' AND created_at >= :since", { replacements: { since }, type: QueryTypes.SELECT }),
      sequelize.query("SELECT COUNT(*) as cnt FROM page_events WHERE event_type='demo_complete' AND created_at >= :since", { replacements: { since }, type: QueryTypes.SELECT }),
    ]);
    const emailsSent = parseInt(emails.cnt);
    const uniqueOpens = parseInt(opens.cnt);
    const uniqueClicks = parseInt(clicks.cnt);
    return {
      emailsSent,
      smsSent: parseInt(sms.cnt),
      callsMade: parseInt(calls.cnt),
      uniqueOpens,
      uniqueClicks,
      advisorClicks: parseInt(advClicks.cnt),
      replies: parseInt(replies.cnt),
      bookings: parseInt(bookings.cnt),
      unsubscribes: parseInt(unsubs.cnt),
      openRate: emailsSent > 0 ? Math.round((uniqueOpens / emailsSent) * 100) + '%' : '0%',
      clickRate: emailsSent > 0 ? Math.round((uniqueClicks / emailsSent) * 100) + '%' : '0%',
      byCampaign: (byCampaign as any[]).map(r => ({ type: r.type, sent: parseInt(r.sent) })),
      topClickers: (topClickers as any[]).map(r => ({ name: r.name, company: r.company || '', title: r.title || '', clicks: parseInt(r.clicks) })),
      advisorVisitors: (advisorVisitors as any[]).map(r => ({ name: r.name, company: r.company || '', pageviews: parseInt(r.pageviews) })),
      demoStarts: parseInt(demoS.cnt),
      demoCompletes: parseInt(demoC.cnt),
    };
  } catch (err: any) {
    console.error('[Briefing] Campaign metrics failed:', err.message);
    return { emailsSent: 0, smsSent: 0, callsMade: 0, uniqueOpens: 0, uniqueClicks: 0, advisorClicks: 0, replies: 0, bookings: 0, unsubscribes: 0, openRate: '0%', clickRate: '0%', byCampaign: [], topClickers: [], advisorVisitors: [], demoStarts: 0, demoCompletes: 0 };
  }
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

// ─── Executive Awareness Digest ─────────────────────────────────────────────

export async function generateExecutiveDigest(period: 'morning' | 'evening'): Promise<void> {
  try {
    const { getExecutiveEvents, getUnreadBadge } = await import('./executiveAwarenessService');
    const { sendBriefingEmail } = await import('./emailService');
    const { SystemSetting } = await import('../models');

    const badge = await getUnreadBadge();
    if (badge.count === 0) {
      console.log(`[Briefing] No unread executive events for ${period} digest. Skipping.`);
      return;
    }

    const { events } = await getExecutiveEvents({ status: 'new', limit: 50 });

    // Build digest as a briefing data structure the email service can consume
    const digestData: ExecutiveBriefingData = {
      generatedAt: new Date(),
      type: 'daily',
      digest: {
        period,
        executiveEvents: events.map((e: any) => ({
          id: e.id,
          title: e.title,
          severity: e.severity,
          category: e.metadata?.executive_category || 'system',
          description: e.description,
          createdAt: e.created_at,
          clusterCount: e.metadata?.cluster_count || 1,
        })),
        unreadCount: badge.count,
        maxSeverity: badge.maxSeverity,
      },
      alertSummary: { openCount: badge.count, criticalOpen: 0, last24h: badge.count, byType: {} },
      agentFleet: { total: 0, healthy: 0, errored: 0, paused: 0 },
      ticketSummary: { openCount: 0, resolvedLast24h: 0, criticalOpen: 0 },
      strategicInsights: { count: 0, critical: 0, items: [] },
      departmentReports: [],
      activeTasks: { total: 0, completed: 0, pending: 0 },
    };

    const setting = await SystemSetting.findOne({ where: { key: 'admin_notification_emails' } });
    const recipients = setting?.getDataValue('value')
      ? String(setting.getDataValue('value')).split(',').map((e: string) => e.trim()).filter(Boolean)
      : [];

    if (recipients.length === 0) {
      console.log('[Briefing] No admin email recipients for executive digest. Skipping.');
      return;
    }

    for (const to of recipients) {
      await sendBriefingEmail(to, digestData).catch((err: any) => {
        console.error(`[Briefing] Executive digest email to ${to} failed:`, err.message);
      });
    }

    console.log(`[Briefing] Executive ${period} digest sent to ${recipients.length} recipients (${badge.count} events)`);
  } catch (err: any) {
    console.error(`[Briefing] Failed to generate executive ${period} digest:`, err.message);
  }
}
