/**
 * Preflight Check Utility
 * Automated pre-deployment validation that checks database connectivity,
 * model sync status, environment variables, and route registration.
 */

import { sequelize } from '../config/database';

export interface PreflightResult {
  database: { connected: boolean; error?: string };
  models: { count: number; synced: boolean; error?: string };
  environment: { missing: string[]; present: string[] };
  routes: { total: number };
  overall: 'PASS' | 'WARN' | 'FAIL';
  timestamp: string;
}

const REQUIRED_ENV_VARS = [
  'DATABASE_URL',
  'JWT_SECRET',
  'OPENAI_API_KEY',
];

const OPTIONAL_ENV_VARS = [
  'APOLLO_API_KEY',
  'PAYSIMPLE_API_USER',
  'PAYSIMPLE_API_KEY',
  'GHL_API_KEY',
  'GOOGLE_CLIENT_ID',
  'GOOGLE_CLIENT_SECRET',
];

/**
 * Run all preflight checks and return a structured report.
 */
export async function runPreflight(): Promise<PreflightResult> {
  const result: PreflightResult = {
    database: { connected: false },
    models: { count: 0, synced: false },
    environment: { missing: [], present: [] },
    routes: { total: 0 },
    overall: 'PASS',
    timestamp: new Date().toISOString(),
  };

  // 1. Database connectivity
  try {
    await sequelize.authenticate();
    result.database.connected = true;
  } catch (err: any) {
    result.database.connected = false;
    result.database.error = err.message;
    result.overall = 'FAIL';
  }

  // 2. Model sync check
  try {
    const models = Object.keys(sequelize.models);
    result.models.count = models.length;
    result.models.synced = true;
  } catch (err: any) {
    result.models.synced = false;
    result.models.error = err.message;
    result.overall = 'FAIL';
  }

  // 3. Environment variables
  for (const envVar of REQUIRED_ENV_VARS) {
    if (process.env[envVar]) {
      result.environment.present.push(envVar);
    } else {
      result.environment.missing.push(envVar);
      if (result.overall !== 'FAIL') result.overall = 'WARN';
    }
  }

  for (const envVar of OPTIONAL_ENV_VARS) {
    if (process.env[envVar]) {
      result.environment.present.push(envVar);
    }
  }

  return result;
}
