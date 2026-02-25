import nodemailer from 'nodemailer';
import { env } from '../config/env';

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

  await transporter.sendMail({
    from: `"Colaberry Enterprise AI" <${env.emailFrom}>`,
    to: data.to,
    subject: 'Welcome to the Enterprise AI Leadership Accelerator',
    html: buildConfirmationHtml(data),
  });

  console.log('[Email] Enrollment confirmation sent to:', data.to);
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

  await transporter.sendMail({
    from: `"Colaberry Enterprise AI" <${env.emailFrom}>`,
    to: data.to,
    subject: 'Your Enterprise AI Leadership Accelerator Details',
    html: buildInterestHtml(data),
  });

  console.log('[Email] Interest email sent to:', data.to);
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

  await transporter.sendMail({
    from: `"Colaberry Enterprise AI" <${env.emailFrom}>`,
    to: data.to,
    subject: 'Your Executive AI Overview + ROI Framework',
    html: buildExecutiveOverviewHtml(data),
  });

  console.log('[Email] Executive overview email sent to:', data.to);
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

  await transporter.sendMail({
    from: `"Colaberry Lead Alert" <${env.emailFrom}>`,
    to: alertTo,
    subject: `High-Intent Executive Lead: ${data.name} (Score: ${data.score})`,
    html: buildHighIntentAlertHtml(data),
  });

  console.log('[Email] High-intent alert sent for:', data.name, '(score:', data.score, ')');
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
