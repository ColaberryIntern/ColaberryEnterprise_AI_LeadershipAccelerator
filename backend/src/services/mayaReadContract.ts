import type { FactorResult } from './salesReadiness/srsEngine';
import type { Freshness } from './salesReadiness/srsFreshness';

/**
 * M34 - the contract Maya's read tools answer in. Types and constants only.
 *
 * Split out of `mayaReadTools.ts` when that file crossed CLAUDE.md's 500-line hard ceiling.
 * The boundary is a real one rather than a line-count dodge: M31 to M35 consume this shape and
 * need none of the assembly behind it, and both imports here are `import type`, so this file
 * pulls in no database, no assembler and no scorer at runtime. A caller that only branches on a
 * status should not have to load the person assembler to do it.
 *
 * ── ABSENCE IS AN ANSWER, WITH FOUR DISTINCT SHAPES ─────────────────────────
 *
 * M34's first acceptance criterion: "A person with no evidence returns documented emptiness, not
 * an empty-looking shape." An agent handed `{sessions: 0}` for somebody who was never tracked
 * will tell that person they have not been browsing, confidently and wrongly. So every result
 * carries a `status` and, whenever that status is not `present`, a `reason`:
 *
 *   present         we looked, and there is something here
 *   absent          we looked, and there is genuinely nothing. A real measurement.
 *   withheld        Maya is not permitted this panel. A fact about HER, not about the person.
 *   unknown_person  the reference resolved to nobody at all.
 *
 * `withheld` is not a nicety. The assembler already separates the two - its contract says "an
 * absent key means not permitted" and names every withheld panel in `withheldPanels` - and
 * collapsing that into `absent` would let Maya report the limits of her own permissions as facts
 * about somebody's behaviour.
 *
 * `data` is null unless `status === 'present'`. There is deliberately no empty object to mistake
 * for a reading.
 */
/**
 * The topics no read tool is authoritative for. M31 answers these from authoritative state or
 * hands off; it never generates one. Named here because it is a property of this output.
 */
export const NEVER_AUTHORITATIVE_FOR: readonly string[] = Object.freeze([
  'price', 'cohort_date', 'deadline', 'seat_count', 'consent',
]);

export const MAYA_READ_TOOLS = [
  'who_is_this_person',
  'before_they_registered',
  'since_they_registered',
  'how_ready_they_are',
] as const;

export type MayaReadTool = typeof MAYA_READ_TOOLS[number];

export type MayaReadStatus = 'present' | 'absent' | 'withheld' | 'unknown_person';

export interface MayaReadResult<T> {
  tool: MayaReadTool;
  /** Opaque and stable. Never an email address. */
  subject: string;
  status: MayaReadStatus;
  /** Why there is no data. Null only when `status === 'present'`. */
  reason: string | null;
  /** Null unless `status === 'present'`. Never an empty object standing in for absence. */
  data: T | null;
  /** Always true. Nothing here is authoritative; see `NEVER_AUTHORITATIVE_FOR`. */
  advisory: true;
}

export interface MayaPersonIdentity {
  /** First name only, for addressing them. Never the full name. */
  greetingName: string | null;
  /** Lifecycle stage, as the platform computes it. */
  stage: string;
  /** False when no lead record backs this person, so "we have no acquisition history" is sayable. */
  tracedToLead: boolean;
  company: string | null;
  title: string | null;
}

export interface MayaPreRegistration {
  /**
   * Which panels Maya was not permitted. A null below is a fact about the PERSON only when the
   * panel it came from is absent from this list; otherwise it is a fact about her permissions.
   *
   * This field exists because the test for it failed without it. With `engagement` withheld, a
   * `sessions: null` meant "not allowed to look" while the type said "never tracked" - a
   * permission state written into a value slot, which is the exact defect M24.3 removed from
   * the journey counts one layer down. Naming it through the panel list is the mechanism the
   * assembler already uses, and `explorerPanel.ts` records that a SECOND mechanism is forbidden.
   */
  withheld: string[];
  /** Null means never tracked, or `withheld` names engagement. A zero means tracked and idle. */
  sessions: number | null;
  firstSeen: string | null;
  lastSeen: string | null;
  /** Null rather than `[]` when unknown: an empty list is a reading, not an absence. */
  sites: string[] | null;
  source: string | null;
  formType: string | null;
  utmSource: string | null;
  utmCampaign: string | null;
  interestArea: string | null;
  /** Null when no consent decision is recorded, which is NOT consent. */
  consentContact: boolean | null;
}

export interface MayaSinceRegistration {
  /** Same contract as `MayaPreRegistration.withheld`. Carries `journey.enrollments` when the
   * enrolment count was narrowed by permissions, which the assembler already names that way. */
  withheld: string[];
  firstTouch: string | null;
  lastActivity: string | null;
  daysKnown: number | null;
  sessions: number | null;
  pageEvents: number | null;
  campaigns: number | null;
  emailsSent: number | null;
  enrollments: number | null;
  cardsCompleted: number | null;
  sessionsAttended: number | null;
}

export interface MayaReadinessFactor {
  key: string;
  label: string;
  state: FactorResult['state'];
  points: number | null;
  max: number;
  reason: string | null;
}

export interface MayaReadiness {
  /**
   * Panels Maya was not permitted, and therefore the reason her coverage is lower than an
   * admin's on the same person. `inputsFromProfile` maps a withheld panel and an empty one to
   * the same null, so the ENGINE cannot tell them apart and its per-factor reasons do not say
   * which it was. This list is the only place that distinction survives.
   */
  withheld: string[];
  total: number;
  scoreableMax: number;
  rulesetMax: number;
  coverage: number;
  rulesetVersion: string;
  frictionFlag: boolean;
  factors: MayaReadinessFactor[];
  freshness: {
    state: Freshness['state'];
    ageHours: number | null;
    boundBy: Freshness['boundBy'];
    label: string;
    clockSkew: boolean;
  };
}

export interface MayaEverything {
  identity: MayaReadResult<MayaPersonIdentity>;
  before: MayaReadResult<MayaPreRegistration>;
  since: MayaReadResult<MayaSinceRegistration>;
  readiness: MayaReadResult<MayaReadiness>;
}

