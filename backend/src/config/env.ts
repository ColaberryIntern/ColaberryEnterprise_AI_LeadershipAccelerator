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

  // OpenAI
  openaiApiKey: process.env.OPENAI_API_KEY || '',
  aiModel: process.env.AI_MODEL || 'gpt-4o-mini',
  aiMaxTokens: parseInt(process.env.AI_MAX_TOKENS || '1024', 10),

  // Apollo
  apolloApiKey: process.env.APOLLO_API_KEY || '',

  // Mandrill
  mandrillWebhookKey: process.env.MANDRILL_WEBHOOK_KEY || '',
  mandrillApiKey: process.env.MANDRILL_API_KEY || '',

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
  chatModel: process.env.CHAT_MODEL || 'gpt-4o-mini',
  chatMaxTokens: parseInt(process.env.CHAT_MAX_TOKENS || '512', 10),

  // Intelligence Engine
  intelligenceEngineUrl: process.env.INTELLIGENCE_ENGINE_URL || 'http://localhost:5000',

  // MSSQL (Alumni Data Source)
  mssqlHost: process.env.MSSQL_HOST || '',
  mssqlPort: parseInt(process.env.MSSQL_PORT || '1433', 10),
  mssqlUser: process.env.MSSQL_USER || '',
  mssqlPass: process.env.MSSQL_PASS || '',
  mssqlDatabase: process.env.MSSQL_DATABASE || 'CCPP',

  // App
  frontendUrl: process.env.FRONTEND_URL || 'http://localhost:3000',

  // Campaign Test Safety
  campaignTestEmailDomain: process.env.CAMPAIGN_TEST_EMAIL_DOMAIN || '@colaberry-test.local',
};
