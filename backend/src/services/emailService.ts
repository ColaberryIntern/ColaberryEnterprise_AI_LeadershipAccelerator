import nodemailer from 'nodemailer';
import { env } from '../config/env';
import { getTestOverrides, getSetting } from './settingsService';
import type { DigestData } from './digestService';

const transporter =
  env.smtpUser && env.smtpPass
    ? nodemailer.createTransport({
        host: env.smtpHost,
        port: env.smtpPort,
        secure: env.smtpPort === 465,
        auth: {
          user: env.smtpUser,
          pass: env.smtpPass,
        },
      })
    : null;

async function resolveEmailRecipient(
  intended: string,
  subject: string
): Promise<{ to: string; subject: string }> {
  try {
    const test = await getTestOverrides();
    if (test.enabled && test.email) {
      console.log(`[Email] TEST MODE: redirecting from ${intended} to ${test.email}`);
      return { to: test.email, subject: `[TEST \u2192 ${intended}] ${subject}` };
    }
  } catch {
    // If settings DB fails, don't block email sending
  }
  return { to: intended, subject };
}

async function getAdminRecipients(): Promise<string> {
  try {
    const adminEmails = await getSetting('admin_notification_emails');
    if (adminEmails && adminEmails.trim()) return adminEmails.trim();
  } catch {
    // Fall back to env.emailFrom
  }
  return env.emailFrom;
}

function htmlToPlainText(html: string): string {
  return html
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n\n')
    .replace(/<\/li>/gi, '\n')
    .replace(/<li[^>]*>/gi, '  - ')
    .replace(/<\/h[1-6]>/gi, '\n\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&rarr;/g, '->')
    .replace(/&mdash;/g, '--')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function emailHeaders(tag: string) {
  return {
    'List-Unsubscribe': `<mailto:${env.emailFrom}?subject=unsubscribe>`,
    'X-MC-Tags': tag,
  };
}

interface EnrollmentConfirmationData {
  to: string;
  fullName: string;
  cohortName: string;
  startDate: string;
  coreDay: string;
  coreTime: string;
  optionalLabDay?: string;
}

export async function sendEnrollmentConfirmation(data: EnrollmentConfirmationData): Promise<void> {
  if (!transporter) {
    console.warn('[Email] SMTP not configured (SMTP_USER/SMTP_PASS missing). Skipping email to:', data.to);
    console.log('[Email] Would have sent enrollment confirmation to:', data.to, 'for cohort:', data.cohortName);
    return;
  }

  const r = await resolveEmailRecipient(data.to, 'Welcome to the Enterprise AI Leadership Accelerator');
  const html = buildConfirmationHtml(data);
  const info = await transporter.sendMail({
    from: `"Colaberry Enterprise AI" <${env.emailFrom}>`,
    replyTo: `"Colaberry Enterprise AI" <${env.emailFrom}>`,
    to: r.to,
    subject: r.subject,
    html,
    text: htmlToPlainText(html),
    headers: emailHeaders('enrollment-confirmation'),
  });

  console.log(`[Email] Enrollment confirmation sent to: ${r.to} | msgId: ${info.messageId} | accepted: ${info.accepted} | rejected: ${info.rejected}`);
}

interface InterestEmailData {
  to: string;
  fullName: string;
}

export async function sendInterestEmail(data: InterestEmailData): Promise<string> {
  const html = buildInterestHtml(data);
  if (!transporter) {
    console.warn('[Email] SMTP not configured. Skipping interest email to:', data.to);
    return html;
  }

  const r = await resolveEmailRecipient(data.to, 'Your Enterprise AI Leadership Accelerator Details');
  const info = await transporter.sendMail({
    from: `"Colaberry Enterprise AI" <${env.emailFrom}>`,
    replyTo: `"Colaberry Enterprise AI" <${env.emailFrom}>`,
    to: r.to,
    subject: r.subject,
    html,
    text: htmlToPlainText(html),
    headers: emailHeaders('interest-email'),
  });

  console.log(`[Email] Interest email sent to: ${r.to} | msgId: ${info.messageId} | accepted: ${info.accepted} | rejected: ${info.rejected}`);
  return html;
}

interface ExecutiveOverviewEmailData {
  to: string;
  fullName: string;
}

export async function sendExecutiveOverviewEmail(data: ExecutiveOverviewEmailData): Promise<string> {
  const html = buildExecutiveOverviewHtml(data);
  if (!transporter) {
    console.warn('[Email] SMTP not configured. Skipping executive overview email to:', data.to);
    return html;
  }

  const r = await resolveEmailRecipient(data.to, 'Your Executive AI Overview + ROI Framework');
  const info = await transporter.sendMail({
    from: `"Colaberry Enterprise AI" <${env.emailFrom}>`,
    replyTo: `"Colaberry Enterprise AI" <${env.emailFrom}>`,
    to: r.to,
    subject: r.subject,
    html,
    text: htmlToPlainText(html),
    headers: emailHeaders('executive-overview'),
  });

  console.log(`[Email] Executive overview email sent to: ${r.to} | msgId: ${info.messageId} | accepted: ${info.accepted} | rejected: ${info.rejected}`);
  return html;
}

interface HighIntentAlertData {
  name: string;
  company: string;
  title: string;
  email: string;
  phone: string;
  score: number;
  source: string;
}

export async function sendHighIntentAlert(data: HighIntentAlertData): Promise<void> {
  if (!transporter) {
    console.warn('[Email] SMTP not configured. Skipping high-intent alert for:', data.name);
    return;
  }

  const alertTo = await getAdminRecipients();
  const r = await resolveEmailRecipient(alertTo, `High-Intent Executive Lead: ${data.name} (Score: ${data.score})`);

  const html = buildHighIntentAlertHtml(data);
  const info = await transporter.sendMail({
    from: `"Colaberry Lead Alert" <${env.emailFrom}>`,
    replyTo: `"Colaberry Enterprise AI" <${env.emailFrom}>`,
    to: r.to,
    subject: r.subject,
    html,
    text: htmlToPlainText(html),
    headers: emailHeaders('high-intent-alert'),
  });

  console.log(`[Email] High-intent alert sent for: ${data.name} (score: ${data.score}) | msgId: ${info.messageId} | accepted: ${info.accepted} | rejected: ${info.rejected}`);
}

interface StrategyCallConfirmationData {
  to: string;
  name: string;
  scheduledAt: Date;
  timezone: string;
  meetLink: string;
  prepToken?: string;
}

export async function sendStrategyCallConfirmation(data: StrategyCallConfirmationData): Promise<string> {
  const html = buildStrategyCallConfirmationHtml(data);

  if (!transporter) {
    console.warn('[Email] SMTP not configured. Skipping strategy call confirmation to:', data.to);
    return html;
  }

  const r = await resolveEmailRecipient(data.to, 'Your Executive AI Strategy Call is Confirmed');
  const info = await transporter.sendMail({
    from: `"Colaberry Enterprise AI" <${env.emailFrom}>`,
    replyTo: `"Colaberry Enterprise AI" <${env.emailFrom}>`,
    to: r.to,
    subject: r.subject,
    html,
    text: htmlToPlainText(html),
    headers: emailHeaders('strategy-call-confirmation'),
  });

  console.log(`[Email] Strategy call confirmation sent to: ${r.to} | msgId: ${info.messageId} | accepted: ${info.accepted} | rejected: ${info.rejected}`);
  return html;
}

export function buildStrategyCallConfirmationHtml(data: StrategyCallConfirmationData): string {
  const dateOptions: Intl.DateTimeFormatOptions = {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZone: data.timezone,
    timeZoneName: 'short',
  };
  const formattedDate = new Intl.DateTimeFormat('en-US', dateOptions).format(data.scheduledAt);

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body { font-family: 'Segoe UI', system-ui, sans-serif; color: #2d3748; line-height: 1.6; max-width: 600px; margin: 0 auto; padding: 20px; }
    h1 { color: #1a365d; font-size: 24px; }
    .highlight { background: #f7fafc; border-left: 4px solid #1a365d; padding: 16px 20px; margin: 16px 0; border-radius: 0 8px 8px 0; }
    .cta { display: inline-block; background: #1a365d; color: #ffffff; padding: 14px 28px; border-radius: 6px; text-decoration: none; font-weight: 600; margin: 16px 0; }
    .footer { margin-top: 32px; padding-top: 16px; border-top: 1px solid #e2e8f0; font-size: 14px; color: #718096; }
  </style>
</head>
<body>
  <h1>Your Strategy Call is Confirmed</h1>

  <p>Dear ${data.name},</p>

  <p>Thank you for scheduling an Executive AI Strategy Call with Colaberry. Here are your call details:</p>

  <div class="highlight">
    <strong>Date & Time:</strong> ${formattedDate}<br>
    <strong>Duration:</strong> 30 minutes<br>
    <strong>Format:</strong> ${data.meetLink ? 'Google Meet (video call)' : 'Video call — meeting link will be sent separately'}
  </div>

  ${data.meetLink ? `<p><a href="${data.meetLink}" class="cta">Join Google Meet</a></p>` : ''}

  <p><strong>What to expect:</strong></p>
  <ul>
    <li>A focused discussion on your organization's AI readiness</li>
    <li>Architecture-first approach to AI deployment</li>
    <li>Personalized recommendations for your team's next steps</li>
  </ul>

  ${data.prepToken ? `<p><a href="${env.frontendUrl}/strategy-call-prep?token=${data.prepToken}" class="cta" style="background: #38a169;">Prepare for Your Call (5 min)</a></p>
  <p style="font-size: 14px; color: #718096;">Completing your prep form helps us personalize your strategy session and make the most of your 30 minutes.</p>` : ''}

  <p>If you need to reschedule, please reply to this email directly.</p>

  <div class="footer">
    <p><strong>Ali Merchant</strong><br>
    Colaberry Enterprise AI Division<br>
    AI Leadership | Architecture | Implementation | Advisory</p>
  </div>
</body>
</html>
  `.trim();
}

export interface IntelligenceBriefData {
  name: string;
  email: string;
  company: string;
  completionScore: number;
  aiMaturity: string;
  timeline: string;
  challenges: string[];
  tools: string[];
  budgetRange: string;
  evaluatingConsultants: boolean;
  priorityUseCase: string;
  specificQuestions: string;
  uploadedFileName: string | null;
  aiSynthesis: string | null;
  aiConfidenceScore: number | null;
  aiRecommendedFocus: string[] | null;
  leadId: number | null;
}

export async function sendIntelligenceBrief(data: IntelligenceBriefData): Promise<void> {
  if (!transporter) {
    console.warn('[Email] SMTP not configured. Skipping intelligence brief for:', data.name);
    return;
  }

  const alertTo = await getAdminRecipients();
  const r = await resolveEmailRecipient(alertTo, `Strategy Call Prep: ${data.name} (${data.company || 'No Company'}) \u2014 Score: ${data.completionScore}%`);

  const html = buildIntelligenceBriefHtml(data);
  const info = await transporter.sendMail({
    from: `"Colaberry Strategy Intel" <${env.emailFrom}>`,
    replyTo: `"Colaberry Enterprise AI" <${env.emailFrom}>`,
    to: r.to,
    subject: r.subject,
    html,
    text: htmlToPlainText(html),
    headers: emailHeaders('intelligence-brief'),
  });

  console.log(`[Email] Intelligence brief sent for: ${data.name} | msgId: ${info.messageId} | accepted: ${info.accepted} | rejected: ${info.rejected}`);
}

function buildIntelligenceBriefHtml(data: IntelligenceBriefData): string {
  const scoreBg = data.completionScore >= 60 ? '#38a169' : data.completionScore >= 30 ? '#dd6b20' : '#e53e3e';
  const confidenceBg = (data.aiConfidenceScore || 0) >= 70 ? '#38a169' : (data.aiConfidenceScore || 0) >= 40 ? '#dd6b20' : '#e53e3e';

  let synthesisHtml = '';
  if (data.aiSynthesis) {
    try {
      const synth = JSON.parse(data.aiSynthesis);
      synthesisHtml = `
      <h2 style="color: #1a365d; font-size: 18px; margin-top: 24px;">AI Synthesis</h2>
      <div class="card">
        <div style="margin-bottom: 12px;">
          <strong>Executive Summary:</strong><br>${synth.executive_summary || 'N/A'}
        </div>
        ${synth.pain_points?.length ? `<div style="margin-bottom: 12px;"><strong>Pain Points:</strong><ul>${synth.pain_points.map((p: string) => `<li>${p}</li>`).join('')}</ul></div>` : ''}
        ${synth.recommended_topics?.length ? `<div style="margin-bottom: 12px;"><strong>Recommended Topics:</strong><ul>${synth.recommended_topics.map((t: string) => `<li>${t}</li>`).join('')}</ul></div>` : ''}
        <div style="margin-bottom: 12px;">
          <strong>Opportunity Assessment:</strong><br>${synth.opportunity_assessment || 'N/A'}
        </div>
        <div style="margin-bottom: 12px;">
          <strong>Suggested Approach:</strong><br>${synth.suggested_approach || 'N/A'}
        </div>
        ${synth.red_flags?.length ? `<div style="margin-bottom: 12px;"><strong style="color: #e53e3e;">Red Flags:</strong><ul>${synth.red_flags.map((r: string) => `<li>${r}</li>`).join('')}</ul></div>` : ''}
      </div>`;
    } catch {
      synthesisHtml = `<h2 style="color: #1a365d; font-size: 18px;">AI Synthesis</h2><div class="card"><p>${data.aiSynthesis}</p></div>`;
    }
  }

  const adminUrl = data.leadId ? `${env.frontendUrl}/admin/leads/${data.leadId}` : '';

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body { font-family: 'Segoe UI', system-ui, sans-serif; color: #2d3748; line-height: 1.6; max-width: 650px; margin: 0 auto; padding: 20px; }
    h1 { color: #1a365d; font-size: 22px; }
    h2 { color: #1a365d; font-size: 18px; margin-top: 24px; }
    .card { background: #f8f9fa; border: 1px solid #dee2e6; border-radius: 8px; padding: 16px; margin: 12px 0; }
    .badge { display: inline-block; color: white; padding: 3px 10px; border-radius: 12px; font-weight: bold; font-size: 14px; }
    .field { margin-bottom: 6px; }
    .field-label { color: #6c757d; font-size: 12px; text-transform: uppercase; letter-spacing: 0.5px; }
    .field-value { font-size: 15px; }
    .pill { display: inline-block; background: #e2e8f0; padding: 2px 8px; border-radius: 10px; font-size: 13px; margin: 2px; }
    ul { padding-left: 20px; }
    li { margin-bottom: 4px; }
  </style>
</head>
<body>
  <h1>Strategy Call Intelligence Brief</h1>

  <div style="display: flex; gap: 12px; margin-bottom: 16px;">
    <span class="badge" style="background: ${scoreBg};">Prep: ${data.completionScore}%</span>
    ${data.aiConfidenceScore !== null ? `<span class="badge" style="background: ${confidenceBg};">AI Confidence: ${data.aiConfidenceScore}%</span>` : ''}
    <span class="badge" style="background: #1a365d;">${data.aiMaturity || 'Unknown'}</span>
  </div>

  <div class="card">
    <div class="field">
      <div class="field-label">Name</div>
      <div class="field-value"><strong>${data.name}</strong></div>
    </div>
    <div class="field">
      <div class="field-label">Company</div>
      <div class="field-value">${data.company || 'Not provided'}</div>
    </div>
    <div class="field">
      <div class="field-label">Email</div>
      <div class="field-value"><a href="mailto:${data.email}">${data.email}</a></div>
    </div>
    <div class="field">
      <div class="field-label">Timeline</div>
      <div class="field-value">${data.timeline || 'Not specified'}</div>
    </div>
    <div class="field">
      <div class="field-label">Budget</div>
      <div class="field-value">${data.budgetRange || 'Not specified'} ${data.evaluatingConsultants ? '| Evaluating consultants' : ''}</div>
    </div>
    ${data.uploadedFileName ? `<div class="field"><div class="field-label">Uploaded Document</div><div class="field-value">${data.uploadedFileName}</div></div>` : ''}
  </div>

  <h2>Challenges</h2>
  <div>${data.challenges.map(c => `<span class="pill">${c}</span>`).join(' ')}</div>

  <h2>Current Tools</h2>
  <div>${data.tools.length > 0 ? data.tools.map(t => `<span class="pill">${t}</span>`).join(' ') : '<em>None listed</em>'}</div>

  ${data.priorityUseCase ? `<h2>Priority Use Case</h2><div class="card"><p>${data.priorityUseCase}</p></div>` : ''}

  ${data.specificQuestions ? `<h2>Questions for the Call</h2><div class="card"><p>${data.specificQuestions}</p></div>` : ''}

  ${data.aiRecommendedFocus?.length ? `<h2>Recommended Focus Areas</h2><div>${data.aiRecommendedFocus.map(f => `<span class="pill" style="background: #1a365d; color: white;">${f}</span>`).join(' ')}</div>` : ''}

  ${synthesisHtml}

  ${adminUrl ? `<p style="margin-top: 24px;"><a href="${adminUrl}" style="color: #1a365d; font-weight: 600;">View Lead in Admin Dashboard &rarr;</a></p>` : ''}
</body>
</html>
  `.trim();
}

function buildExecutiveOverviewHtml(data: ExecutiveOverviewEmailData): string {
  const enrollUrl = env.frontendUrl + '/enroll';
  const contactUrl = env.frontendUrl + '/contact';
  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body { font-family: 'Segoe UI', system-ui, sans-serif; color: #2d3748; line-height: 1.6; max-width: 600px; margin: 0 auto; padding: 20px; }
    h1 { color: #1a365d; font-size: 24px; }
    h2 { color: #1a365d; font-size: 18px; margin-top: 24px; }
    .highlight { background: #f7fafc; border-left: 4px solid #1a365d; padding: 16px 20px; margin: 16px 0; border-radius: 0 8px 8px 0; }
    ul { padding-left: 20px; }
    li { margin-bottom: 8px; }
    .cta { display: inline-block; background: #1a365d; color: #ffffff; padding: 14px 28px; border-radius: 6px; text-decoration: none; font-weight: 600; margin: 16px 0; }
    .urgency { background: #fff3cd; border: 1px solid #ffc107; padding: 12px 16px; border-radius: 6px; margin: 16px 0; }
    .footer { margin-top: 32px; padding-top: 16px; border-top: 1px solid #e2e8f0; font-size: 14px; color: #718096; }
  </style>
</head>
<body>
  <h1>Your Executive AI Overview + ROI Framework</h1>

  <p>Dear ${data.fullName},</p>

  <p>Thank you for downloading the Executive AI Leadership Accelerator overview. Here's everything you need to evaluate this program for your organization.</p>

  <h2>Program at a Glance</h2>
  <div class="highlight">
    <strong>Format:</strong> 5-Day Executive AI Build Accelerator<br>
    <strong>Designed For:</strong> Directors, VPs, CTOs, and Technical Leaders<br>
    <strong>Investment:</strong> $4,500 per participant<br>
    <strong>Outcome:</strong> Working AI POC + Executive Deck + 90-Day Roadmap
  </div>

  <h2>What's Inside the Executive Overview</h2>
  <ul>
    <li><strong>ROI Framework:</strong> Calculate projected savings from internal AI capability vs. consulting engagements</li>
    <li><strong>Case Studies:</strong> Real enterprise implementations with measurable outcomes</li>
    <li><strong>Executive Templates:</strong> Board presentation deck, budget justification, and vendor evaluation frameworks</li>
    <li><strong>Program Curriculum:</strong> Day-by-day breakdown of what participants build</li>
  </ul>

  <h2>Why Leaders Choose This Program</h2>
  <ul>
    <li>Build a working AI Proof of Concept scoped to your organization — not toy demos</li>
    <li>Leave with an executive-ready presentation for stakeholder buy-in</li>
    <li>Design a 90-Day AI expansion roadmap with measurable milestones</li>
    <li>Access ongoing Enterprise AI Advisory Labs post-program</li>
  </ul>

  <div class="urgency">
    <strong>Next Cohort:</strong> Limited to 15 participants for personalized instruction. Seats are filling — secure your spot before enrollment closes.
  </div>

  <p><a href="${contactUrl}" class="cta">Schedule a 15-Minute Strategy Call</a></p>

  <p>Want to enroll directly? <a href="${enrollUrl}">Enroll now</a> to reserve your seat.</p>

  <p>Questions? Reply directly to this email — I read every response personally.</p>

  <div class="footer">
    <p><strong>Ali Merchant</strong><br>
    Colaberry Enterprise AI Division<br>
    AI Leadership | Architecture | Implementation | Advisory</p>
  </div>
</body>
</html>
  `.trim();
}

function buildHighIntentAlertHtml(data: HighIntentAlertData): string {
  const scoreBadgeColor = data.score > 80 ? '#dc3545' : data.score > 60 ? '#fd7e14' : '#6c757d';
  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body { font-family: 'Segoe UI', system-ui, sans-serif; color: #2d3748; line-height: 1.6; max-width: 600px; margin: 0 auto; padding: 20px; }
    h1 { color: #dc3545; font-size: 22px; }
    .card { background: #f8f9fa; border: 1px solid #dee2e6; border-radius: 8px; padding: 20px; margin: 16px 0; }
    .score-badge { display: inline-block; background: ${scoreBadgeColor}; color: white; padding: 4px 12px; border-radius: 20px; font-weight: bold; font-size: 18px; }
    .field { margin-bottom: 8px; }
    .field-label { color: #6c757d; font-size: 13px; text-transform: uppercase; letter-spacing: 0.5px; }
    .field-value { font-size: 16px; font-weight: 500; }
    .action { background: #fff3cd; border: 1px solid #ffc107; padding: 12px 16px; border-radius: 6px; margin-top: 16px; }
  </style>
</head>
<body>
  <h1>High-Intent Executive Lead</h1>
  <p>A high-scoring lead just submitted the Executive Overview form. Immediate follow-up recommended.</p>

  <div class="card">
    <div style="text-align: center; margin-bottom: 16px;">
      <span class="score-badge">Score: ${data.score}</span>
    </div>
    <div class="field">
      <div class="field-label">Name</div>
      <div class="field-value">${data.name}</div>
    </div>
    <div class="field">
      <div class="field-label">Company</div>
      <div class="field-value">${data.company || 'Not provided'}</div>
    </div>
    <div class="field">
      <div class="field-label">Title</div>
      <div class="field-value">${data.title || 'Not provided'}</div>
    </div>
    <div class="field">
      <div class="field-label">Email</div>
      <div class="field-value"><a href="mailto:${data.email}">${data.email}</a></div>
    </div>
    <div class="field">
      <div class="field-label">Phone</div>
      <div class="field-value">${data.phone || 'Not provided'}</div>
    </div>
    <div class="field">
      <div class="field-label">Source</div>
      <div class="field-value">${data.source || 'website'}</div>
    </div>
  </div>

  <div class="action">
    <strong>Recommended Action:</strong> Reach out within 1 hour. This lead shows strong buying signals — corporate email, executive title, and/or active evaluation timeline.
  </div>
</body>
</html>
  `.trim();
}

function buildInterestHtml(data: InterestEmailData): string {
  const enrollUrl = env.frontendUrl + '/enroll';
  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body { font-family: 'Segoe UI', system-ui, sans-serif; color: #2d3748; line-height: 1.6; max-width: 600px; margin: 0 auto; padding: 20px; }
    h1 { color: #1a365d; font-size: 24px; }
    h2 { color: #1a365d; font-size: 18px; margin-top: 24px; }
    .highlight { background: #f7fafc; border-left: 4px solid #1a365d; padding: 16px 20px; margin: 16px 0; border-radius: 0 8px 8px 0; }
    ul { padding-left: 20px; }
    li { margin-bottom: 8px; }
    .cta { display: inline-block; background: #1a365d; color: #ffffff; padding: 12px 24px; border-radius: 6px; text-decoration: none; font-weight: 600; margin: 16px 0; }
    .footer { margin-top: 32px; padding-top: 16px; border-top: 1px solid #e2e8f0; font-size: 14px; color: #718096; }
  </style>
</head>
<body>
  <h1>Enterprise AI Leadership Accelerator</h1>

  <p>Dear ${data.fullName},</p>

  <p>Thank you for your interest in the Colaberry Enterprise AI Leadership Accelerator. Here's what makes this program unique:</p>

  <h2>Program Overview</h2>
  <div class="highlight">
    <strong>Duration:</strong> 3 weeks (6 core sessions + optional labs)<br>
    <strong>Format:</strong> Live, instructor-led with hands-on projects<br>
    <strong>Investment:</strong> $4,500 per participant<br>
    <strong>Outcome:</strong> Working AI Proof of Capability + Executive Presentation + 90-Day Roadmap
  </div>

  <h2>Who It's For</h2>
  <ul>
    <li>VPs, Directors, and Senior Managers leading AI strategy</li>
    <li>Technical leaders bridging business and engineering</li>
    <li>Executives building organization-wide AI capabilities</li>
  </ul>

  <h2>What You'll Build</h2>
  <ul>
    <li>A working AI Proof of Capability scoped to your organization's highest-priority use case</li>
    <li>An executive-ready presentation deck for stakeholder buy-in</li>
    <li>A 90-day AI expansion roadmap with measurable milestones</li>
  </ul>

  <p><a href="${enrollUrl}" class="cta">Enroll Now</a></p>

  <p>Want to discuss how this program fits your organization? Reply to this email to schedule a complimentary 15-minute strategy call.</p>

  <div class="footer">
    <p>Colaberry Enterprise AI Division<br>
    AI Leadership | Architecture | Implementation | Advisory</p>
  </div>
</body>
</html>
  `.trim();
}

function buildConfirmationHtml(data: EnrollmentConfirmationData): string {
  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body { font-family: 'Segoe UI', system-ui, sans-serif; color: #2d3748; line-height: 1.6; max-width: 600px; margin: 0 auto; padding: 20px; }
    h1 { color: #1a365d; font-size: 24px; }
    h2 { color: #1a365d; font-size: 18px; margin-top: 24px; }
    .highlight { background: #f7fafc; border-left: 4px solid #1a365d; padding: 16px 20px; margin: 16px 0; border-radius: 0 8px 8px 0; }
    ul { padding-left: 20px; }
    li { margin-bottom: 8px; }
    .footer { margin-top: 32px; padding-top: 16px; border-top: 1px solid #e2e8f0; font-size: 14px; color: #718096; }
  </style>
</head>
<body>
  <h1>Welcome to the Enterprise AI Leadership Accelerator</h1>

  <p>Dear ${data.fullName},</p>

  <p>Your enrollment has been confirmed. Here are your cohort details:</p>

  <div class="highlight">
    <strong>Cohort:</strong> ${data.cohortName}<br>
    <strong>Start Date:</strong> ${data.startDate}<br>
    <strong>Core Sessions:</strong> ${data.coreDay} at ${data.coreTime}<br>
    ${data.optionalLabDay ? `<strong>Optional Architecture Lab:</strong> ${data.optionalLabDay}<br>` : ''}
  </div>

  <h2>Pre-Class Requirements</h2>
  <p>Please complete the following before your first session:</p>
  <ul>
    <li><strong>Claude Code paid account</strong> (Max or Team plan)</li>
    <li><strong>Company-approved LLM API key</strong> (OpenAI, Anthropic, or equivalent)</li>
    <li><strong>GitHub account</strong> with repository creation access</li>
    <li><strong>1-page summary</strong> of your organization's current AI initiatives</li>
    <li><strong>2-3 AI use cases</strong> relevant to your role and organization</li>
  </ul>

  <h2>What to Expect</h2>
  <p>Over the next 3 weeks, you will build a working AI Proof of Capability, create an executive presentation deck, and design a 90-Day AI expansion roadmap — all scoped to your organization's highest-priority use case.</p>

  <p>If you have any questions before your first session, reach out to us at <a href="mailto:info@colaberry.com">info@colaberry.com</a>.</p>

  <div class="footer">
    <p>Colaberry Enterprise AI Division<br>
    AI Leadership | Architecture | Implementation | Advisory</p>
  </div>
</body>
</html>
  `.trim();
}

/* ------------------------------------------------------------------ */
/*  Email Digest                                                       */
/* ------------------------------------------------------------------ */

export async function sendDigestEmail(data: DigestData): Promise<void> {
  if (!transporter) {
    console.warn('[Email] SMTP not configured. Skipping digest email.');
    return;
  }

  const alertTo = await getAdminRecipients();
  const periodLabel = data.period === 'weekly' ? 'Weekly' : 'Daily';
  const dateStr = data.generatedAt.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
  const subject = `${periodLabel} Admin Digest — ${dateStr}`;

  const r = await resolveEmailRecipient(alertTo, subject);
  const html = buildDigestHtml(data);

  const info = await transporter.sendMail({
    from: `"Colaberry Admin Digest" <${env.emailFrom}>`,
    replyTo: `"Colaberry Enterprise AI" <${env.emailFrom}>`,
    to: r.to,
    subject: r.subject,
    html,
    text: htmlToPlainText(html),
    headers: emailHeaders('admin-digest'),
  });

  console.log(`[Email] ${periodLabel} digest sent to: ${r.to} | msgId: ${info.messageId} | accepted: ${info.accepted} | rejected: ${info.rejected}`);
}

function buildDigestHtml(data: DigestData): string {
  const periodLabel = data.period === 'weekly' ? 'Weekly' : 'Daily';
  const dateStr = data.generatedAt.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });

  const fmtCurrency = (n: number) =>
    new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 0 }).format(n);

  const fmtDuration = (secs: number) => {
    const m = Math.floor(secs / 60);
    const sec = Math.round(secs % 60);
    return `${m}m ${sec}s`;
  };

  const pipelineLabels: Record<string, string> = {
    new_lead: 'New Lead', contacted: 'Contacted', meeting_scheduled: 'Meeting Scheduled',
    proposal_sent: 'Proposal Sent', negotiation: 'Negotiation', enrolled: 'Enrolled', lost: 'Lost',
  };
  const pipelineRows = Object.entries(data.pipeline)
    .map(([stage, count]) => `<tr><td style="padding:4px 8px;font-size:13px;">${pipelineLabels[stage] || stage}</td><td style="padding:4px 8px;font-size:13px;text-align:right;font-weight:600;">${count}</td></tr>`)
    .join('');

  const stallLabels: Record<string, string> = { low: 'Low', medium: 'Medium', high: 'High' };
  const atRiskRows = data.atRisk.length > 0
    ? data.atRisk.map(ar =>
        `<tr><td style="padding:4px 8px;font-size:13px;">${ar.leadName}</td><td style="padding:4px 8px;font-size:13px;">${ar.company}</td><td style="padding:4px 8px;font-size:13px;text-align:center;">${ar.score}</td><td style="padding:4px 8px;font-size:13px;">${stallLabels[ar.stall_risk] || ar.stall_risk}</td><td style="padding:4px 8px;font-size:13px;text-align:right;">${ar.days_since_last_activity}d</td></tr>`
      ).join('')
    : '';

  const appointmentItems = data.appointments.length > 0
    ? data.appointments.map(a => {
        const d = new Date(a.scheduled_at);
        const dt = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) + ' ' +
                   d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
        return `<li style="margin-bottom:6px;font-size:13px;"><strong>${a.title}</strong> -- ${a.lead_name} (${dt})</li>`;
      }).join('')
    : '';

  const actions: string[] = [];
  const highStalls = (data.opportunities.stall_counts?.high || 0) + (data.opportunities.stall_counts?.medium || 0);
  if (highStalls > 0) actions.push(`${highStalls} at-risk opportunit${highStalls === 1 ? 'y needs' : 'ies need'} follow-up`);
  if (data.revenue.pendingInvoice > 0) actions.push(`${data.revenue.pendingInvoice} pending invoice${data.revenue.pendingInvoice === 1 ? '' : 's'} need attention`);
  if (data.appointments.length > 0) actions.push(`${data.appointments.length} appointment${data.appointments.length === 1 ? '' : 's'} this week`);
  if (data.highIntentCount > 0) actions.push(`${data.highIntentCount} high-intent visitor${data.highIntentCount === 1 ? '' : 's'} detected`);

  const actionHtml = actions.length > 0
    ? actions.map(a => `<li style="margin-bottom:4px;font-size:13px;">${a}</li>`).join('')
    : '<li style="font-size:13px;color:#718096;">No urgent actions</li>';

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body { font-family: 'Segoe UI', system-ui, sans-serif; color: #2d3748; line-height: 1.6; max-width: 650px; margin: 0 auto; padding: 20px; }
    h1 { color: #1a365d; font-size: 22px; margin-bottom: 4px; }
    h2 { color: #1a365d; font-size: 16px; margin-top: 24px; margin-bottom: 8px; border-bottom: 2px solid #e2e8f0; padding-bottom: 4px; }
    .subtitle { color: #718096; font-size: 13px; margin-bottom: 20px; }
    .kpi-grid { display: flex; flex-wrap: wrap; gap: 12px; margin-bottom: 8px; }
    .kpi-box { background: #f7fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 12px 16px; flex: 1; min-width: 140px; }
    .kpi-label { font-size: 11px; color: #718096; text-transform: uppercase; letter-spacing: 0.5px; }
    .kpi-value { font-size: 20px; font-weight: 700; color: #1a365d; }
    .kpi-sub { font-size: 11px; color: #718096; }
    table { width: 100%; border-collapse: collapse; }
    th { background: #f7fafc; color: #4a5568; font-size: 11px; text-transform: uppercase; letter-spacing: 0.5px; padding: 6px 8px; text-align: left; }
    .action-box { background: #fffbeb; border: 1px solid #fbbf24; border-radius: 8px; padding: 12px 16px; margin-top: 8px; }
    .footer { margin-top: 32px; padding-top: 16px; border-top: 1px solid #e2e8f0; font-size: 13px; color: #718096; }
  </style>
</head>
<body>
  <h1>${periodLabel} Admin Digest</h1>
  <div class="subtitle">${dateStr}</div>

  <h2>Revenue &amp; Enrollments</h2>
  <div class="kpi-grid">
    <div class="kpi-box">
      <div class="kpi-label">Revenue</div>
      <div class="kpi-value" style="color:#38a169;">${fmtCurrency(data.revenue.totalRevenue)}</div>
    </div>
    <div class="kpi-box">
      <div class="kpi-label">Enrollments</div>
      <div class="kpi-value" style="color:#3182ce;">${data.revenue.totalEnrollments}</div>
      ${data.revenue.pendingInvoice > 0 ? `<div class="kpi-sub">${data.revenue.pendingInvoice} pending</div>` : ''}
    </div>
    <div class="kpi-box">
      <div class="kpi-label">Seats Remaining</div>
      <div class="kpi-value" style="color:#805ad5;">${data.revenue.seatsRemaining}</div>
    </div>
  </div>

  <h2>Lead Pipeline</h2>
  <div class="kpi-grid">
    <div class="kpi-box">
      <div class="kpi-label">Total Leads</div>
      <div class="kpi-value">${data.leads.total}</div>
      <div class="kpi-sub">${data.leads.thisMonth} this month</div>
    </div>
    <div class="kpi-box">
      <div class="kpi-label">Conversion Rate</div>
      <div class="kpi-value">${data.leads.conversionRate}%</div>
    </div>
    <div class="kpi-box">
      <div class="kpi-label">High Intent</div>
      <div class="kpi-value" style="color:#e53e3e;">${data.leads.highIntent}</div>
    </div>
  </div>
  ${pipelineRows ? `<table style="margin-top:8px;"><thead><tr><th>Stage</th><th style="text-align:right;">Count</th></tr></thead><tbody>${pipelineRows}</tbody></table>` : ''}

  <h2>Opportunity Highlights</h2>
  <div class="kpi-grid">
    <div class="kpi-box">
      <div class="kpi-label">Avg Score</div>
      <div class="kpi-value">${data.opportunities.avg_score}</div>
      <div class="kpi-sub">${data.opportunities.total_scored} scored</div>
    </div>
    <div class="kpi-box">
      <div class="kpi-label">Pipeline Value</div>
      <div class="kpi-value" style="color:#1a365d;">${fmtCurrency(data.opportunities.total_pipeline_value)}</div>
    </div>
    <div class="kpi-box">
      <div class="kpi-label">Weighted Forecast</div>
      <div class="kpi-value" style="color:#2b6cb0;">${fmtCurrency(data.forecast.weighted_pipeline_value)}</div>
      <div class="kpi-sub">${data.forecast.total_projected_enrollments.toFixed(1)} proj. enrollments</div>
    </div>
  </div>

  ${atRiskRows ? `
  <h2>At-Risk Opportunities</h2>
  <table>
    <thead><tr><th>Lead</th><th>Company</th><th style="text-align:center;">Score</th><th>Risk</th><th style="text-align:right;">Idle</th></tr></thead>
    <tbody>${atRiskRows}</tbody>
  </table>
  ` : ''}

  <h2>Visitor Engagement</h2>
  <div class="kpi-grid">
    <div class="kpi-box">
      <div class="kpi-label">Visitors (30d)</div>
      <div class="kpi-value">${data.visitors.total_visitors}</div>
    </div>
    <div class="kpi-box">
      <div class="kpi-label">Sessions (30d)</div>
      <div class="kpi-value">${data.visitors.total_sessions}</div>
    </div>
    <div class="kpi-box">
      <div class="kpi-label">Avg Duration</div>
      <div class="kpi-value">${fmtDuration(data.visitors.avg_session_duration)}</div>
    </div>
    <div class="kpi-box">
      <div class="kpi-label">Bounce Rate</div>
      <div class="kpi-value">${data.visitors.bounce_rate.toFixed(1)}%</div>
    </div>
  </div>

  ${appointmentItems ? `
  <h2>Upcoming Appointments</h2>
  <ul style="padding-left:20px;">${appointmentItems}</ul>
  ` : ''}

  <h2>Action Items</h2>
  <div class="action-box">
    <ul style="padding-left:20px;margin:0;">${actionHtml}</ul>
  </div>

  <div class="footer">
    <p><strong>Colaberry Enterprise AI Division</strong><br>
    AI Leadership | Architecture | Implementation | Advisory</p>
    <p style="font-size:11px;color:#a0aec0;">This is an automated digest. Configure frequency in Admin Settings.</p>
  </div>
</body>
</html>
  `.trim();
}
// --- Accelerator Session Emails ---

interface SessionReminderData {
  to: string;
  fullName: string;
  sessionTitle: string;
  sessionNumber: number;
  sessionDate: string;
  startTime: string;
  meetingLink: string | null;
  materialsJson: any[] | null;
  isOneHour: boolean;
}

export async function sendSessionReminder(data: SessionReminderData): Promise<void> {
  if (!transporter) {
    console.warn('[Email] SMTP not configured. Skipping session reminder to:', data.to);
    return;
  }

  const urgency = data.isOneHour ? 'Starting in 1 Hour' : 'Tomorrow';
  const r = await resolveEmailRecipient(
    data.to,
    `[Accelerator] ${urgency}: Session ${data.sessionNumber} — ${data.sessionTitle}`
  );
  const html = buildSessionReminderHtml(data);
  const info = await transporter.sendMail({
    from: `"Colaberry Enterprise AI" <${env.emailFrom}>`,
    replyTo: `"Colaberry Enterprise AI" <${env.emailFrom}>`,
    to: r.to,
    subject: r.subject,
    html,
    text: htmlToPlainText(html),
    headers: emailHeaders('accelerator-session-reminder'),
  });

  console.log(`[Email] Session reminder sent to: ${r.to} | msgId: ${info.messageId}`);
}

function buildSessionReminderHtml(data: SessionReminderData): string {
  const urgencyLabel = data.isOneHour ? 'Starting in 1 Hour' : 'Tomorrow';
  const materialsHtml = data.materialsJson?.length
    ? `<h2>Session Materials</h2><ul>${data.materialsJson.map((m: any) => `<li><a href="${m.url}">${m.title || m.url}</a></li>`).join('')}</ul>`
    : '';

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body { font-family: 'Segoe UI', system-ui, sans-serif; color: #2d3748; line-height: 1.6; max-width: 600px; margin: 0 auto; padding: 20px; }
    h1 { color: #1a365d; font-size: 24px; }
    h2 { color: #1a365d; font-size: 18px; margin-top: 24px; }
    .highlight { background: #f7fafc; border-left: 4px solid #1a365d; padding: 16px 20px; margin: 16px 0; border-radius: 0 8px 8px 0; }
    .cta { display: inline-block; background: #1a365d; color: #ffffff; padding: 14px 28px; border-radius: 6px; text-decoration: none; font-weight: 600; margin: 16px 0; }
    .urgency { background: #fff3cd; border: 1px solid #ffc107; padding: 12px 16px; border-radius: 6px; margin: 16px 0; font-weight: 600; }
    .footer { margin-top: 32px; padding-top: 16px; border-top: 1px solid #e2e8f0; font-size: 14px; color: #718096; }
  </style>
</head>
<body>
  <h1>Session ${data.sessionNumber}: ${data.sessionTitle}</h1>

  <div class="urgency">${urgencyLabel}</div>

  <p>Dear ${data.fullName},</p>

  <p>This is a reminder for your upcoming Accelerator session.</p>

  <div class="highlight">
    <strong>Session:</strong> #${data.sessionNumber} — ${data.sessionTitle}<br>
    <strong>Date:</strong> ${data.sessionDate}<br>
    <strong>Time:</strong> ${data.startTime} ET
  </div>

  ${data.meetingLink ? `<p><a href="${data.meetingLink}" class="cta">Join Session</a></p>` : '<p><em>Meeting link will be shared before the session starts.</em></p>'}

  ${materialsHtml}

  <p>Please ensure you have completed any pre-work assignments before the session begins.</p>

  <div class="footer">
    <p>Colaberry Enterprise AI Division<br>
    AI Leadership | Architecture | Implementation | Advisory</p>
  </div>
</body>
</html>
  `.trim();
}

interface MissedSessionData {
  to: string;
  fullName: string;
  sessionTitle: string;
  sessionNumber: number;
  sessionDate: string;
  recordingUrl: string | null;
  materialsJson: any[] | null;
  consecutiveMisses: number;
}

export async function sendMissedSessionEmail(data: MissedSessionData): Promise<void> {
  if (!transporter) {
    console.warn('[Email] SMTP not configured. Skipping missed session email to:', data.to);
    return;
  }

  const r = await resolveEmailRecipient(
    data.to,
    `[Accelerator] Missed Session ${data.sessionNumber}: ${data.sessionTitle} — Catch Up`
  );
  const html = buildMissedSessionHtml(data);
  const info = await transporter.sendMail({
    from: `"Colaberry Enterprise AI" <${env.emailFrom}>`,
    replyTo: `"Colaberry Enterprise AI" <${env.emailFrom}>`,
    to: r.to,
    subject: r.subject,
    html,
    text: htmlToPlainText(html),
    headers: emailHeaders('accelerator-missed-session'),
  });

  console.log(`[Email] Missed session email sent to: ${r.to} | msgId: ${info.messageId}`);
}

function buildMissedSessionHtml(data: MissedSessionData): string {
  const materialsHtml = data.materialsJson?.length
    ? `<h2>Session Materials</h2><ul>${data.materialsJson.map((m: any) => `<li><a href="${m.url}">${m.title || m.url}</a></li>`).join('')}</ul>`
    : '';

  const warningHtml = data.consecutiveMisses >= 2
    ? `<div style="background: #fed7d7; border: 1px solid #fc8181; padding: 12px 16px; border-radius: 6px; margin: 16px 0;">
        <strong>Attendance Alert:</strong> You have missed ${data.consecutiveMisses} consecutive sessions. Consistent attendance is critical for program completion. Please reach out if you need support.
      </div>`
    : '';

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body { font-family: 'Segoe UI', system-ui, sans-serif; color: #2d3748; line-height: 1.6; max-width: 600px; margin: 0 auto; padding: 20px; }
    h1 { color: #1a365d; font-size: 24px; }
    h2 { color: #1a365d; font-size: 18px; margin-top: 24px; }
    .highlight { background: #f7fafc; border-left: 4px solid #1a365d; padding: 16px 20px; margin: 16px 0; border-radius: 0 8px 8px 0; }
    .cta { display: inline-block; background: #1a365d; color: #ffffff; padding: 14px 28px; border-radius: 6px; text-decoration: none; font-weight: 600; margin: 16px 0; }
    .footer { margin-top: 32px; padding-top: 16px; border-top: 1px solid #e2e8f0; font-size: 14px; color: #718096; }
  </style>
</head>
<body>
  <h1>Session ${data.sessionNumber} Recap: ${data.sessionTitle}</h1>

  <p>Dear ${data.fullName},</p>

  <p>We missed you at Session ${data.sessionNumber} on ${data.sessionDate}. Here is everything you need to catch up:</p>

  ${warningHtml}

  ${data.recordingUrl ? `<div class="highlight"><strong>Session Recording:</strong><br><a href="${data.recordingUrl}">Watch the recording</a></div>` : '<p><em>The session recording will be available shortly.</em></p>'}

  ${materialsHtml}

  <p>Please review the materials and complete any assignments before the next session. If you have questions, reply to this email.</p>

  <div class="footer">
    <p>Colaberry Enterprise AI Division<br>
    AI Leadership | Architecture | Implementation | Advisory</p>
  </div>
</body>
</html>
  `.trim();
}

interface AbsenceAlertData {
  enrollmentName: string;
  enrollmentEmail: string;
  enrollmentCompany: string;
  cohortName: string;
  consecutiveMisses: number;
  missedSessions: string[];
}

export async function sendAbsenceAlert(data: AbsenceAlertData): Promise<void> {
  if (!transporter) {
    console.warn('[Email] SMTP not configured. Skipping absence alert for:', data.enrollmentName);
    return;
  }

  const alertTo = await getAdminRecipients();
  const r = await resolveEmailRecipient(
    alertTo,
    `[Accelerator Alert] ${data.enrollmentName} — ${data.consecutiveMisses} Consecutive Absences`
  );
  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body { font-family: 'Segoe UI', system-ui, sans-serif; color: #2d3748; line-height: 1.6; max-width: 600px; margin: 0 auto; padding: 20px; }
    h1 { color: #e53e3e; font-size: 22px; }
    .card { background: #f8f9fa; border: 1px solid #dee2e6; border-radius: 8px; padding: 20px; margin: 16px 0; }
    .field { margin-bottom: 8px; }
    .field-label { color: #6c757d; font-size: 13px; text-transform: uppercase; letter-spacing: 0.5px; }
    .field-value { font-size: 16px; font-weight: 500; }
    .action { background: #fff3cd; border: 1px solid #ffc107; padding: 12px 16px; border-radius: 6px; margin-top: 16px; }
  </style>
</head>
<body>
  <h1>Consecutive Absence Alert</h1>
  <p>A participant has missed ${data.consecutiveMisses} consecutive sessions. Intervention recommended.</p>

  <div class="card">
    <div class="field"><div class="field-label">Participant</div><div class="field-value">${data.enrollmentName}</div></div>
    <div class="field"><div class="field-label">Email</div><div class="field-value"><a href="mailto:${data.enrollmentEmail}">${data.enrollmentEmail}</a></div></div>
    <div class="field"><div class="field-label">Company</div><div class="field-value">${data.enrollmentCompany}</div></div>
    <div class="field"><div class="field-label">Cohort</div><div class="field-value">${data.cohortName}</div></div>
    <div class="field"><div class="field-label">Missed Sessions</div><div class="field-value">${data.missedSessions.join(', ')}</div></div>
  </div>

  <div class="action">
    <strong>Recommended Action:</strong> Reach out to the participant to discuss attendance and determine if support is needed. Consider scheduling a 1:1 check-in.
  </div>
</body>
</html>
  `.trim();

  const info = await transporter.sendMail({
    from: `"Colaberry Accelerator Alert" <${env.emailFrom}>`,
    replyTo: `"Colaberry Enterprise AI" <${env.emailFrom}>`,
    to: r.to,
    subject: r.subject,
    html,
    text: htmlToPlainText(html),
    headers: emailHeaders('accelerator-absence-alert'),
  });

  console.log(`[Email] Absence alert sent for: ${data.enrollmentName} | msgId: ${info.messageId}`);
}


// --- Portal Magic Link Email ---

interface PortalMagicLinkData {
  to: string;
  fullName: string;
  token: string;
  cohortName: string;
}

export async function sendPortalMagicLink(data: PortalMagicLinkData): Promise<void> {
  if (!transporter) {
    console.warn('[Email] SMTP not configured. Skipping magic link email to:', data.to);
    return;
  }

  const portalBaseUrl = env.frontendUrl || 'http://95.216.199.47:8888';
  const magicLink = `${portalBaseUrl}/portal/verify?token=${data.token}`;

  const r = await resolveEmailRecipient(
    data.to,
    `[Accelerator] Your Portal Access Link`
  );
  const html = buildPortalMagicLinkHtml(data, magicLink);
  const info = await transporter.sendMail({
    from: `"Colaberry Enterprise AI" <${env.emailFrom}>`,
    replyTo: `"Colaberry Enterprise AI" <${env.emailFrom}>`,
    to: r.to,
    subject: r.subject,
    html,
    text: htmlToPlainText(html),
    headers: emailHeaders('accelerator-portal-magic-link'),
  });

  console.log(`[Email] Portal magic link sent to: ${r.to} | msgId: ${info.messageId}`);
}

function buildPortalMagicLinkHtml(data: PortalMagicLinkData, magicLink: string): string {
  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body { font-family: 'Segoe UI', system-ui, sans-serif; color: #2d3748; line-height: 1.6; max-width: 600px; margin: 0 auto; padding: 20px; }
    h1 { color: #1a365d; font-size: 24px; }
    .highlight { background: #f7fafc; border-left: 4px solid #1a365d; padding: 16px 20px; margin: 16px 0; border-radius: 0 8px 8px 0; }
    .cta { display: inline-block; background: #1a365d; color: #ffffff; padding: 14px 28px; border-radius: 6px; text-decoration: none; font-weight: 600; margin: 16px 0; }
    .footer { margin-top: 32px; padding-top: 16px; border-top: 1px solid #e2e8f0; font-size: 14px; color: #718096; }
    .notice { font-size: 13px; color: #718096; margin-top: 12px; }
  </style>
</head>
<body>
  <h1>Access Your Accelerator Portal</h1>

  <p>Dear ${data.fullName},</p>

  <p>You requested access to the <strong>${data.cohortName}</strong> participant portal. Click the button below to sign in:</p>

  <p><a href="${magicLink}" class="cta">Access My Portal</a></p>

  <div class="highlight">
    <strong>Your portal includes:</strong><br>
    &bull; Session schedule and materials<br>
    &bull; Assignment submissions<br>
    &bull; Your readiness score and progress<br>
    &bull; Session recordings
  </div>

  <p class="notice">This link expires in 24 hours and can only be used once. If you did not request this link, you can safely ignore this email.</p>

  <div class="footer">
    <p>Colaberry Enterprise AI Division<br>
    AI Leadership | Architecture | Implementation | Advisory</p>
  </div>
</body>
</html>
  `.trim();
}
