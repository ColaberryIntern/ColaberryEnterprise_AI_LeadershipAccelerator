import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(__dirname, '../../../.env') });

const NODE_ENV = process.env.NODE_ENV || 'development';

/**
 * Resolve the JWT signing secret. In production we refuse to fall back to a
 * predictable default — an unset JWT_SECRET there is an auth-bypass risk
 * (anyone could forge a valid admin token), so fail fast at boot instead.
 * Outside production the dev default is kept so local setup stays frictionless.
 */
function resolveJwtSecret(): string {
  const secret = process.env.JWT_SECRET;
  if (secret && secret.length > 0) return secret;
  if (NODE_ENV === 'production') {
    throw new Error('[env] JWT_SECRET must be set in production — refusing to start with a default secret.');
  }
  return 'dev-secret-change-me';
}

export const env = {
  nodeEnv: NODE_ENV,
  port: parseInt(process.env.PORT || '3001', 10),
  databaseUrl: process.env.DATABASE_URL || 'postgres://accelerator:accelerator@localhost:5432/accelerator_dev',

  // PaySimple
  paysimpleApiUser: process.env.PAYSIMPLE_API_USER || '',
  paysimpleApiKey: process.env.PAYSIMPLE_API_KEY || '',
  paysimpleEnv: (process.env.PAYSIMPLE_ENV || 'sandbox') as 'sandbox' | 'live',
  paysimpleWebhookSecret: process.env.PAYSIMPLE_WEBHOOK_SECRET || '',
  paymentMode: (process.env.PAYMENT_MODE || 'test') as 'test' | 'live',
  // Scheduled reconcile of our recorded PaySimple payments (settled -> revenue,
  // failed/reversed -> subtracted). OFF by default so it ships dark; turn on once
  // live READ credentials are set.
  paysimpleSyncEnabled: process.env.PAYSIMPLE_SYNC_ENABLED === 'true',
  // Safety-net reconcile for missed-webhook membership payments: for OUR OWN
  // checkout customers (enrollments carrying a paysimple_customer_id we stored) that
  // are still unpaid, find and link their live membership payment. Scoped strictly to
  // our stored customer ids, so shared-gateway/direct charges can never leak in. OFF
  // by default (ships dark).
  paysimpleAppReconcileEnabled: process.env.PAYSIMPLE_APP_RECONCILE_ENABLED === 'true',
  // Only look at payments on/after this date (membership program launch).
  paysimpleReconcileStart: process.env.PAYSIMPLE_RECONCILE_START || '2026-06-01',

  // JWT
  jwtSecret: resolveJwtSecret(),
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '4h',

  // Unsubscribe token signing — HMAC secret for one-click List-Unsubscribe links.
  // Falls back to the (prod-required) JWT secret so shipping needs no new env var;
  // the HMAC is domain-separated by a context prefix (see unsubscribeTokenService)
  // so an unsubscribe token can never be cross-used as a JWT and vice versa.
  unsubscribeSecret: process.env.UNSUBSCRIBE_SECRET || resolveJwtSecret(),

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

  // Advisor Brain — Claude-backed idea→questions→requirements pipeline
  anthropicApiKey: process.env.ANTHROPIC_API_KEY || '',
  advisorClaudeModel: process.env.ADVISOR_CLAUDE_MODEL || 'claude-sonnet-4-6',

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
  // Family Command Center V2: the "Family" calendar read for the daily briefing.
  // Discover its id with `node backend/src/scripts/discoverFamilyCalendar.js`.
  googleFamilyCalendarId: process.env.GOOGLE_FAMILY_CALENDAR_ID || '',

  // Feature Flags
  enableVoiceCalls: process.env.ENABLE_VOICE_CALLS === 'true',
  enableVoiceCallForOverview: process.env.ENABLE_VOICE_CALL_FOR_OVERVIEW === 'true',
  enableAutoEmail: process.env.ENABLE_AUTO_EMAIL !== 'false', // default on
  enableHighIntentAlert: process.env.ENABLE_HIGH_INTENT_ALERT === 'true',
  enableFollowUpScheduler: process.env.ENABLE_FOLLOWUP_SCHEDULER === 'true',
  enableVisitorTracking: process.env.ENABLE_VISITOR_TRACKING === 'true',
  visitorSessionTimeoutMinutes: parseInt(process.env.VISITOR_SESSION_TIMEOUT || '30', 10),
  enableChat: process.env.ENABLE_CHAT === 'true',
  // Today Timeline v2 — the never-ending engagement feed (Phase 1). Default OFF;
  // set TODAY_FEED_V2_ENABLED=true to expose GET /api/portal/runtime/today.
  todayFeedV2Enabled: process.env.TODAY_FEED_V2_ENABLED === 'true',
  // Project backend v2 — persisted student-projects read API (P1). Default OFF;
  // set PROJECT_API_ENABLED=true to expose GET /api/portal/projects.
  projectApiEnabled: process.env.PROJECT_API_ENABLED === 'true',
  // Today aggregation — blend Project + Community cards into the Today feed
  // (Phase 2). Default OFF; the feed stays Class-only until enabled.
  todayAggregateSources: process.env.TODAY_AGGREGATE_SOURCES === 'true',
  // Live Sessions Phase 4 — "you missed it" replay cards (a completed session +
  // AI recap) into the Today feed for absentees. Default OFF; matches the
  // per-source gating convention of the other aggregated Today sources.
  todaySessionReplays: process.env.TODAY_SESSION_REPLAYS === 'true',
  // Feed Control plane — config-driven cadence/providers + rule-based ranker +
  // per-card/type routing. Default OFF; flag-off keeps the legacy hardcoded
  // CADENCE=2 + fixed provider list + week→bucket→order behavior byte-identical.
  feedControlEnabled: process.env.FEED_CONTROL_ENABLED === 'true',
  enableArtifactGraph: process.env.ENABLE_ARTIFACT_GRAPH !== 'false',
  enableArtifactCompiler: process.env.ENABLE_ARTIFACT_COMPILER !== 'false',
  enableRequirementsMatching: process.env.ENABLE_REQUIREMENTS_MATCHING !== 'false',
  // Portal engagement points: award StudentPointsEvent points when a student
  // completes a curriculum item (survey / knowledge check / card / lesson). These
  // feed the top-right HUD total. ON by default; set PORTAL_POINTS_AWARD_ENABLED=false
  // to dark-disable coursework awards (streak + RSVP awards are unaffected).
  portalPointsAwardEnabled: process.env.PORTAL_POINTS_AWARD_ENABLED !== 'false',
  // Paid/entitlement gate on the build + evidence subsystem (/api/portal/project*).
  // Free "Explorer" accounts get HTTP 402 with an upgrade payload; paid / comped /
  // staff / sponsor-seat enrollments pass. Default OFF (inverted vs the points flag
  // above) so merging/deploying changes NOTHING until BUILD_PAID_GATE_ENABLED=true.
  buildPaidGateEnabled: process.env.BUILD_PAID_GATE_ENABLED === 'true',
  // Community level reconcile — fold the legacy CommunityMember.level tiers
  // (0/1500/2700/4200 in communityService.LEVEL_TIERS) onto the ONE canonical
  // points ladder (pointsService.levelForPoints, 0/150/400/900). Default OFF:
  // communityService.levelFor keeps its legacy tiers byte-identical. When ON,
  // levelFor defers to the canonical ladder, eliminating the A/B threshold
  // disagreement. Leaderboard ranking is unaffected — it reads the canonical
  // StudentPointsEvent total, not levelFor.
  communityLevelUseCanonical: process.env.COMMUNITY_LEVEL_USE_CANONICAL === 'true',
  // Colaberry Commons — Community Rooms (rooms / bookings / RSVP / live-session
  // links). Master switch OFF by default: the community-room routes return 404,
  // the outbox drain cron no-ops, and createSession skips linked-room creation
  // until COMMUNITY_ROOMS_ENABLED=true is set explicitly in an environment.
  communityRoomsEnabled: process.env.COMMUNITY_ROOMS_ENABLED === 'true',
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

  // Branded welcome email for Open House / training.colaberry.com Explorer signups.
  // Sent by createExplorerEnrollment via emailService.sendTrainingWelcome. The
  // from-address stays on a Mandrill-verified domain (colaberry.com) but is
  // training-branded; flip TRAINING_WELCOME_FROM_EMAIL to an @training.colaberry.com
  // address only once that domain's SPF/DKIM is verified in Mandrill. The token TTL
  // is how long the emailed portal magic link stays valid.
  trainingWelcomeFromEmail: process.env.TRAINING_WELCOME_FROM_EMAIL || 'training@colaberry.com',
  trainingWelcomeFromName: process.env.TRAINING_WELCOME_FROM_NAME || 'Colaberry Training',
  trainingWelcomeTokenTtlDays: parseInt(process.env.TRAINING_WELCOME_TOKEN_TTL_DAYS || '30', 10),

  // App
  frontendUrl: process.env.FRONTEND_URL || 'http://localhost:3000',

  // Public origin where the backend API is reachable from the internet (nginx-proxied).
  // Used to build absolute one-click unsubscribe links embedded in outbound campaign
  // email. Must be the public https host, not the internal container port.
  publicAppUrl: process.env.PUBLIC_APP_URL || 'https://enterprise.colaberry.ai',

  // Open House landing/registration page (training.colaberry.com) — destination for the
  // Accelerator Open House campaign email CTAs. The page is owned by the landing-page work
  // (BC 9946499609); set the final URL via env once it is live. Default is a placeholder.
  openHouseLandingUrl: process.env.OPEN_HOUSE_LANDING_URL || 'https://training.colaberry.com/events/open-house',

  // Campaign Test Safety
  campaignTestEmailDomain: process.env.CAMPAIGN_TEST_EMAIL_DOMAIN || '@colaberry-test.local',

  // VA ERP Integration (STORY-001)
  vaErpTokenUrl: process.env.VA_ERP_TOKEN_URL || '',
  vaErpClientId: process.env.VA_ERP_CLIENT_ID || '',
  vaErpClientSecret: process.env.VA_ERP_CLIENT_SECRET || '',
  vaErpModuleConfigJson: process.env.VA_ERP_MODULE_CONFIG || '[]',
  vaErpRequestTimeoutMs: parseInt(process.env.VA_ERP_REQUEST_TIMEOUT_MS || '15000', 10),
  vaErpMaxRetries: parseInt(process.env.VA_ERP_MAX_RETRIES || '3', 10),
};
