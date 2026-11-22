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
  // SBP story-authorization gate ENFORCEMENT (L8.4, P8-T4). Ships DARK (default off), and the
  // default is deliberate, not provisional.
  //
  // `sbpOrchestrator` now passes `projectId` into `decomposeBuild`, so the story gate is CONSULTED
  // on every student build generation (it was unreachable before, because no project id was
  // passed). What this flag controls is what a REFUSAL does:
  //   off (observe) -> log `sbp_story_gate_would_refuse` and PROCEED. The gate is armed and
  //                    measured, but it cannot break a build that cannot yet pass it.
  //   on  (enforce) -> throw `StoryNotAuthorizedError`, refusing the build.
  //
  // Measured on production 2026-11-03 over all 82 student projects: hard enforcement would refuse
  // 20 (every post-cutoff project), because ZERO projects hold an approved lifecycle blueprint —
  // the blueprint-approval step is not wired into the student build flow yet. So this flag stays
  // off until that path exists; observe mode surfaces exactly who would be refused in the meantime.
  // The per-project legacy cutoff (`STUDENT_REGISTRATION_LIVE_SINCE`) is separate and already
  // permits the 62 pre-cutoff builds regardless of this flag.
  sbpStoryGateEnforce: process.env.ENABLE_SBP_STORY_GATE_ENFORCE === 'true',
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
  // Gov pursuit daily SWEEP (PR 2 of the vetting pipeline) — hides low-fit discovery rows SILENTLY and emails the
  // DRI two prompts (upload requirements -> vet + assign). Ships DARK (default off) behind its OWN flag, distinct
  // from govDailySync (tracking only), so registering/deploying it changes nothing until ENABLE_GOV_OPP_SWEEP=true.
  govOpportunitySweep: process.env.ENABLE_GOV_OPP_SWEEP === 'true',
  // Gov solicitation extractor AI comprehension pass. Ships DARK (default off). The regex extractor is unchanged;
  // with the flag on, the read-only /extract-requirements route ALSO runs a quote-verified AI pass and merges it
  // AFTER the deterministic rows (never renumbering or removing one). Flag off = byte-identical deterministic output.
  govAiExtraction: process.env.ENABLE_GOV_AI_EXTRACTION === 'true',
  // Gov automatic AI checks: when a solicitation ZIP's extraction completes, run capability fit, summary, buyer questions
  // and a go/no-go, and save them to gov_ai_vettings. Advisory: it sets no gate. Off stops new runs; saved results stay.
  govAiVetting: process.env.ENABLE_GOV_AI_VETTING === 'true',
  // Gov capability fit: "have" must be PROVEN (Services Upgrade SV2.2, package 1G). With it on, a capability the AI
  // assessed as "have" on a service with ZERO confirmed case-study links is downgraded to "partial" with the reason
  // "service has no linked case study". Ships DARK (default off), and the default is the decision: on 2026-11-13
  // production had 18 published case studies and ZERO confirmed service links, so turning it on would flip every
  // "have" to "partial" and move live go/no-go coverage. Evidence citation and possibleProof ship ON regardless; only
  // the downgrade waits for links to be confirmed. Read once at boot: set the env var, then restart the backend.
  govFitRequireProof: process.env.ENABLE_GOV_FIT_REQUIRE_PROOF === 'true',
  // SBP source-overflow BLOCK (P7-T1.3, L9.6). DEFAULT ON since 2026-11-21. With it off, an
  // over-long brief or document is clipped and labelled; with it on, `sourceBlocks` refuses
  // rather than silently sending the model half a student's brief and returning a plan for a
  // brief they did not write.
  //
  // THE EARLIER JUSTIFICATION IN THIS COMMENT WAS STALE, AND THE CORRECTION IS THE POINT.
  // It read: "Measured 16 Oct 2026 ... 11 of 48, p90 27,772 against a 20,000 cap. The blocking
  // branch fires." That measurement was real and is no longer about this code. L12.2 raised
  // `MAX_BRIEF_CHARS` from 20,000 to 150,000 so the questions step could read a whole scope
  // document, which moved the cap 7.5x and left the sentence describing a limit that no longer
  // exists. Shipping the flip while that paragraph still claimed the branch fires on live data
  // would have been a contradiction inside one file.
  //
  // Measured again 20 Nov 2026 against `accelerator_prod`, read-only, at the budgets this code
  // actually uses (`decomposePrompt.ts`: brief 150,000, document 200,000, intake 60,000):
  //   - `build_intake.idea`, 56 rows: max 19,996. Over budget: 0. Over the intake cap: 0.
  //   - assembled intake, 56 rows: max 38,820. Over budget: 0.
  //   - `project_understandings.items`, 26 rows: max 80,613 against 200,000. Over budget: 0.
  // `build_plans.plan_json` reaches 497,062 and is deliberately excluded: it is generation
  // OUTPUT, not an input source, and these budgets do not govern it.
  //
  // TWO INDEPENDENT ARGUMENTS, because 56 rows is a modest sample and the structural one does
  // not depend on it. (1) The intake cap is 60,000 and the brief budget is 150,000, so a brief
  // cannot reach the limit by construction, whatever the sample size. (2) The largest real brief
  // has 7.5x of headroom and the largest expansion 2.5x. Turning this on therefore cannot fail a
  // build that succeeds today; what it can do is refuse an input the system has never yet
  // received, which is exactly the case where clipping would be worst.
  //
  // `!== 'false'` rather than `=== 'true'`: on by default, with an escape hatch that does not
  // need a deploy. Read once at boot.
  sbpSourceOverflowBlock: process.env.ENABLE_SBP_SOURCE_OVERFLOW_BLOCK !== 'false',
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
