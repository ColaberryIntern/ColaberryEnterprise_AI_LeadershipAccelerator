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
    const topPages = await sequelize.query(`SELECT page_path, COUNT(*) as c FROM page_events WHERE event_type = 'pageview' AND created_at >= '${weekStart}' GROUP BY page_path ORDER BY c DESC LIMIT 10`, { type: QueryTypes.SELECT }) as any[];
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

    // Build a modern HTML report from the same structured data (cards, tables, stat tiles).
    // The old version wrapped raw text in <pre> which looked like a 1999 terminal in Outlook.
    const pilotRows: string[] = [];
    for (const id of pilotIds) {
      const leads = leadsByCamp[id];
      if (!leads || !leads.length) continue;
      const ll = leads.join(',');
      const [s] = await sequelize.query(`SELECT COUNT(*) as c FROM scheduled_emails WHERE campaign_id = '${id}' AND status = 'sent'`, { type: QueryTypes.SELECT }) as any[];
      const [p] = await sequelize.query(`SELECT COUNT(*) as c FROM scheduled_emails WHERE campaign_id = '${id}' AND status = 'pending'`, { type: QueryTypes.SELECT }) as any[];
      const [o] = await sequelize.query(`SELECT COUNT(*) as c FROM interaction_outcomes WHERE outcome = 'opened' AND lead_id IN (${ll})`, { type: QueryTypes.SELECT }) as any[];
      const [cl] = await sequelize.query(`SELECT COUNT(*) as c FROM interaction_outcomes WHERE outcome = 'clicked' AND lead_id IN (${ll})`, { type: QueryTypes.SELECT }) as any[];
      const [bn] = await sequelize.query(`SELECT COUNT(*) as c FROM interaction_outcomes WHERE outcome = 'bounced' AND lead_id IN (${ll})`, { type: QueryTypes.SELECT }) as any[];
      const sN = parseInt(s.c), oN = parseInt(o.c), clN = parseInt(cl.c);
      const oPct = sN > 0 ? Math.round((oN / sN) * 100) : 0;
      const clPct = sN > 0 ? Math.round((clN / sN) * 100) : 0;
      pilotRows.push(`<tr><td style="padding:8px 12px;font-weight:700">${nameMap[id]}</td><td style="padding:8px 12px;text-align:right">${sN}</td><td style="padding:8px 12px;text-align:right;color:#64748b">${p.c}</td><td style="padding:8px 12px;text-align:right"><strong>${oN}</strong> <span style="color:#64748b">(${oPct}%)</span></td><td style="padding:8px 12px;text-align:right"><strong>${clN}</strong> <span style="color:#64748b">(${clPct}%)</span></td><td style="padding:8px 12px;text-align:right;color:#dc2626">${bn.c}</td></tr>`);
    }

    const totalOpenPct = totalSentPilot > 0 ? Math.round((totalOpensPilot / totalSentPilot) * 100) : 0;
    const totalClickPct = totalSentPilot > 0 ? Math.round((totalClicksPilot / totalSentPilot) * 100) : 0;

    const engagementTiles = engagementAll.map((e: any) => `<div style="background:#f8fafc;padding:14px;border-radius:8px;border:1px solid #e2e8f0;text-align:center"><div style="font-size:11px;letter-spacing:1.5px;text-transform:uppercase;color:#64748b;font-weight:700">${e.outcome}</div><div style="font-size:22px;font-weight:800;color:#1a365d;margin-top:4px">${e.c}</div></div>`).join('');

    const callsRows = calls.length > 0
      ? calls.map((c: any) => `<tr><td style="padding:8px 12px"><strong>${c.name}</strong></td><td style="padding:8px 12px;color:#64748b">${c.company || '?'}</td><td style="padding:8px 12px;font-size:12px">${c.email}</td><td style="padding:8px 12px"><span style="background:#dbeafe;color:#1e40af;padding:2px 8px;border-radius:999px;font-size:11px;font-weight:700">${c.status}</span></td></tr>`).join('')
      : `<tr><td colspan="4" style="padding:18px;text-align:center;color:#64748b;font-style:italic">No strategy calls booked this week</td></tr>`;

    const skoolCatRows = skoolByCat.map((c: any) => `<tr><td style="padding:6px 12px">${c.category}</td><td style="padding:6px 12px;text-align:right;font-weight:700">${c.c}</td></tr>`).join('');

    const pagesRows = topPages.length > 0
      ? topPages.map((p: any) => `<tr><td style="padding:6px 12px;font-family:monospace;font-size:12px">${p.page_path}</td><td style="padding:6px 12px;text-align:right;font-weight:700">${p.c}</td></tr>`).join('')
      : `<tr><td colspan="2" style="padding:14px;text-align:center;color:#64748b;font-style:italic">No tracked visits this week</td></tr>`;

    const htmlBody = `<!doctype html><html><body style="margin:0;padding:0;background:#f1f5f9">
<div style="max-width:720px;margin:0 auto;background:white;font-family:arial,sans-serif;color:#1a202c;line-height:1.55">

<div style="background:linear-gradient(135deg,#1a365d 0%,#2c5282 100%);color:white;padding:32px 28px">
<div style="font-size:11px;letter-spacing:3px;text-transform:uppercase;color:#bfdbfe;font-weight:700">📊 Weekly Report</div>
<div style="font-size:28px;font-weight:800;margin-top:6px;color:white">${weekLabel}</div>
<div style="font-size:13px;color:#cbd5e0;margin-top:4px">Colaberry Enterprise AI Division · Cory, AI COO</div>
</div>

<div style="padding:24px 28px">

<div style="display:flex;gap:12px;margin-bottom:24px;flex-wrap:wrap">
<div style="flex:1;min-width:140px;background:#1a365d;color:white;padding:16px;border-radius:8px;text-align:center">
<div style="font-size:11px;letter-spacing:1.5px;text-transform:uppercase;color:#bfdbfe;font-weight:700">Pilot Sent</div>
<div style="font-size:28px;font-weight:800;margin-top:4px">${totalSentPilot}</div>
</div>
<div style="flex:1;min-width:140px;background:#16a34a;color:white;padding:16px;border-radius:8px;text-align:center">
<div style="font-size:11px;letter-spacing:1.5px;text-transform:uppercase;color:#bbf7d0;font-weight:700">Opens</div>
<div style="font-size:28px;font-weight:800;margin-top:4px">${totalOpensPilot}</div>
<div style="font-size:12px;color:#bbf7d0">${totalOpenPct}%</div>
</div>
<div style="flex:1;min-width:140px;background:#2b6cb0;color:white;padding:16px;border-radius:8px;text-align:center">
<div style="font-size:11px;letter-spacing:1.5px;text-transform:uppercase;color:#dbeafe;font-weight:700">Clicks</div>
<div style="font-size:28px;font-weight:800;margin-top:4px">${totalClicksPilot}</div>
<div style="font-size:12px;color:#dbeafe">${totalClickPct}%</div>
</div>
<div style="flex:1;min-width:140px;background:#7c3aed;color:white;padding:16px;border-radius:8px;text-align:center">
<div style="font-size:11px;letter-spacing:1.5px;text-transform:uppercase;color:#e9d5ff;font-weight:700">Calls Booked</div>
<div style="font-size:28px;font-weight:800;margin-top:4px">${calls.length}</div>
</div>
</div>

<h2 style="font-size:18px;color:#1a365d;border-bottom:2px solid #cbd5e0;padding-bottom:8px;margin:24px 0 14px">🎯 Pilot Campaigns</h2>
<table cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;width:100%;font-size:13px;border:1px solid #e2e8f0;border-radius:8px;overflow:hidden">
<thead><tr style="background:#1a365d;color:white"><th align="left" style="padding:10px 12px">Campaign</th><th align="right" style="padding:10px 12px">Sent</th><th align="right" style="padding:10px 12px">Pending</th><th align="right" style="padding:10px 12px">Opens</th><th align="right" style="padding:10px 12px">Clicks</th><th align="right" style="padding:10px 12px">Bounced</th></tr></thead>
<tbody>${pilotRows.join('')}</tbody>
</table>

<h2 style="font-size:18px;color:#1a365d;border-bottom:2px solid #cbd5e0;padding-bottom:8px;margin:28px 0 14px">📧 All Campaigns - This Week</h2>
<div style="background:#f8fafc;padding:14px 18px;border-radius:8px;margin-bottom:14px"><strong style="font-size:15px;color:#1a365d">${totalSentAll.c}</strong> emails sent this week</div>
<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(110px,1fr));gap:10px">${engagementTiles}</div>

<h2 style="font-size:18px;color:#1a365d;border-bottom:2px solid #cbd5e0;padding-bottom:8px;margin:28px 0 14px">📞 Strategy Calls Booked</h2>
<table cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;width:100%;font-size:13px;border:1px solid #e2e8f0;border-radius:8px;overflow:hidden">
<thead><tr style="background:#1a365d;color:white"><th align="left" style="padding:10px 12px">Name</th><th align="left" style="padding:10px 12px">Company</th><th align="left" style="padding:10px 12px">Email</th><th align="left" style="padding:10px 12px">Status</th></tr></thead>
<tbody>${callsRows}</tbody>
</table>

<h2 style="font-size:18px;color:#1a365d;border-bottom:2px solid #cbd5e0;padding-bottom:8px;margin:28px 0 14px">🤖 Skool Autonomous Agent</h2>
<div style="display:grid;grid-template-columns:repeat(2,1fr);gap:10px;margin-bottom:14px">
<div style="background:#f8fafc;padding:12px;border-radius:6px;border:1px solid #e2e8f0"><div style="font-size:11px;letter-spacing:1.5px;text-transform:uppercase;color:#64748b;font-weight:700">Signals Detected</div><div style="font-size:22px;font-weight:800;color:#1a365d">${skoolSignals.c}</div></div>
<div style="background:#f8fafc;padding:12px;border-radius:6px;border:1px solid #e2e8f0"><div style="font-size:11px;letter-spacing:1.5px;text-transform:uppercase;color:#64748b;font-weight:700">Posts This Week</div><div style="font-size:22px;font-weight:800;color:#1a365d">${skoolPostedWeek.c}</div></div>
<div style="background:#f8fafc;padding:12px;border-radius:6px;border:1px solid #e2e8f0"><div style="font-size:11px;letter-spacing:1.5px;text-transform:uppercase;color:#64748b;font-weight:700">All-Time Posts</div><div style="font-size:22px;font-weight:800;color:#1a365d">${skoolPosted.c}</div></div>
<div style="background:#f8fafc;padding:12px;border-radius:6px;border:1px solid #e2e8f0"><div style="font-size:11px;letter-spacing:1.5px;text-transform:uppercase;color:#64748b;font-weight:700">Approved Queued</div><div style="font-size:22px;font-weight:800;color:#f59e0b">${skoolApproved.c}</div></div>
</div>
${skoolCatRows ? `<details><summary style="cursor:pointer;color:#2b6cb0;font-size:13px;font-weight:600">Posts by category</summary><table cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;width:100%;font-size:12px;margin-top:8px"><tbody>${skoolCatRows}</tbody></table></details>` : ''}

<h2 style="font-size:18px;color:#1a365d;border-bottom:2px solid #cbd5e0;padding-bottom:8px;margin:28px 0 14px">🌐 Landing Pages</h2>
<table cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;width:100%;font-size:13px;border:1px solid #e2e8f0;border-radius:8px;overflow:hidden">
<thead><tr style="background:#1a365d;color:white"><th align="left" style="padding:10px 12px">Page</th><th align="right" style="padding:10px 12px">Views</th></tr></thead>
<tbody>${pagesRows}</tbody>
</table>

<h2 style="font-size:18px;color:#1a365d;border-bottom:2px solid #cbd5e0;padding-bottom:8px;margin:28px 0 14px">⚙️ System Health</h2>
<div style="background:#dcfce7;border-left:4px solid #16a34a;padding:14px 18px;border-radius:4px;font-size:13px">
<strong>${activeAgents.c}</strong> active agents · <strong>${skoolAgentRuns.c}</strong> Skool agent runs total
</div>

</div>

<div style="background:#f8fafc;padding:14px 28px;font-size:11px;color:#64748b;text-align:center;border-top:1px solid #e2e8f0">
Generated automatically by Cory, AI COO · Colaberry Enterprise AI Division
</div>

</div>
</body></html>`;

    await transporter.sendMail({
      from: '"Cory - AI COO" <ali@colaberry.com>',
      to: 'ali@colaberry.com',
      cc: 'alimuwwakkil@gmail.com',
      subject: `[Weekly Report] ${weekLabel}`,
      text: report,
      html: htmlBody,
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
