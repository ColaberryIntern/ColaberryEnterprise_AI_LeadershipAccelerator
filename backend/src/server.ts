import fs from 'fs';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { env } from './config/env';
import { connectDatabase, sequelize } from './config/database';
import { errorHandler } from './middlewares/errorHandler';
import { traceMiddleware } from './middlewares/traceMiddleware';
import healthRoutes from './routes/healthRoutes';
import leadRoutes from './routes/leadRoutes';
import enrollmentRoutes from './routes/enrollmentRoutes';
import webhookRoutes from './routes/webhookRoutes';
import adminRoutes from './routes/adminRoutes';
import calendarRoutes from './routes/calendarRoutes';
import strategyPrepRoutes from './routes/strategyPrepRoutes';
import trackingRoutes from './routes/trackingRoutes';
import participantRoutes from './routes/participantRoutes';
import alumniReferralRoutes from './routes/alumniReferralRoutes';
import qrRedirectRoutes from './routes/qrRedirectRoutes';
import v1Routes from './routes/v1Routes';
import { previewProxyMiddleware } from './middlewares/previewProxyMiddleware';
import { startScheduler } from './services/schedulerService';
import { UPLOAD_DIR } from './config/upload';
import { seedProgramCurriculum } from './seeds/seedProgramCurriculum';
import { seedDepartments } from './seeds/seedDepartments';
import { seedCurriculumTypeDefinitions } from './seeds/seedCurriculumTypeDefinitions';
import { seedAllCampaigns } from './seeds/seedAllCampaigns';
import cron from 'node-cron';
import { ensureIntelligenceTables, runDiscoveryAgent, intelligenceMiddleware } from './intelligence';

// Import models to register associations before sync
import './models';

const app = express();

// Trust first proxy (nginx) for correct IP detection in rate limiting
app.set('trust proxy', 1);

app.use(helmet());
app.use(cors());

// Trace middleware (TBI audit P1-4): assign/propagate an x-trace-id for every request
// (including webhooks) and run the request inside an AsyncLocalStorage context so AI events
// emitted deep in the call chain are correlated to the originating request.
app.use(traceMiddleware);

// Webhook routes — each sub-route handles its own body parsing
app.use(webhookRoutes);

// Preview proxy — mounted BEFORE the JSON parser so request bodies pass through
// raw to upstream preview stacks.
app.use('/preview', previewProxyMiddleware());

// Global JSON parser for all other routes
app.use(express.json({ limit: '5mb' }));

// Intelligence process observation middleware (before routes)
app.use(intelligenceMiddleware());

app.use(healthRoutes);
app.use(leadRoutes);
app.use(enrollmentRoutes);
app.use(adminRoutes);
app.use(calendarRoutes);
app.use(strategyPrepRoutes);
app.use(trackingRoutes);
app.use(participantRoutes);
app.use(alumniReferralRoutes);
app.use(qrRedirectRoutes);
app.use(v1Routes);

// OpenClaw tracked short URL redirect (public, no auth)
app.get('/i/:tag', async (req, res) => {
  try {
    const { OpenclawResponse: OcResponse } = await import('./models');
    const response = await OcResponse.findOne({ where: { short_id: req.params.tag } });
    if (!response) return res.redirect('/ai-architect');

    // Record visitor attribution
    try {
      const { Visitor } = await import('./models');
      if (Visitor) {
        await (Visitor as any).create({
          campaign_id: response.utm_params?.utm_campaign || response.short_id,
          source: response.utm_params?.utm_source || response.platform,
          medium: response.utm_params?.utm_medium || 'organic_outreach',
          landing_page: '/ai-architect',
          referrer: req.get('referer') || null,
          ip_address: req.ip,
          user_agent: req.get('user-agent'),
          created_at: new Date(),
        });
      }
    } catch {
      // Visitor tracking is non-critical
    }

    // Update engagement metrics
    const clicks = (response.engagement_metrics?.clicks || 0) + 1;
    await response.update({
      engagement_metrics: { ...response.engagement_metrics, clicks },
      updated_at: new Date(),
    });

    res.redirect('/ai-architect');
  } catch {
    res.redirect('/ai-architect');
  }
});

app.use(errorHandler);

// Explicit migration: AI Ops Command Center (Phase 0) — create the 4 ops tables.
//
// Why explicit instead of `sequelize.sync({ alter: true })`: that path is
// unreliable on prod because the alter pass hits a pre-existing index
// conflict elsewhere in the 215-model graph and the fallback create-only
// sync also fails on the same conflict. The explicit CREATE TABLE IF NOT
// EXISTS path matches the lead-ingestion schema pattern below and is the
// only reliable way to land new tables on prod right now.
async function ensureOpsCommandCenterSchema() {
  const statements = [
    `CREATE TABLE IF NOT EXISTS ops_bc_todos (
       bc_id VARCHAR(50) PRIMARY KEY,
       project_id VARCHAR(50) NOT NULL,
       todolist_id VARCHAR(50),
       title TEXT NOT NULL,
       description TEXT,
       status VARCHAR(30) NOT NULL DEFAULT 'active',
       due_on DATE,
       assignee_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
       bc_creator_id VARCHAR(50),
       bc_app_url TEXT,
       urgency_score INTEGER,
       ai_opportunity_score INTEGER,
       brand_score INTEGER,
       category VARCHAR(40) NOT NULL DEFAULT 'unscored',
       last_human_action_at TIMESTAMPTZ,
       downstream_blocked_count INTEGER NOT NULL DEFAULT 0,
       bc_created_at TIMESTAMPTZ NOT NULL,
       bc_updated_at TIMESTAMPTZ NOT NULL,
       last_synced_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
       created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
       updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
     )`,
    `CREATE INDEX IF NOT EXISTS idx_ops_bc_todos_project ON ops_bc_todos (project_id)`,
    `CREATE INDEX IF NOT EXISTS idx_ops_bc_todos_status ON ops_bc_todos (status)`,
    `CREATE INDEX IF NOT EXISTS idx_ops_bc_todos_urgency ON ops_bc_todos (urgency_score)`,
    `CREATE INDEX IF NOT EXISTS idx_ops_bc_todos_category ON ops_bc_todos (category)`,
    `CREATE INDEX IF NOT EXISTS idx_ops_bc_todos_due ON ops_bc_todos (due_on)`,

    `CREATE TABLE IF NOT EXISTS ops_ai_assessments (
       id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
       todo_bc_id VARCHAR(50) NOT NULL,
       agent VARCHAR(60) NOT NULL,
       agent_version VARCHAR(20) NOT NULL,
       urgency_score INTEGER,
       ai_opportunity_score INTEGER,
       brand_score INTEGER,
       category VARCHAR(40),
       reasoning JSONB,
       llm_model VARCHAR(60),
       llm_input_tokens INTEGER,
       llm_output_tokens INTEGER,
       llm_cost_usd DECIMAL(10,5),
       computed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
       created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
       updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
     )`,
    `CREATE INDEX IF NOT EXISTS idx_ops_ai_assess_todo ON ops_ai_assessments (todo_bc_id, computed_at)`,
    `CREATE INDEX IF NOT EXISTS idx_ops_ai_assess_agent ON ops_ai_assessments (agent)`,
    `CREATE INDEX IF NOT EXISTS idx_ops_ai_assess_computed ON ops_ai_assessments (computed_at)`,

    `CREATE TABLE IF NOT EXISTS ops_approval_queue (
       id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
       todo_bc_id VARCHAR(50) NOT NULL,
       artifact_id UUID,
       summary TEXT NOT NULL,
       recommended_decision VARCHAR(40),
       confidence DECIMAL(4,3),
       estimated_review_seconds INTEGER,
       blocked_downstream_count INTEGER NOT NULL DEFAULT 0,
       urgency_snapshot INTEGER,
       ai_opportunity_snapshot INTEGER,
       target_user_id VARCHAR(100),
       enqueued_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
       decided_at TIMESTAMPTZ,
       decision VARCHAR(40),
       decided_by VARCHAR(100),
       decision_reasoning TEXT,
       next_actions JSONB,
       created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
       updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
     )`,
    `CREATE INDEX IF NOT EXISTS idx_ops_approval_open ON ops_approval_queue (decided_at)`,
    `CREATE INDEX IF NOT EXISTS idx_ops_approval_urgency ON ops_approval_queue (urgency_snapshot)`,
    `CREATE INDEX IF NOT EXISTS idx_ops_approval_user_open ON ops_approval_queue (target_user_id, decided_at)`,
    `CREATE INDEX IF NOT EXISTS idx_ops_approval_todo ON ops_approval_queue (todo_bc_id)`,

    // Phase 1 additions
    `ALTER TABLE ops_bc_todos ADD COLUMN IF NOT EXISTS todolist_name TEXT`,
    `ALTER TABLE ops_bc_todos ADD COLUMN IF NOT EXISTS is_dismissed BOOLEAN NOT NULL DEFAULT FALSE`,
    `ALTER TABLE ops_bc_todos ADD COLUMN IF NOT EXISTS dismissed_at TIMESTAMPTZ`,
    `ALTER TABLE ops_bc_todos ADD COLUMN IF NOT EXISTS dismissed_by VARCHAR(120)`,
    `ALTER TABLE ops_bc_todos ADD COLUMN IF NOT EXISTS dismissed_reason VARCHAR(40)`,
    `CREATE INDEX IF NOT EXISTS idx_ops_bc_todos_dismissed ON ops_bc_todos (is_dismissed)`,
    `CREATE TABLE IF NOT EXISTS ops_bc_projects (
       bc_id VARCHAR(50) PRIMARY KEY,
       name TEXT NOT NULL,
       description TEXT,
       is_cb_managed BOOLEAN NOT NULL DEFAULT TRUE,
       weight DECIMAL(3,2) NOT NULL DEFAULT 1.0,
       last_synced_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
       created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
       updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
     )`,
    `CREATE INDEX IF NOT EXISTS idx_ops_bc_projects_cb_managed ON ops_bc_projects (is_cb_managed)`,

    // Phase 2-light: skill extraction
    `CREATE TABLE IF NOT EXISTS ops_skills (
       id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
       name TEXT NOT NULL,
       action_kind VARCHAR(40) NOT NULL DEFAULT 'default',
       captured_from_todo_bc_id VARCHAR(50),
       captured_from_todo_title TEXT,
       reasoning TEXT,
       decision VARCHAR(40),
       is_active BOOLEAN NOT NULL DEFAULT TRUE,
       use_count INTEGER NOT NULL DEFAULT 0,
       created_by VARCHAR(120),
       created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
       updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
     )`,
    `CREATE INDEX IF NOT EXISTS idx_ops_skills_action_kind ON ops_skills (action_kind)`,
    `CREATE INDEX IF NOT EXISTS idx_ops_skills_active ON ops_skills (is_active)`,

    // Phase 4-light: automation rules
    `CREATE TABLE IF NOT EXISTS ops_automation_rules (
       id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
       name TEXT NOT NULL,
       description TEXT,
       condition_jsonb JSONB NOT NULL DEFAULT '{}'::jsonb,
       action_jsonb JSONB NOT NULL DEFAULT '{}'::jsonb,
       is_active BOOLEAN NOT NULL DEFAULT TRUE,
       last_fired_at TIMESTAMPTZ,
       fire_count INTEGER NOT NULL DEFAULT 0,
       created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
       updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
     )`,
    `CREATE INDEX IF NOT EXISTS idx_ops_automation_rules_active ON ops_automation_rules (is_active)`,

    `CREATE TABLE IF NOT EXISTS ops_metrics_daily (
       date DATE PRIMARY KEY,
       approvals_completed INTEGER NOT NULL DEFAULT 0,
       approvals_open_at_end INTEGER NOT NULL DEFAULT 0,
       approvals_avg_seconds INTEGER,
       approvals_p95_seconds INTEGER,
       downstream_unblocked INTEGER NOT NULL DEFAULT 0,
       hours_saved_estimated DECIMAL(8,2) NOT NULL DEFAULT 0,
       hours_blocked_estimated DECIMAL(8,2) NOT NULL DEFAULT 0,
       revenue_at_risk_estimated DECIMAL(12,2),
       revenue_protected_estimated DECIMAL(12,2),
       meetings_eliminated INTEGER NOT NULL DEFAULT 0,
       skills_created INTEGER NOT NULL DEFAULT 0,
       skills_used INTEGER NOT NULL DEFAULT 0,
       automations_fired INTEGER NOT NULL DEFAULT 0,
       agent_calls_count INTEGER NOT NULL DEFAULT 0,
       agent_total_cost_usd DECIMAL(10,4) NOT NULL DEFAULT 0,
       created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
       updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
     )`,
  ];
  for (const sql of statements) {
    try {
      await sequelize.query(sql);
    } catch (err: any) {
      console.warn(`[DB] Ops Command Center schema statement failed:`, err.message?.split('\n')[0]);
    }
  }
  console.log('[DB] Ops Command Center schema ensured');
}

// Explicit migration: ensure Lead Ingestion tables + Lead columns exist.
// Runs BEFORE sequelize.sync so the FK on leads.source_id can resolve during alter.
async function ensureIngestionSchema() {
  const statements = [
    `CREATE TABLE IF NOT EXISTS lead_sources (
       id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
       slug VARCHAR(100) UNIQUE NOT NULL,
       name VARCHAR(255) NOT NULL,
       domain VARCHAR(255) NOT NULL,
       api_key_hash VARCHAR(255),
       hmac_secret VARCHAR(255),
       hmac_secret_prev VARCHAR(255),
       rate_limit INTEGER,
       is_active BOOLEAN NOT NULL DEFAULT TRUE,
       created_at TIMESTAMPTZ DEFAULT NOW(),
       updated_at TIMESTAMPTZ
     )`,
    `CREATE TABLE IF NOT EXISTS entry_points (
       id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
       source_id UUID NOT NULL REFERENCES lead_sources(id) ON DELETE CASCADE,
       slug VARCHAR(100) NOT NULL,
       name VARCHAR(255),
       page VARCHAR(500),
       form_name VARCHAR(255),
       description TEXT,
       is_active BOOLEAN NOT NULL DEFAULT TRUE,
       created_at TIMESTAMPTZ DEFAULT NOW(),
       updated_at TIMESTAMPTZ,
       UNIQUE (source_id, slug)
     )`,
    `CREATE TABLE IF NOT EXISTS form_definitions (
       id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
       entry_point_id UUID NOT NULL REFERENCES entry_points(id) ON DELETE CASCADE,
       field_map JSONB NOT NULL DEFAULT '{}'::jsonb,
       required_fields JSONB NOT NULL DEFAULT '["email"]'::jsonb,
       version INTEGER NOT NULL DEFAULT 1,
       is_active BOOLEAN NOT NULL DEFAULT TRUE,
       created_at TIMESTAMPTZ DEFAULT NOW(),
       updated_at TIMESTAMPTZ
     )`,
    `CREATE TABLE IF NOT EXISTS routing_rules (
       id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
       name VARCHAR(255) NOT NULL,
       priority INTEGER NOT NULL DEFAULT 100,
       conditions JSONB NOT NULL DEFAULT '{}'::jsonb,
       actions JSONB NOT NULL DEFAULT '[]'::jsonb,
       continue_on_match BOOLEAN NOT NULL DEFAULT FALSE,
       is_active BOOLEAN NOT NULL DEFAULT TRUE,
       created_at TIMESTAMPTZ DEFAULT NOW(),
       updated_at TIMESTAMPTZ
     )`,
    `CREATE TABLE IF NOT EXISTS raw_lead_payloads (
       id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
       source_slug VARCHAR(100),
       entry_slug VARCHAR(100),
       headers JSONB,
       body JSONB,
       remote_ip VARCHAR(64),
       received_at TIMESTAMPTZ DEFAULT NOW(),
       resulting_lead_id INTEGER,
       status VARCHAR(20) NOT NULL DEFAULT 'pending',
       error_message TEXT
     )`,
    `ALTER TABLE leads ADD COLUMN IF NOT EXISTS source_id UUID`,
    `ALTER TABLE leads ADD COLUMN IF NOT EXISTS entry_point_id UUID`,
    `CREATE INDEX IF NOT EXISTS idx_lead_sources_active ON lead_sources (is_active)`,
    `CREATE INDEX IF NOT EXISTS idx_entry_points_active ON entry_points (is_active)`,
    `CREATE INDEX IF NOT EXISTS idx_form_defs_entry_active ON form_definitions (entry_point_id, is_active)`,
    `CREATE INDEX IF NOT EXISTS idx_routing_rules_active_priority ON routing_rules (is_active, priority)`,
    `CREATE INDEX IF NOT EXISTS idx_raw_payloads_received_at ON raw_lead_payloads (received_at)`,
    `CREATE INDEX IF NOT EXISTS idx_raw_payloads_status ON raw_lead_payloads (status)`,
    `CREATE INDEX IF NOT EXISTS idx_raw_payloads_source_entry ON raw_lead_payloads (source_slug, entry_slug)`,
    `CREATE INDEX IF NOT EXISTS idx_raw_payloads_lead ON raw_lead_payloads (resulting_lead_id)`,
  ];
  for (const sql of statements) {
    try {
      await sequelize.query(sql);
    } catch (err: any) {
      console.warn(`[DB] Ingestion schema statement failed:`, err.message?.split('\n')[0]);
    }
  }
  console.log('[DB] Ingestion schema ensured');
}

// Explicit migration: ensure composite index for the admin communications
// list endpoint's outcomes subquery. Sync-based index creation is unreliable
// on prod (alter sync hits out-of-shared-memory on 170+ models).
async function ensureCommunicationIndexes() {
  // CONCURRENTLY avoids locking the table during index build — important on
  // prod where interaction_outcomes is write-heavy.
  try {
    await sequelize.query(
      `CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_interaction_outcomes_lead_channel_created
       ON interaction_outcomes (lead_id, channel, created_at)`
    );
    console.log('[DB] Communication indexes ensured');
  } catch (err: any) {
    console.warn('[DB] Communication index ensure failed:', err?.message);
  }
}

// Explicit migration: ensure Campaign Link Registry columns exist even if alter sync fails
async function ensureCampaignLinkColumns() {
  const columns = [
    { name: 'channel', sql: "ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS channel VARCHAR(30)" },
    { name: 'destination_path', sql: "ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS destination_path VARCHAR(255)" },
    { name: 'tracking_link', sql: "ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS tracking_link VARCHAR(500)" },
    { name: 'objective', sql: "ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS objective TEXT" },
    { name: 'approval_status', sql: "ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS approval_status VARCHAR(30) DEFAULT 'draft'" },
    { name: 'approved_by', sql: "ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS approved_by UUID" },
    { name: 'approved_at', sql: "ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS approved_at TIMESTAMPTZ" },
    { name: 'budget_cap', sql: "ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS budget_cap DECIMAL(10,2)" },
    { name: 'cost_per_lead_target', sql: "ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS cost_per_lead_target DECIMAL(10,2)" },
    { name: 'expected_roi', sql: "ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS expected_roi DECIMAL(8,2)" },
  ];
  for (const col of columns) {
    try {
      await sequelize.query(col.sql);
    } catch (err: any) {
      if (!err.message?.includes('already exists')) {
        console.warn(`[DB] Failed to ensure column ${col.name}:`, err.message);
      }
    }
  }
  console.log('[DB] Campaign link registry columns ensured');
}

// Missed Opportunities Report schema — explicit idempotent creation because
// alter sync is unreliable on prod (hits pre-existing index conflicts and
// never reaches new models). Mirrors the Sequelize models in
// InboxOpportunityScore / InboxFalseNegativeFeedback / InboxSurfacePreference.
async function ensureMissedOpportunitiesSchema() {
  const statements = [
    `CREATE TABLE IF NOT EXISTS inbox_opportunity_scores (
       id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
       email_id UUID NOT NULL REFERENCES inbox_emails(id),
       report_date DATE NOT NULL,
       score INTEGER NOT NULL DEFAULT 0,
       band VARCHAR(10) NOT NULL DEFAULT 'low',
       confidence INTEGER NOT NULL DEFAULT 0,
       reason_hidden TEXT,
       hidden_state VARCHAR(20) NOT NULL,
       factors JSONB NOT NULL DEFAULT '[]'::jsonb,
       topics JSONB NOT NULL DEFAULT '[]'::jsonb,
       computed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
     )`,
    `CREATE UNIQUE INDEX IF NOT EXISTS idx_inbox_opp_scores_email_date
       ON inbox_opportunity_scores(email_id, report_date)`,
    `CREATE INDEX IF NOT EXISTS idx_inbox_opp_scores_report_date
       ON inbox_opportunity_scores(report_date)`,
    `CREATE INDEX IF NOT EXISTS idx_inbox_opp_scores_score
       ON inbox_opportunity_scores(score)`,
    `CREATE TABLE IF NOT EXISTS inbox_false_negative_feedback (
       id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
       email_id UUID NOT NULL REFERENCES inbox_emails(id),
       action VARCHAR(30) NOT NULL,
       source VARCHAR(20) NOT NULL DEFAULT 'report',
       score_at_feedback INTEGER,
       created_by VARCHAR(120),
       created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
     )`,
    `CREATE INDEX IF NOT EXISTS idx_inbox_fn_feedback_email_id
       ON inbox_false_negative_feedback(email_id)`,
    `CREATE INDEX IF NOT EXISTS idx_inbox_fn_feedback_action
       ON inbox_false_negative_feedback(action)`,
    `CREATE INDEX IF NOT EXISTS idx_inbox_fn_feedback_created_at
       ON inbox_false_negative_feedback(created_at)`,
    `CREATE TABLE IF NOT EXISTS inbox_surface_preferences (
       id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
       pattern_type VARCHAR(10) NOT NULL,
       pattern_value VARCHAR(255) NOT NULL,
       source_email_id UUID,
       enabled BOOLEAN NOT NULL DEFAULT true,
       created_by VARCHAR(120),
       created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
     )`,
    `CREATE UNIQUE INDEX IF NOT EXISTS idx_inbox_surface_pref_pattern
       ON inbox_surface_preferences(pattern_type, pattern_value)`,
    `CREATE INDEX IF NOT EXISTS idx_inbox_surface_pref_enabled
       ON inbox_surface_preferences(enabled)`,
    `CREATE TABLE IF NOT EXISTS inbox_deleted_emails (
       id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
       provider VARCHAR(20) NOT NULL,
       provider_message_id VARCHAR(255) NOT NULL,
       folder VARCHAR(10) NOT NULL,
       from_address VARCHAR(320) NOT NULL,
       from_name VARCHAR(320),
       to_addresses JSONB NOT NULL DEFAULT '[]'::jsonb,
       subject TEXT NOT NULL,
       body_text TEXT,
       body_html TEXT,
       headers JSONB,
       received_at TIMESTAMPTZ NOT NULL,
       discovered_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
       has_attachments BOOLEAN NOT NULL DEFAULT false
     )`,
    `CREATE UNIQUE INDEX IF NOT EXISTS idx_inbox_deleted_provider_msg
       ON inbox_deleted_emails(provider, provider_message_id)`,
    `CREATE INDEX IF NOT EXISTS idx_inbox_deleted_received_at
       ON inbox_deleted_emails(received_at)`,
    `CREATE INDEX IF NOT EXISTS idx_inbox_deleted_folder
       ON inbox_deleted_emails(folder)`,
  ];
  for (const sql of statements) {
    try {
      await sequelize.query(sql);
    } catch (err: any) {
      if (!err.message?.includes('already exists')) {
        console.warn('[DB] Failed to ensure Missed Opportunities schema:', err.message);
      }
    }
  }
  console.log('[DB] Missed Opportunities schema ensured');
}

async function start(): Promise<void> {
  // Ensure uploads directory exists
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });

  await connectDatabase();

  // Migrate mini_section_type from ENUM to VARCHAR for dynamic curriculum types
  try {
    await sequelize.query(`
      DO $$ BEGIN
        IF EXISTS (
          SELECT 1 FROM pg_type WHERE typname = 'enum_mini_sections_mini_section_type'
        ) THEN
          ALTER TABLE mini_sections ALTER COLUMN mini_section_type TYPE VARCHAR(100) USING mini_section_type::VARCHAR;
          DROP TYPE IF EXISTS "enum_mini_sections_mini_section_type";
          RAISE NOTICE 'Migrated mini_section_type ENUM -> VARCHAR';
        END IF;
      END $$;
    `);
  } catch (err: any) {
    console.warn('[DB] mini_section_type ENUM migration skipped:', err?.message);
  }

  // Ingestion schema first — so the leads.source_id FK can resolve during alter sync.
  await ensureIngestionSchema();
  // Ops Command Center schema — explicit creation because alter sync hits
  // pre-existing index conflicts elsewhere and never reaches the ops_* models.
  await ensureOpsCommandCenterSchema();
  // Missed Opportunities Report schema (idempotent, before alter sync).
  await ensureMissedOpportunitiesSchema();
  // Seed v0 automation rules (idempotent).
  try {
    const { seedDefaultAutomationRules } = await import('./services/ops/automationRulesService');
    await seedDefaultAutomationRules();
  } catch (err: any) {
    console.warn('[OpsAutomation] seed failed:', err?.message);
  }

  try {
    await sequelize.sync({ alter: true });
  } catch (err: any) {
    console.warn('[DB] sync({ alter: true }) failed, falling back to create-only sync:', err?.message);
    try {
      await sequelize.sync();
    } catch (fallbackErr: any) {
      console.warn('[DB] fallback sync also failed:', fallbackErr?.message);
    }
  }
  await ensureCampaignLinkColumns();
  await ensureCommunicationIndexes();
  try {
    const { seedMissedOpportunitiesReport } = await import('./seeds/seedMissedOpportunitiesReport');
    await seedMissedOpportunitiesReport();
  } catch (err: any) {
    console.warn('[Seed] Missed Opportunities Report registration failed:', err?.message);
  }
  await seedProgramCurriculum();
  await seedDepartments();
  await seedCurriculumTypeDefinitions();

  // Seed landing pages and migrate existing campaign deployments
  try {
    const { seedLandingPages, migrateExistingCampaigns } = await import('./services/deploymentService');
    await seedLandingPages();
    const migrationResult = await migrateExistingCampaigns();
    if (migrationResult.migrated > 0) {
      console.log(`[Deploy] Migrated ${migrationResult.migrated} campaigns to deployments`);
    }
  } catch (err: any) {
    console.warn('[Deploy] Landing page / deployment seed failed:', err?.message);
  }
  // Run campaign seeding in background — it may make slow external API calls (GHL)
  // that should not block server startup
  seedAllCampaigns().catch((err) =>
    console.error('[Seed] Campaign seeding failed:', err?.message)
  );

  // Intelligence OS: ensure tables exist and start autonomous discovery
  await ensureIntelligenceTables();
  setTimeout(() => {
    runDiscoveryAgent().catch((err) =>
      console.error('[Intelligence] Startup discovery failed:', err?.message)
    );
  }, 5000);
  cron.schedule('*/10 * * * *', () => {
    runDiscoveryAgent().catch((err) =>
      console.error('[Intelligence] Scheduled discovery failed:', err?.message)
    );
  });

  // AI Ops Command Center metrics_daily rollup — runs on the 5-minute
  // cadence so the Today's Pulse tile stays fresh during the day. The
  // upsert is idempotent + cheap (one row per date).
  cron.schedule('*/5 * * * *', async () => {
    try {
      const { rollupToday } = await import('./services/ops/metricsDailyService');
      await rollupToday();
    } catch (err: any) {
      console.warn('[OpsMetricsDaily] scheduled rollup failed:', err?.message);
    }
  });

  // AI Ops Command Center BC mirror — pulls all projects → todolists → todos
  // every 2 min so the Command Center reads from a fresh local mirror.
  // After each sync, runs the Priority Engine v0 over the mirror so the
  // Waiting on Human queue surface is sorted by a meaningful urgency score.
  cron.schedule('*/2 * * * *', async () => {
    try {
      const [{ runBcSync }, { runPriorityEngine }, opsRoutesMod] = await Promise.all([
        import('./services/ops/bcSyncService'),
        import('./services/ops/priorityEngineService'),
        import('./routes/admin/opsRoutes'),
      ]);
      const syncResult = await runBcSync();
      opsRoutesMod.setLastSync(syncResult);
      if (syncResult.errors.length > 0) {
        console.warn(
          `[OpsBcSync] completed with ${syncResult.errors.length} errors`,
          syncResult.errors.slice(0, 3),
        );
      }
      // Score every active todo after the mirror is fresh.
      const scoreResult = await runPriorityEngine();
      opsRoutesMod.setLastPriorityRun(scoreResult);
      if (scoreResult.errors.length > 0) {
        console.warn(
          `[OpsPriorityEngine] completed with ${scoreResult.errors.length} errors`,
          scoreResult.errors.slice(0, 3),
        );
      }
      // Run automation rules after scoring.
      try {
        const { runAutomationRules } = await import('./services/ops/automationRulesService');
        const automationResult = await runAutomationRules();
        opsRoutesMod.setLastAutomationRun(automationResult);
        if (automationResult.rules_fired > 0) {
          console.log(
            `[OpsAutomation] fired ${automationResult.rules_fired} rule(s)`,
            automationResult.fire_results.filter((f) => f.rows_affected > 0),
          );
        }
      } catch (err: any) {
        console.warn('[OpsAutomation] cron run failed:', err?.message);
      }
    } catch (err: any) {
      console.warn('[OpsBcSync/Priority] scheduled run failed:', err?.message);
    }
  });

  // Server-side Architect build retrieval: pull + build out completed Architect
  // builds even if the user closed the tab (client polling can't be relied on
  // for a ~15-min build). Runs every 2 minutes; idempotent.
  cron.schedule('*/2 * * * *', () => {
    import('./services/architectBuildPollerService')
      .then(({ pollArchitectBuilds }) => pollArchitectBuilds())
      .catch((err) => console.warn('[ArchitectPoller] scheduled run failed:', err?.message));
  });

  // Start follow-up email scheduler if enabled
  if (env.enableFollowUpScheduler) {
    startScheduler();
  }

  app.listen(env.port, () => {
    console.log(`Server running on port ${env.port} [${env.nodeEnv}]`);
  });
}

start();

export default app;
