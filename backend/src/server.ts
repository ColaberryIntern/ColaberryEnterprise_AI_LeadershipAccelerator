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

async function start(): Promise<void> {
  // Ensure uploads directory exists
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });

  await connectDatabase();
  try {
    await sequelize.sync({ alter: true });
  } catch (err: any) {
    console.warn('[DB] sync({ alter: true }) failed, falling back to create-only sync:', err?.message);
    await sequelize.sync();
  }
  await seedProgramCurriculum();
  await seedDepartments();

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
