/**
 * Weekly Report Agent
 *
 * Generates a comprehensive weekly overview of all major systems and
 * emails it to Ali every Sunday at 8 AM CT (13:00 UTC).
 *
 * Covers: Pilot campaigns, all campaigns, strategy calls, Skool agent,
 * landing pages, systems built, key metrics.
 */
import { Op } from 'sequelize';
import { sequelize } from '../../config/database';
import { QueryTypes } from 'sequelize';

const LOG_PREFIX = '[WeeklyReport]';

function getTransporter(): any {
  try {
    const nodemailer = require('nodemailer');
    return nodemailer.createTransport({
      host: process.env.SMTP_HOST || 'smtp.mandrillapp.com',
      port: parseInt(process.env.SMTP_PORT || '587'),
      auth: {
        user: process.env.SMTP_USER || process.env.MANDRILL_USER,
        pass: process.env.SMTP_PASS || process.env.MANDRILL_API_KEY,
      },
    });
  } catch {
    return null;
  }
}

export async function runWeeklyReport(): Promise<{ sent: boolean }> {
  console.log(`${LOG_PREFIX} Generating weekly report...`);

  const now = new Date();
  const weekStart = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const weekLabel = `${new Date(weekStart).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} - ${now.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`;

  try {
    // ─── PILOT CAMPAIGNS ───
    const pilotIds = [
      'c4e8640c-c163-496f-a41c-60c89ef1283e',
      '98c54979-4b24-46d9-b0f6-b036156d840e',
      'e5492834-8420-4543-9854-ff7ba88843b7',
    ];
    const nameMap: Record<string, string> = {
      'c4e8640c-c163-496f-a41c-60c89ef1283e': 'Zero Risk',
      '98c54979-4b24-46d9-b0f6-b036156d840e': 'AI Team',
      'e5492834-8420-4543-9854-ff7ba88843b7': 'Exclusive',
    };

    const pilotLeads = await sequelize.query(
      `SELECT lead_id, campaign_id FROM campaign_leads WHERE campaign_id IN ('${pilotIds.join("', '")}')`,
      { type: QueryTypes.SELECT }
    ) as any[];

    const leadsByCamp: Record<string, number[]> = {};
    pilotIds.forEach(id => leadsByCamp[id] = []);
    pilotLeads.forEach((r: any) => leadsByCamp[r.campaign_id]?.push(r.lead_id));

    let pilotSection = '';
    let totalSentPilot = 0, totalOpensPilot = 0, totalClicksPilot = 0;

    for (const id of pilotIds) {
      const leads = leadsByCamp[id];
      if (!leads || !leads.length) continue;
      const ll = leads.join(',');
      const [sent] = await sequelize.query(`SELECT COUNT(*) as c FROM scheduled_emails WHERE campaign_id = '${id}' AND status = 'sent'`, { type: QueryTypes.SELECT }) as any[];
      const [pending] = await sequelize.query(`SELECT COUNT(*) as c FROM scheduled_emails WHERE campaign_id = '${id}' AND status = 'pending'`, { type: QueryTypes.SELECT }) as any[];
      const [opens] = await sequelize.query(`SELECT COUNT(*) as c FROM interaction_outcomes WHERE outcome = 'opened' AND lead_id IN (${ll})`, { type: QueryTypes.SELECT }) as any[];
      const [clicks] = await sequelize.query(`SELECT COUNT(*) as c FROM interaction_outcomes WHERE outcome = 'clicked' AND lead_id IN (${ll})`, { type: QueryTypes.SELECT }) as any[];
      const [bounced] = await sequelize.query(`SELECT COUNT(*) as c FROM interaction_outcomes WHERE outcome = 'bounced' AND lead_id IN (${ll})`, { type: QueryTypes.SELECT }) as any[];
      const s = parseInt(sent.c), o = parseInt(opens.c), cl = parseInt(clicks.c);
      totalSentPilot += s; totalOpensPilot += o; totalClicksPilot += cl;
      pilotSection += `${nameMap[id]}: Sent=${s} Pending=${pending.c} Opens=${o}(${s > 0 ? ((o / s) * 100).toFixed(0) : 0}%) Clicks=${cl}(${s > 0 ? ((cl / s) * 100).toFixed(0) : 0}%) Bounced=${bounced.c}\n`;
    }

    // ─── ALL CAMPAIGNS ───
    const [totalSentAll] = await sequelize.query(`SELECT COUNT(*) as c FROM scheduled_emails WHERE status = 'sent' AND sent_at >= '${weekStart}'`, { type: QueryTypes.SELECT }) as any[];
    const engagementAll = await sequelize.query(`SELECT outcome, COUNT(*) as c FROM interaction_outcomes WHERE created_at >= '${weekStart}' GROUP BY outcome ORDER BY c DESC`, { type: QueryTypes.SELECT }) as any[];

    let engagementSection = '';
    engagementAll.forEach((e: any) => { engagementSection += `  ${e.outcome}: ${e.c}\n`; });

    // ─── STRATEGY CALLS ───
    const calls = await sequelize.query(`SELECT name, email, company, status, scheduled_at FROM strategy_calls WHERE created_at >= '${weekStart}' AND email != 'test@test.com' ORDER BY created_at DESC`, { type: QueryTypes.SELECT }) as any[];
    let callsSection = '';
    calls.forEach((c: any) => { callsSection += `  ${c.name} (${c.company || '?'}) | ${c.email} | ${c.status}\n`; });

    // ─── SKOOL ───
    const [skoolSignals] = await sequelize.query("SELECT COUNT(*) as c FROM skool_signals", { type: QueryTypes.SELECT }) as any[];
    const [skoolPosted] = await sequelize.query("SELECT COUNT(*) as c FROM skool_responses WHERE post_status = 'posted'", { type: QueryTypes.SELECT }) as any[];
    const [skoolPostedWeek] = await sequelize.query(`SELECT COUNT(*) as c FROM skool_responses WHERE post_status = 'posted' AND posted_at >= '${weekStart}'`, { type: QueryTypes.SELECT }) as any[];
    const [skoolApproved] = await sequelize.query("SELECT COUNT(*) as c FROM skool_responses WHERE post_status = 'approved'", { type: QueryTypes.SELECT }) as any[];
    const skoolByCat = await sequelize.query("SELECT category, COUNT(*) as c FROM skool_responses WHERE post_status = 'posted' GROUP BY category ORDER BY c DESC", { type: QueryTypes.SELECT }) as any[];
    const [skoolAgentRuns] = await sequelize.query("SELECT SUM(run_count) as c FROM ai_agents WHERE agent_name LIKE 'Skool%'", { type: QueryTypes.SELECT }) as any[];

    let skoolCatSection = '';
    skoolByCat.forEach((c: any) => { skoolCatSection += `  ${c.category}: ${c.c}\n`; });

    // ─── LANDING PAGES ───
    const topPages = await sequelize.query(`SELECT page_path, COUNT(*) as c FROM page_events WHERE created_at >= '${weekStart}' GROUP BY page_path ORDER BY c DESC LIMIT 10`, { type: QueryTypes.SELECT }) as any[];
    let pagesSection = '';
    topPages.forEach((p: any) => { pagesSection += `  ${p.page_path}: ${p.c}\n`; });

    // ─── AGENT FLEET ───
    const [activeAgents] = await sequelize.query("SELECT COUNT(*) as c FROM ai_agents WHERE enabled = true", { type: QueryTypes.SELECT }) as any[];

    // ─── BUILD THE REPORT ───
    const report = `
======================================================================
  WEEKLY REPORT: ${weekLabel}
  Colaberry Enterprise AI Division
======================================================================


PILOT CAMPAIGNS (3)
----------------------------------------------------------------------
${pilotSection}
TOTALS: Sent=${totalSentPilot} Opens=${totalOpensPilot}(${totalSentPilot > 0 ? ((totalOpensPilot / totalSentPilot) * 100).toFixed(0) : 0}%) Clicks=${totalClicksPilot}(${totalSentPilot > 0 ? ((totalClicksPilot / totalSentPilot) * 100).toFixed(0) : 0}%)


ALL CAMPAIGNS
----------------------------------------------------------------------
Emails sent this week: ${totalSentAll.c}

Engagement:
${engagementSection}

STRATEGY CALLS BOOKED: ${calls.length}
----------------------------------------------------------------------
${callsSection || '  None this week\n'}

SKOOL AUTONOMOUS AGENT
----------------------------------------------------------------------
Signals detected: ${skoolSignals.c}
Posts published (all time): ${skoolPosted.c}
Posts published (this week): ${skoolPostedWeek.c}
Approved queued: ${skoolApproved.c}
Agent runs (total): ${skoolAgentRuns.c}

By category:
${skoolCatSection}

LANDING PAGES (this week)
----------------------------------------------------------------------
${pagesSection || '  No tracked visits\n'}

SYSTEM HEALTH
----------------------------------------------------------------------
Active agents: ${activeAgents.c}
Skool agent runs: ${skoolAgentRuns.c}


======================================================================
  Generated automatically by Cory - AI COO
  Colaberry Enterprise AI Division
======================================================================
`.trim();

    // ─── SEND EMAIL ───
    const transporter = getTransporter();
    if (!transporter) {
      console.error(`${LOG_PREFIX} SMTP not configured`);
      return { sent: false };
    }

    await transporter.sendMail({
      from: '"Cory - AI COO" <ali@colaberry.com>',
      to: 'ali@colaberry.com',
      subject: `Weekly Report: ${weekLabel}`,
      text: report,
      headers: {
        'X-MC-Track': 'false',
        'X-MC-AutoText': 'false',
        // Prevent Inbox COS from classifying as AUTOMATION
        'X-Priority': '1',
        'Importance': 'high',
      },
    });

    console.log(`${LOG_PREFIX} Weekly report emailed to ali@colaberry.com`);
    return { sent: true };
  } catch (err: any) {
    console.error(`${LOG_PREFIX} Error:`, err.message);
    return { sent: false };
  }
}
