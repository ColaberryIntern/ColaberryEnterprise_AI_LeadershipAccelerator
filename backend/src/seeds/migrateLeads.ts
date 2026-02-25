import { sequelize } from '../config/database';
import '../models'; // ensure all models + associations are loaded

async function migrateLeads() {
  try {
    console.log('[Migration] Extending ENUM types if needed...');

    // Extend automation_logs type ENUM to include 'alert'
    await sequelize.query(`
      DO $$
      BEGIN
        IF EXISTS (SELECT 1 FROM pg_type WHERE typname = 'enum_automation_logs_type') THEN
          BEGIN
            ALTER TYPE "enum_automation_logs_type" ADD VALUE IF NOT EXISTS 'alert';
          EXCEPTION WHEN duplicate_object THEN
            RAISE NOTICE 'enum value alert already exists';
          END;
        END IF;
      END
      $$;
    `).catch((err: any) => {
      console.warn('[Migration] ENUM extension warning (may be OK):', err.message);
    });

    console.log('[Migration] Syncing Lead and AutomationLog tables...');
    await sequelize.sync({ alter: true });
    console.log('[Migration] Tables synced successfully.');
    process.exit(0);
  } catch (error) {
    console.error('[Migration] Failed:', error);
    process.exit(1);
  }
}

migrateLeads();
