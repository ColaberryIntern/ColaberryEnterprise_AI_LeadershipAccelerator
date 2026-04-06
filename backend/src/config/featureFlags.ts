/**
 * Feature Flags — controls experimental features per environment.
 * Set via environment variables in .env / .env.dev
 */

export const FLAGS = {
  executionReconciliation: process.env.ENABLE_EXECUTION_ENGINE === 'true',
  contextGraphV2: process.env.ENABLE_CONTEXT_GRAPH_V2 === 'true',
  experimentalFeatures: process.env.ENABLE_EXPERIMENTAL_FEATURES === 'true',
};

export const isDev = process.env.APP_ENV === 'dev';
export const isProd = process.env.APP_ENV !== 'dev';
