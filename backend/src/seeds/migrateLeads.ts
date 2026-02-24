import { sequelize } from '../config/database';
import '../models'; // ensure all models + associations are loaded

async function migrateLeads() {
  try {
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
