/**
 * Feature Flags — controls experimental features per environment.
 * Set via environment variables in .env / .env.dev
 */

export const FLAGS = {
  executionReconciliation: process.env.ENABLE_EXECUTION_ENGINE === 'true',
  contextGraphV2: process.env.ENABLE_CONTEXT_GRAPH_V2 === 'true',
  experimentalFeatures: process.env.ENABLE_EXPERIMENTAL_FEATURES === 'true',
  // AI Project Factory Phase 2 — the LLM decomposition capability. Ships DARK (default off);
  // the code is inert until ENABLE_FACTORY_GENERATION=true, so deploying it changes nothing.
  factoryGeneration: process.env.ENABLE_FACTORY_GENERATION === 'true',
  // Unified project lifecycle (docs/project-lifecycle/architecture.md). Ships DARK (default off),
  // the same shape as factoryGeneration above: the routes answer an explicit
  // 409 { lifecycleDisabled: true } until ENABLE_PROJECT_LIFECYCLE=true, never a soft success.
  //
  // NOTE: the flag gates BEHAVIOUR, not schema. ensureProjectLifecycleSchema runs at boot
  // regardless, so the tables exist on the next backend deploy either way — see the comment at
  // its registration in server.ts. The code is dark; the schema is not.
  lifecycleEnforcement: process.env.ENABLE_PROJECT_LIFECYCLE === 'true',
  // Gov pursuit STEP 6 — on a bid-pursuit APPROVAL, auto-create the two-track gov delivery project
  // (Proposal + Build tracks) and map the established requirements onto it. Ships DARK (default off);
  // the approval route calls it only when ENABLE_GOV_INGESTION=true, so deploying it changes nothing.
  // Creating the project NEVER authorizes a build — buildAuthorization stays the separate (held) gate.
  govIngestion: process.env.ENABLE_GOV_INGESTION === 'true',
};

export const isDev = process.env.APP_ENV === 'dev';
export const isProd = process.env.APP_ENV !== 'dev';
