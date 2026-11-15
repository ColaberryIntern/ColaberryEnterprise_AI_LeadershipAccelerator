import type { MayaCapability } from '../mayaEnablement';

/**
 * T1 - the frozen map from a Maya TOOL to the CAPABILITY that governs it.
 *
 * -- WHY THIS FILE EXISTS --
 *
 * Maya has two tool belts and, until this file, no single place that said which governed
 * capability each tool acts under:
 *
 *   - the site chat belt, `MAYA_TOOLS` in `services/mayaActionService.ts` (12 tools), which had
 *     no capability layer at all and was gated only by `ENABLE_CHAT`;
 *   - the portal belt, `MAYA_PORTAL_TOOLS` in `services/maya/mayaPortalTools.ts` (5 tools),
 *     which is governed by `mayaPromotion.resolveMayaMode` but whose tools were never mapped
 *     to the capabilities one by one.
 *
 * "Combine the Mayas" means one governed surface, so both belts are in one table here. A tool
 * that is not in this table has no capability, and a capability-less tool is a hole in the
 * governance spine, not a convenience. The companion test fails on either direction of drift:
 * a new tool with no entry, and a stale entry for a tool that no longer exists.
 *
 * -- NO I/O, AND NO VALUE IMPORTS --
 *
 * This module is pure data. It imports one TYPE and nothing else, so it can be read by a
 * structural test, by a script, or by the queue without dragging in Sequelize, the settings
 * service or the kill switch. That is deliberate: a governance map that cannot be loaded
 * without a database connection is a map nobody checks.
 *
 * -- THE TWO AXES, AND WHY THE M29 LIST IS RESTATED RATHER THAN IMPORTED --
 *
 * `MayaCapability` (M29, `services/mayaEnablement.ts`) is the set of capabilities gated by the
 * growth-journey and Explorer FLAGS. The site-chat capabilities below are not flag-gated: they
 * are reactive, a visitor asked for them, and they are governed by the promotion record and by
 * the delivery seam instead. Forcing them into `MAYA_CAPABILITY_GATES` would mean inventing a
 * growth-journey flag mapping for each one, which would read as a decision somebody made rather
 * than the fiction it would be.
 *
 * So `M29_CAPABILITIES` below restates the five flag-gated names as a literal tuple, and is
 * pinned two ways: the `satisfies` check makes a name that is not a `MayaCapability` a compile
 * error, the `Exhaustive` check makes a MISSING name a compile error, and the companion test
 * asserts the tuple deep-equals the runtime `MAYA_CAPABILITIES` export. A restatement that
 * cannot silently drift is safe; an unpinned one would not be.
 */

/** Which belt a tool is declared on. `retrieve_knowledge` is on both. */
export type MayaToolBelt = 'site' | 'portal';

/**
 * What a tool actually DOES to the outside world. The delivery seam reads the capability, not
 * this field; this field is what makes the table reviewable and what the default-state test
 * asserts against.
 *
 *  - `read`              reads our own data or returns a link, reaches nobody
 *  - `write_internal`    writes our own records, reaches nobody
 *  - `in_product`        changes what the person already in session sees, leaves no platform
 *  - `compose_only`      produces text for a human to use, sends nothing
 *  - `transactional_receipt`  sends a receipt of an action the person themselves just took,
 *                        from a fixed reviewed template. The ONE declared exception to the
 *                        per-message approval invariant; see the policy in
 *                        `docs/maya/MAYA_GOVERNANCE.md`.
 *  - `outbound`          reaches a real person outside the product. Never defaults to live.
 */
export type MayaEffectClass =
  | 'read'
  | 'write_internal'
  | 'in_product'
  | 'compose_only'
  | 'transactional_receipt'
  | 'outbound';

/** The five flag-gated M29 capabilities, restated as a tuple. Pinned below and by the test. */
export const M29_CAPABILITIES = Object.freeze([
  'respondToExplorerDm',
  'sendInAppWelcome',
  'createJourneyHandoff',
  'readPerson360',
  'sendEmail',
] as const) satisfies readonly MayaCapability[];

/**
 * A missing name is a compile error, not just a test failure. If `MayaCapability` gains a
 * member and it is not added to the tuple above, `Exhaustive` resolves to `never` and the
 * assignment below fails to typecheck.
 */
type M29Listed = (typeof M29_CAPABILITIES)[number];
type Exhaustive = [MayaCapability] extends [M29Listed] ? true : never;
const _m29TupleIsExhaustive: Exhaustive = true;
void _m29TupleIsExhaustive;

/**
 * The capabilities the SITE chat belt acts under. New in this run: the site chat had none.
 * Every one is reactive - a visitor asked - which is why none of them is flag-gated.
 */
export const MAYA_SITE_CAPABILITIES = Object.freeze([
  /** Writing or updating the visitor's own lead record. Reaches nobody. */
  'captureVisitorRecord',
  /** Reading slots, knowledge, quotable assets. Reaches nobody. */
  'readSiteChatCatalog',
  /** Drafting marketing copy for a human to use. Sends nothing. */
  'composeMarketingDraft',
  /** Logging that a person should call this visitor back. Reaches nobody directly. */
  'requestHumanCallback',
  /** Starting the in-product campus tour. */
  'runCampusTour',
  /** Returning the booking LINK. Books nothing, reaches nobody. */
  'offerBookingLink',
  /** The calendar write plus its confirmation. The declared transactional-receipt exception. */
  'bookStrategyCall',
  /** Emailing an admissions document to a real inbox. */
  'sendDocument',
  /** Any SMS, including the one booking fires as a side effect. Refused by name. */
  'sendSmsSummary',
  /** Any outbound voice call. Refused by name. */
  'placeVoiceCall',
  /** Handing a lead to the campaign cron chain. Refused by name; see MAYA_GOVERNANCE.md. */
  'enrollInCampaign',
] as const);

export type MayaSiteCapability = (typeof MAYA_SITE_CAPABILITIES)[number];

/** Every capability Maya has, across both axes. This is the set the console shows. */
export type MayaToolCapability = MayaCapability | MayaSiteCapability;

export const ALL_MAYA_CAPABILITIES: readonly MayaToolCapability[] = Object.freeze([
  ...M29_CAPABILITIES,
  ...MAYA_SITE_CAPABILITIES,
] as const);

/** True when this capability is one of the five M29 flag-gated ones. */
export function isM29Capability(cap: MayaToolCapability): cap is MayaCapability {
  return (M29_CAPABILITIES as readonly string[]).includes(cap);
}

export interface MayaToolGovernanceEntry {
  /** The belts this exact tool name is declared on. */
  readonly belts: readonly MayaToolBelt[];
  /** The capability whose resolved mode governs this tool. */
  readonly capability: MayaToolCapability;
  /** What it does to the outside world. */
  readonly effectClass: MayaEffectClass;
}

/**
 * The map. Keyed by the tool name exactly as the belt declares it.
 *
 * `retrieve_knowledge` is declared on both belts with the same capability, which is the point of
 * combining them: the same question gets the same governance whether it is asked on the public
 * site or inside the portal.
 */
export const MAYA_TOOL_GOVERNANCE: Readonly<Record<string, MayaToolGovernanceEntry>> = Object.freeze({
  // --- site belt: reads and internal writes -------------------------------------------------
  capture_lead_details: { belts: ['site'], capability: 'captureVisitorRecord', effectClass: 'write_internal' },
  update_lead_record: { belts: ['site'], capability: 'captureVisitorRecord', effectClass: 'write_internal' },
  get_available_slots: { belts: ['site'], capability: 'readSiteChatCatalog', effectClass: 'read' },
  retrieve_knowledge: { belts: ['site', 'portal'], capability: 'readSiteChatCatalog', effectClass: 'read' },
  list_quotable_marketing_assets: { belts: ['site'], capability: 'readSiteChatCatalog', effectClass: 'read' },
  draft_marketing_email: { belts: ['site'], capability: 'composeMarketingDraft', effectClass: 'compose_only' },
  schedule_callback: { belts: ['site'], capability: 'requestHumanCallback', effectClass: 'write_internal' },

  // --- portal belt: in-product surfaces ------------------------------------------------------
  request_callback: { belts: ['portal'], capability: 'requestHumanCallback', effectClass: 'write_internal' },
  start_campus_tour: { belts: ['portal'], capability: 'runCampusTour', effectClass: 'in_product' },
  create_journey_handoff: { belts: ['portal'], capability: 'createJourneyHandoff', effectClass: 'in_product' },
  // Returns a markdown link and a note saying nothing is booked until they pick a time
  // (mayaPortalTools.ts). It is deliberately NOT coupled to the real calendar write below.
  book_admissions_call: { belts: ['portal'], capability: 'offerBookingLink', effectClass: 'read' },

  // --- the booking tool, whose SIDE EFFECTS are governed separately --------------------------
  // The tool stays live. Its calendar invite and confirmation are the transactional receipt;
  // its GHL SMS resolves `sendSmsSummary` and its campaign enrolment resolves `enrollInCampaign`
  // through the delivery seam, and both of those are off. See MAYA_GOVERNANCE.md.
  schedule_strategy_call: { belts: ['site'], capability: 'bookStrategyCall', effectClass: 'transactional_receipt' },

  // --- the outbound tools --------------------------------------------------------------------
  send_document: { belts: ['site'], capability: 'sendDocument', effectClass: 'outbound' },
  send_sms_summary: { belts: ['site'], capability: 'sendSmsSummary', effectClass: 'outbound' },
  initiate_voice_call: { belts: ['site'], capability: 'placeVoiceCall', effectClass: 'outbound' },
  enroll_in_campaign: { belts: ['site'], capability: 'enrollInCampaign', effectClass: 'outbound' },
});

/**
 * The whole governance entry for a tool name, or undefined if the tool is ungoverned.
 *
 * ONE accessor rather than one per field, deliberately. The first draft exported
 * `capabilityForTool`, `effectClassForTool` and `governedToolNames` alongside the table, which
 * put this module at 13 public symbols against CLAUDE.md's ceiling of 12 - and each of the
 * three was a one-line read of an already-exported constant. `Object.keys(MAYA_TOOL_GOVERNANCE)`
 * is the name list; this is the lookup.
 */
export function governanceForTool(toolName: string): MayaToolGovernanceEntry | undefined {
  return MAYA_TOOL_GOVERNANCE[toolName];
}
