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
  // Gov pursuit daily tracking — a daily job that re-checks the live v1 discovery feed for opportunities we're
  // pursuing and flags a changed close date or a drop from the feed (refreshing the countdown). Ships DARK
  // (default off) behind its OWN flag — distinct from govIngestion (already on) so deploying does not auto-run it.
  // Narrow by design: v1 feed carries the close DATE only, never amendments/meetings (no programmatic Bonfire).
  govDailySync: process.env.ENABLE_GOV_DAILY_SYNC === 'true',
  // Gov solicitation extractor AI comprehension pass. Ships DARK (default off). The regex extractor is unchanged;
  // with the flag on, the read-only /extract-requirements route ALSO runs a quote-verified AI pass and merges it
  // AFTER the deterministic rows (never renumbering or removing one). Flag off = byte-identical deterministic output.
  govAiExtraction: process.env.ENABLE_GOV_AI_EXTRACTION === 'true',
  // SBP source-overflow BLOCK (P7-T1.3). Ships DARK (default off). With it off, an over-long
  // brief or document is clipped and labelled exactly as it is today; with it on, `sourceBlocks`
  // refuses rather than silently sending the model half a student's brief.
  //
  // The promotion from detect-only to blocking is not a preference. `plan-phase7.md` section 3.3
  // pre-registered the rule BEFORE the data was seen -- "any build in the last 90 days exceeded
  // the cap -> implement a blocking overflow behind the new flag" -- precisely so the measurement
  // could not be read to suit the outcome. Measured 16 Oct 2026 with the shipped `buildBriefText`
  // over the stored rows: 11 of 48, p90 27,772 against a 20,000 cap. The blocking branch fires.
  sbpSourceOverflowBlock: process.env.ENABLE_SBP_SOURCE_OVERFLOW_BLOCK === 'true',
  // SAFE-002. `delimited()` interpolates an untrusted body raw, so a body carrying its own
  // `</TAG>` closes the block early and everything after it sits outside any delimiter. On it,
  // `neutraliseDelimiters` rewrites those brackets to single angle quotation marks: readable to
  // the model, inert as markup, and refusing nobody.
  //
  // DEFAULT OFF, AND THE DEFAULT IS THE DECISION. The finding pre-registered its rule before the
  // measurement -- "zero forged tags in stored briefs -> latent; PROPOSE the fix rather than
  // change a live student prompt path" -- and the measurement was zero, 0 of 48. So the code
  // ships inert and turning it on stays the DRI's call. The factory half, whose bodies are
  // parsed OOXML and proposal text where a `<` is ordinary rather than unlikely, was never
  // measurable at all, which is why the switch covers both prompt builders and not only the
  // one with a number against it.
  promptDelimiterNeutralisation: process.env.ENABLE_PROMPT_DELIMITER_NEUTRALISATION === 'true',
};

export const isDev = process.env.APP_ENV === 'dev';
export const isProd = process.env.APP_ENV !== 'dev';
