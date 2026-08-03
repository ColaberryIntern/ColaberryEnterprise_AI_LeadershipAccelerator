import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(__dirname, '../../../.env') });

export const env = {
  nodeEnv: process.env.NODE_ENV || 'development',
  port: parseInt(process.env.PORT || '3001', 10),
  databaseUrl: process.env.DATABASE_URL || 'postgres://accelerator:accelerator@localhost:5432/accelerator_dev',

  // PaySimple
  paysimpleApiUser: process.env.PAYSIMPLE_API_USER || '',
  paysimpleApiKey: process.env.PAYSIMPLE_API_KEY || '',
  paysimpleEnv: (process.env.PAYSIMPLE_ENV || 'sandbox') as 'sandbox' | 'live',
  paysimpleWebhookSecret: process.env.PAYSIMPLE_WEBHOOK_SECRET || '',
  paymentMode: (process.env.PAYMENT_MODE || 'test') as 'test' | 'live',

  // JWT
  jwtSecret: process.env.JWT_SECRET || 'dev-secret-change-me',
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '4h',

  // Email (SMTP)
  smtpHost: process.env.SMTP_HOST || 'smtp.gmail.com',
  smtpPort: parseInt(process.env.SMTP_PORT || '587', 10),
  smtpUser: process.env.SMTP_USER || '',
  smtpPass: process.env.SMTP_PASS || '',
  emailFrom: process.env.EMAIL_FROM || 'enrollment@colaberry.com',

  // Synthflow Voice AI
  synthflowApiKey: process.env.SYNTHFLOW_API_KEY || '',
  synthflowWelcomeAgentId: process.env.SYNTHFLOW_WELCOME_AGENT_ID || '',
  synthflowInterestAgentId: process.env.SYNTHFLOW_INTEREST_AGENT_ID || '',
  // Agent that handles inbound "call me now" callbacks from training.colaberry.com
  // (the Cora Outbound Admissions agent, module 1b432b69-fcb1-4b70-9130-8a66e45eaff5).
  // Falls back to the interest agent in synthflowService if left unset.
  synthflowCallbackAgentId: process.env.SYNTHFLOW_CALLBACK_AGENT_ID || '',

  // Admin alert phone (for Cory health monitor voice alerts)
  adminAlertPhone: process.env.ADMIN_ALERT_PHONE || '',

  // OpenAI
  openaiApiKey: process.env.OPENAI_API_KEY || '',
  aiModel: process.env.AI_MODEL || 'gpt-4o-mini',
  aiMaxTokens: parseInt(process.env.AI_MAX_TOKENS || '1024', 10),

  // Apollo
  apolloApiKey: process.env.APOLLO_API_KEY || '',
  // Master kill switch — every Apollo call (search/enrich/phone-reveal) burns paid
  // credits, so ALL calls are OFF unless APOLLO_ENABLED=true is set explicitly.
  // Default off protects against the scheduled lead-gen agents draining credits
  // unattended. See CC-20260710-a9f2 (Apollo credit-leak audit).
  apolloEnabled: process.env.APOLLO_ENABLED === 'true',

  // Mandrill
  mandrillWebhookKey: process.env.MANDRILL_WEBHOOK_KEY || '',
  mandrillWebhookUrl: process.env.MANDRILL_WEBHOOK_URL || '',
  mandrillApiKey: process.env.MANDRILL_API_KEY || '',
  mandrillInboundDomain: process.env.MANDRILL_INBOUND_DOMAIN || 'reply.colaberry.ai',

  // Google Calendar
  googleCalendarId: process.env.GOOGLE_CALENDAR_ID || '',
  googleServiceAccountEmail: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL || '',
  googlePrivateKey: (process.env.GOOGLE_PRIVATE_KEY || '').replace(/\\n/g, '\n'),
  googleCalendarOwnerEmail: process.env.GOOGLE_CALENDAR_OWNER_EMAIL || '',

  // Feature Flags
  enableVoiceCalls: process.env.ENABLE_VOICE_CALLS === 'true',
  enableVoiceCallForOverview: process.env.ENABLE_VOICE_CALL_FOR_OVERVIEW === 'true',
  enableAutoEmail: process.env.ENABLE_AUTO_EMAIL !== 'false', // default on
  enableHighIntentAlert: process.env.ENABLE_HIGH_INTENT_ALERT === 'true',
  enableFollowUpScheduler: process.env.ENABLE_FOLLOWUP_SCHEDULER === 'true',
  enableVisitorTracking: process.env.ENABLE_VISITOR_TRACKING === 'true',
  visitorSessionTimeoutMinutes: parseInt(process.env.VISITOR_SESSION_TIMEOUT || '30', 10),
  enableChat: process.env.ENABLE_CHAT === 'true',
  enableArtifactGraph: process.env.ENABLE_ARTIFACT_GRAPH !== 'false',
  enableArtifactCompiler: process.env.ENABLE_ARTIFACT_COMPILER !== 'false',
  enableRequirementsMatching: process.env.ENABLE_REQUIREMENTS_MATCHING !== 'false',
  // Colaberry Commons (community rooms). Master switch OFF by default so the whole
  // subsystem — routes, outbox worker, and room-per-session linkage — ships dark and
  // does nothing until COMMUNITY_ROOMS_ENABLED=true is set explicitly in an env. This
  // is the single gate: community REST routes return 404, the outbox drain cron no-ops,
  // and createSession skips linked-room creation while it is false.
  communityRoomsEnabled: process.env.COMMUNITY_ROOMS_ENABLED === 'true',
  // Ops Automation rules engine (bulk relabel/archive of ops_bc_todos). Default off —
  // it was firing as an unconditional side effect of every boot/restart, silently
  // relabeling thousands of PMO todo rows (5,099 waiting_dependency + 689
  // archive_suggested observed in prod). Direction: run on a deliberate schedule
  // only when explicitly enabled, never as a boot side effect. See BC #10106943371
  // (Ali, 2026-07-18).
  opsAutomationEnabled: process.env.OPS_AUTOMATION_ENABLED === 'true',
  chatModel: process.env.CHAT_MODEL || 'gpt-4o-mini',
  chatMaxTokens: parseInt(process.env.CHAT_MAX_TOKENS || '512', 10),

  // Intelligence Engine
  intelligenceEngineUrl: process.env.INTELLIGENCE_ENGINE_URL || 'http://localhost:5000',

  // AI Project Architect
  aiProjectArchitectUrl: process.env.AI_PROJECT_ARCHITECT_URL || 'http://localhost:8000',

  // MSSQL (Alumni Data Source)
  mssqlHost: process.env.MSSQL_HOST || '',
  mssqlPort: parseInt(process.env.MSSQL_PORT || '1433', 10),
  mssqlUser: process.env.MSSQL_USER || '',
  mssqlPass: process.env.MSSQL_PASS || '',
  mssqlDatabase: process.env.MSSQL_DATABASE || 'CCPP',

  // Enterprise CRM service token (service-to-service auth for /api/v1/leads)
  enterpriseCrmToken: process.env.ENTERPRISE_CRM_TOKEN || '',

  // Training signup onboarding (training.colaberry.com registration -> auto Explorer
  // portal account + branded welcome email). Master switch is OFF by default so the
  // flow ships dark and fires nothing until it is explicitly turned on in prod.
  // The from-address stays on a Mandrill-verified domain (colaberry.com) but is
  // training-branded; flip TRAINING_WELCOME_FROM_EMAIL to an @training.colaberry.com
  // address only once that domain's SPF/DKIM is verified in Mandrill.
  trainingWelcomeEnabled: process.env.TRAINING_WELCOME_ENABLED === 'true',
  trainingWelcomeFromEmail: process.env.TRAINING_WELCOME_FROM_EMAIL || 'training@colaberry.com',
  trainingWelcomeFromName: process.env.TRAINING_WELCOME_FROM_NAME || 'Colaberry Training',
  trainingWelcomeTokenTtlDays: parseInt(process.env.TRAINING_WELCOME_TOKEN_TTL_DAYS || '30', 10),
  explorerCohortName: process.env.EXPLORER_COHORT_NAME || 'Explorer — Prospects',

  // App
  frontendUrl: process.env.FRONTEND_URL || 'http://localhost:3000',

  // Campaign Test Safety
  campaignTestEmailDomain: process.env.CAMPAIGN_TEST_EMAIL_DOMAIN || '@colaberry-test.local',
};
