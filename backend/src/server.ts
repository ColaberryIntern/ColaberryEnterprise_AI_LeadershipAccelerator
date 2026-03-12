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

// CRITICAL: Stripe webhook needs raw body BEFORE express.json() parses it.
// Use exact path match so other /api/webhook/* routes get normal JSON parsing.
app.use('/api/webhook', (req, res, next) => {
  // Only apply raw body parsing to the exact Stripe webhook path
  if (req.path === '/' || req.path === '') {
    express.raw({ type: 'application/json' })(req, res, next);
  } else {
    next();
  }
});
app.use(webhookRoutes);

// Global JSON parser for all other routes
app.use(express.json());

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

app.use(errorHandler);

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

  try {
    await sequelize.sync({ alter: true });
  } catch (err: any) {
    console.warn('[DB] sync({ alter: true }) failed, falling back to create-only sync:', err?.message);
    await sequelize.sync();
  }
  await ensureCampaignLinkColumns();
  await seedProgramCurriculum();
  await seedDepartments();
  await seedCurriculumTypeDefinitions();
  await seedAllCampaigns();

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
