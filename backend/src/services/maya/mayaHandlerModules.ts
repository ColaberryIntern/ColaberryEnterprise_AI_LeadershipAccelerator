/**
 * MAYA_HANDLER_MODULES - the one list of files that are "inside" Maya's tool execution.
 *
 * -- WHY THIS IS ONE EXPORTED CONSTANT AND NOT TWO INLINE LISTS --
 *
 * Two different structural tests need exactly this set:
 *
 *   1. `mayaSeamContainment.test.ts` asserts no handler imports a person-reaching provider
 *      directly, so `maya/deliverOrQueue.ts` is the only module that may name `createBooking`,
 *      `sendSmsViaGhl`, `routeLeadToCampaign`, `sendStrategyCallConfirmation` or
 *      `sendAdmissionsDocument`.
 *   2. The same scan proves campaign enrolment cannot be reached from a handler.
 *
 * An earlier revision of the plan had those two assertions naming DIFFERENT module sets, and
 * the explicit one was wrong: it said `services/mayaTools/`, which holds only the sms, voice,
 * context and consent helpers, while all four gated imports actually sat in
 * `services/mayaToolsService.ts` - a loose file in neither named directory. The mutation check
 * would have passed with the hole restored. One constant, used by both, is why that cannot
 * happen again.
 *
 * -- THE COMPLETENESS PREDICATE, AND THE OBVIOUS VERSION THAT IS BACKWARDS --
 *
 * The set is checked against the transitive closure of modules **imported by**
 * `executeMayaActionInner` and `executeMayaPortalToolInner`. That direction matters.
 *
 * The tempting predicate - "every module that imports a tool belt" - runs the graph UPWARD. The
 * belts' only value importers are `chatService.ts` and `maya/mayaReplyService.ts`, both callers
 * ABOVE the dispatcher, while the handlers BELOW it reach `mayaActionService` only through
 * `import type { MayaActionResult }`, a type-only edge erased at compile time. So that version
 * would have dragged the set up into chat routing while never requiring a new handler file to
 * join it, which is exactly the staleness it exists to prevent.
 */

/**
 * Globs, relative to `backend/src`. A directory entry ends in `/**` and covers everything under
 * it, so a new handler file in one of those folders is covered the moment it is created; a new
 * handler file ANYWHERE ELSE has to be added here, and the completeness test fails until it is.
 */
export const MAYA_HANDLER_MODULES: ReadonlyArray<string> = Object.freeze([
  'services/mayaActionService.ts',
  // The file the earlier revision missed. All four gated provider imports lived here.
  'services/mayaToolsService.ts',
  'services/mayaCampaignRouter.ts',
  // Added after the completeness check failed on them. All three are Maya-owned modules a
  // dispatcher can reach, and none of them was in the plan's list - which is the point of
  // deriving the set from the real import graph rather than from memory.
  'services/mayaConversationSummaryService.ts',
  'services/mayaConversationIntelligenceService.ts',
  'services/mayaEnablement.ts',
  'services/mayaTools/**',
  'services/maya/**',
  // OH1i/OH1h: Maya's content shelves (approved facts and build prompts). Reachable from the
  // reply drafter through the brain; reads only, names no gated provider.
  'services/mayaBrain/**',
]);

/** The provider symbols that may appear in exactly one module, the delivery seam. */
export const GATED_PROVIDER_SYMBOLS: ReadonlyArray<string> = Object.freeze([
  'createBooking',
  'sendSmsViaGhl',
  'routeLeadToCampaign',
  'enrollLeadsInCampaign',
  'sendStrategyCallConfirmation',
  'sendAdmissionsDocument',
]);

/** The one module allowed to name them. Everything else goes through it. */
export const DELIVERY_SEAM_MODULE = 'services/maya/deliverOrQueue.ts';
