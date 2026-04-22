import fs from 'fs';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { env } from './config/env';
import { connectDatabase, sequelize } from './config/database';
import { errorHandler } from './middlewares/errorHandler';
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
