import nodemailer from 'nodemailer';
import { env } from '../config/env';
import { getTestOverrides } from './settingsService';

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
  await transporter.sendMail({
    from: `"Colaberry Enterprise AI" <${env.emailFrom}>`,
    to: r.to,
    subject: r.subject,
    html: buildConfirmationHtml(data),
  });

  console.log('[Email] Enrollment confirmation sent to:', r.to);
}

interface InterestEmailData {
  to: string;
  fullName: string;
}

export async function sendInterestEmail(data: InterestEmailData): Promise<void> {
  if (!transporter) {
    console.warn('[Email] SMTP not configured. Skipping interest email to:', data.to);
    console.log('[Email] Would have sent interest email to:', data.to);
    return;
  }

  const r = await resolveEmailRecipient(data.to, 'Your Enterprise AI Leadership Accelerator Details');
  await transporter.sendMail({
    from: `"Colaberry Enterprise AI" <${env.emailFrom}>`,
    to: r.to,
    subject: r.subject,
    html: buildInterestHtml(data),
  });

  console.log('[Email] Interest email sent to:', r.to);
}

interface ExecutiveOverviewEmailData {
  to: string;
  fullName: string;
}

export async function sendExecutiveOverviewEmail(data: ExecutiveOverviewEmailData): Promise<void> {
  if (!transporter) {
    console.warn('[Email] SMTP not configured. Skipping executive overview email to:', data.to);
    return;
  }

  const r = await resolveEmailRecipient(data.to, 'Your Executive AI Overview + ROI Framework');
  await transporter.sendMail({
    from: `"Colaberry Enterprise AI" <${env.emailFrom}>`,
    to: r.to,
    subject: r.subject,
    html: buildExecutiveOverviewHtml(data),
  });

  console.log('[Email] Executive overview email sent to:', r.to);
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

  const alertTo = env.emailFrom; // ali@colaberry.com
  const r = await resolveEmailRecipient(alertTo, `High-Intent Executive Lead: ${data.name} (Score: ${data.score})`);

  await transporter.sendMail({
    from: `"Colaberry Lead Alert" <${env.emailFrom}>`,
    to: r.to,
    subject: r.subject,
    html: buildHighIntentAlertHtml(data),
  });

  console.log('[Email] High-intent alert sent for:', data.name, '(score:', data.score, ')');
}

interface StrategyCallConfirmationData {
  to: string;
  name: string;
  scheduledAt: Date;
  timezone: string;
  meetLink: string;
  prepToken?: string;
}

export async function sendStrategyCallConfirmation(data: StrategyCallConfirmationData): Promise<void> {
  if (!transporter) {
    console.warn('[Email] SMTP not configured. Skipping strategy call confirmation to:', data.to);
    return;
  }

  const r = await resolveEmailRecipient(data.to, 'Your Executive AI Strategy Call is Confirmed');
  await transporter.sendMail({
    from: `"Colaberry Enterprise AI" <${env.emailFrom}>`,
    to: r.to,
    subject: r.subject,
    html: buildStrategyCallConfirmationHtml(data),
  });

  console.log('[Email] Strategy call confirmation sent to:', r.to);
}

function buildStrategyCallConfirmationHtml(data: StrategyCallConfirmationData): string {
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
    <strong>Format:</strong> Google Meet (video call)
  </div>

  <p><a href="${data.meetLink}" class="cta">Join Google Meet</a></p>

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

  const alertTo = env.emailFrom; // ali@colaberry.com
  const r = await resolveEmailRecipient(alertTo, `Strategy Call Prep: ${data.name} (${data.company || 'No Company'}) \u2014 Score: ${data.completionScore}%`);

  await transporter.sendMail({
    from: `"Colaberry Strategy Intel" <${env.emailFrom}>`,
    to: r.to,
    subject: r.subject,
    html: buildIntelligenceBriefHtml(data),
  });

  console.log('[Email] Intelligence brief sent for:', data.name);
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
