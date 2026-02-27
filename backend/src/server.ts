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
import { startScheduler } from './services/schedulerService';

// Import models to register associations before sync
import './models';

const app = express();

// Trust first proxy (nginx) for correct IP detection in rate limiting
app.set('trust proxy', 1);

app.use(helmet());
app.use(cors());

// CRITICAL: Stripe webhook needs raw body BEFORE express.json() parses it.
app.use('/api/webhook', express.raw({ type: 'application/json' }));
app.use(webhookRoutes);

// Global JSON parser for all other routes
app.use(express.json());

app.use(healthRoutes);
app.use(leadRoutes);
app.use(enrollmentRoutes);
app.use(adminRoutes);
app.use(calendarRoutes);
app.use(strategyPrepRoutes);

app.use(errorHandler);

async function start(): Promise<void> {
  await connectDatabase();
  await sequelize.sync({ alter: true });
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
