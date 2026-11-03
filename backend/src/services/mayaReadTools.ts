import { createHash } from 'crypto';
import { resolveRefToEmail } from './adminOs/personRef';
import { getPersonProfile, type PersonProfile } from './adminOs/personProfileService';
import { inputsFromProfile } from './salesReadiness/srsInputs';
import { scoreReadiness } from './salesReadiness/srsEngine';
import { assessFreshness } from './salesReadiness/srsFreshness';

/**
 * M34 - Person 360 as Maya's eyes. Four scoped, read-only tools.
 *
 * ── NOTHING HERE QUERIES ANYTHING ───────────────────────────────────────────
 *
 * Every answer is composed from `getPersonProfile`, which is the CANONICAL person assembler, plus
 * the M25 scorer and the M27 freshness assessor reading that same profile. This module issues no
 * SQL of its own, and that is enforced rather than asserted: it declares
 * `PERSON_VIEW_ROLE = 'delegates'` and `personViewRoles.ts` fails the build if a module claiming
 * to delegate does not reference its target in code with comments stripped. M34 says to reuse
 * "all of it... Nothing is re-queried", and the existing T211 tripwire is what makes that
 * checkable instead of a promise in a docblock.
 *
 * ── ABSENCE IS AN ANSWER, WITH FOUR DISTINCT SHAPES ─────────────────────────
 *
 * M34's first acceptance criterion: "A person with no evidence returns documented emptiness, not
 * an empty-looking shape." An agent that receives `{sessions: 0}` for somebody who was never
 * tracked will tell that person they have not been browsing, confidently and wrongly. So every
 * tool returns a `status` and, whenever that status is not `present`, a `reason`:
 *
 *   present         we looked, and there is something here
 *   absent          we looked, and there is genuinely nothing. A real measurement.
 *   withheld        Maya is not permitted this panel. A fact about HER, not about the person.
 *   unknown_person  the reference resolved to nobody at all.
 *
 * `withheld` is not a nicety. The profile already separates the two - its own contract says "an
 * absent key means not permitted" and names every withheld panel in `withheldPanels` - and
 * collapsing that into `absent` would let Maya report the limits of her own permissions as facts
 * about somebody's behaviour. This module is the first consumer to read that distinction.
 *
 * `data` is null unless `status === 'present'`. There is deliberately no empty object to mistake
 * for a reading.
 *
 * ── WHAT SHE IS ALLOWED TO SEE, AND WHY THAT LIST IS NOT MY CHOICE ──────────
 *
 * `MAYA_SECTIONS` is `['lead_ingestion', 'campaigns']`.
 *
 * `lead_ingestion` is the ADMISSIONS section, and `personScope.ts` records why its range is what
 * it is: "A DELIBERATE WIDENING, decided 2026-09-05... Ali asked for Admissions to see leads AND
 * students... and stops short of returning_customer, which is a billing relationship rather than
 * an admissions one." Maya holds the Admissions role, so her range is that existing decision
 * applied to her rather than a new one.
 *
 * `campaigns` is here for ONE reason: `PANEL_SECTIONS.engagement` is `['campaigns']` and nothing
 * else, and `engagement` is the visitor-session evidence `beforeTheyRegistered` exists to report.
 * Without it that tool would answer `withheld` for every person alive, and a tool that is never
 * available reads, over time, exactly like a tool that never finds anything.
 *
 * The cost, stated rather than buried: `campaigns` also grants `communications`, every message
 * threaded by campaign. These tools expose none of it and a test says so, but she is nonetheless
 * PERMITTED it, and permitted is the word that matters when reviewing what she may see. Narrowing
 * the list cannot avoid it. Her scope does NOT grant `learning`, `billing`, `billingDetail`,
 * `account`, `programme` or `history`: not what anybody paid, owes, which cohort they sit in, or
 * their pre-platform relationship with Colaberry.
 *
 * ── THE CONSEQUENCE FOR THE SCORE, WHICH IS THE REVIEWABLE PART ─────────────
 *
 * M34's success metric is "Maya answers from the same evidence a rep sees, so the two never
 * contradict each other." That holds only while her sections match that rep's. They do not match
 * an ADMIN's: `inputsFromProfile` maps a withheld panel and an empty one to the same `null`, each
 * factor then reports `absent`, and her `coverage` is therefore lower than an admin's on the same
 * person. Two factors are structurally unreachable for her - payment failures (`billingDetail`)
 * and prior enrolments (`history`). Inbound replies are NOT among them, because `campaigns`
 * carries `communications`, which is the kind of thing worth checking rather than assuming.
 *
 * That is a real limit, not a bug to paper over, and it is the single thing worth Ali's
 * attention here: widening her scope to make the numbers agree would hand an AI employee the
 * billing and programme panels, which is a bigger decision than this ticket.
 *
 * ── NO CONTACT DETAIL LEAVES THIS MODULE ────────────────────────────────────
 *
 * M34: "No tool returns PII in a payload or a log, and ids are never email addresses." The
 * profile is keyed on email and the acquisition panel carries a phone number, a LinkedIn URL and
 * free-text notes. So the payloads here are built field by field from an allowlist, never by
 * spreading a panel. Specifically excluded, each for its own reason:
 *
 *   email, phone, linkedinUrl   contact details. The point of the rule.
 *   name (in full)              `greetingName` carries the first name only - see below.
 *   notes, message              free text written by a human about a person. Unbounded, so
 *                               unauditable: a note can contain anything, including an address.
 *   pageUrl                     a landing URL whose query string routinely carries an email in
 *                               a tracking parameter. It would smuggle the exact identifier the
 *                               rule exists to keep out, through a field that looks like metadata.
 *   assignedAdmin               a colleague's identity, and not hers to relay.
 *
 * `greetingName` is the one judgement call: a first name IS personal data, and it is here because
 * an admissions employee who cannot address somebody by name is not doing the job. It is the
 * first token of the name and nothing else, it is the only such field, and `logLineFor()` omits
 * it so it reaches no log. If Ali wants it gone, one line and one test remove it.
 *
 * The subject identifier is `maya-subject:<16 hex>`, a truncated SHA-256 of the resolved email:
 * stable, so two calls about one person correlate in logs, and the same token whether the caller
 * passed an email, `lead:24945` or `enrollment:<uuid>`, which an echoed input ref would not be.
 *
 * IT IS DELIBERATELY NOT `person:`, and that is not cosmetic. T208 (identifierPrecedence.test.ts)
 * holds the line that this system has exactly four identity prefixes - enrollment, lead, org_member
 * and visitor - and greps for a `person:` constructor as its live decoy, because a `persons` spine
 * exists in a migration with no application readers. The first version of this file minted
 * `person:<hash>` and failed that tripwire, correctly: an opaque log handle spelled like an identity
 * namespace is indistinguishable from a fifth one, and the scanner cannot read intent. Namespacing
 * the token to this module says what it is. Do not tidy it back to `person:`.
 *
 * Every result also carries `advisory: true`, and `NEVER_AUTHORITATIVE_FOR` names the five topics
 * M31 must hand off rather than answer. A comment saying "advisory" can be read past; a field
 * cannot, and a caller that strips it fails a test.
 */

export const PERSON_VIEW_ROLE = 'delegates' as const;

export const MAYA_SECTIONS: readonly string[] = Object.freeze(['lead_ingestion', 'campaigns']);

/**
 * The result shape, the tool names and the absence contract live in `mayaReadContract.ts`,
 * which imports nothing at runtime. They are re-exported here so a caller needs one import,
 * and so the split is not a breaking change for anything written against this module.
 */
export type {
  MayaReadTool, MayaReadStatus, MayaReadResult, MayaPersonIdentity, MayaPreRegistration,
  MayaSinceRegistration, MayaReadinessFactor, MayaReadiness, MayaEverything,
} from './mayaReadContract';
export { MAYA_READ_TOOLS, NEVER_AUTHORITATIVE_FOR } from './mayaReadContract';

// Imported again for use INSIDE this file. All type-only: the two constants are
// re-exported above and are not read here.
import {
  type MayaReadTool, type MayaReadStatus, type MayaReadResult, type MayaPersonIdentity,
  type MayaPreRegistration, type MayaSinceRegistration, type MayaReadiness,
  type MayaEverything,
} from './mayaReadContract';

export interface MayaReadToolDeps {
  profileFor: (email: string) => Promise<PersonProfile | null>;
  emailForRef: (ref: string) => Promise<string | null>;
  now: () => string;
  log: (line: Record<string, unknown>) => void;
}

/** The subject token. Truncated to 16 hex: collision-irrelevant for a log key, and short enough to read. */
export function subjectRef(email: string): string {
  return `maya-subject:${createHash('sha256').update(email.trim().toLowerCase()).digest('hex').slice(0, 16)}`;
}

/**
 * The log line for one call. Carries the outcome and nothing about the person.
 *
 * Exported so a test can assert the absence directly rather than through a spy on console.
 */
export function logLineFor(
  tool: MayaReadTool, subject: string, status: MayaReadStatus, now: string,
): Record<string, unknown> {
  return {
    timestamp: now,
    level: 'info',
    service: 'maya-read-tools',
    event: 'maya_read_tool',
    tool,
    subject,
    outcome: status === 'present' ? 'success' : 'partial',
    status,
  };
}

function defaultDeps(): MayaReadToolDeps {
  return {
    profileFor: (email) => getPersonProfile({
      email, sections: MAYA_SECTIONS, visibleEnrollmentIds: null,
    }),
    emailForRef: (ref) => resolveRefToEmail(ref),
    now: () => new Date().toISOString(),
    log: (line) => { console.log(JSON.stringify(line)); },
  };
}

const UNRESOLVED = 'That reference does not resolve to a person on this platform, so there is '
  + 'nothing to read. It is not a person with no history.';

/** First token of a name. Null for an absent or whitespace-only name. */
function firstNameOf(name: string | null): string | null {
  const first = (name ?? '').trim().split(/\s+/)[0];
  return first ? first : null;
}

type Resolved = { subject: string; profile: PersonProfile };

async function resolve(ref: string, deps: MayaReadToolDeps): Promise<Resolved | null> {
  const email = await deps.emailForRef(ref);
  if (!email) return null;
  const profile = await deps.profileFor(email);
  if (!profile) return null;
  return { subject: subjectRef(email), profile };
}

function emit<T>(
  tool: MayaReadTool, subject: string, status: MayaReadStatus,
  reason: string | null, data: T | null, deps: MayaReadToolDeps,
): MayaReadResult<T> {
  deps.log(logLineFor(tool, subject, status, deps.now()));
  return { tool, subject, status, reason, data, advisory: true };
}

/**
 * The unresolved subject token.
 *
 * Constant rather than derived from the ref: a token derived from an unresolvable input would
 * leak the input into the log, which is the one place this module is trying to keep clean.
 */
const NO_SUBJECT = 'maya-subject:unresolved';

function unknown<T>(tool: MayaReadTool, deps: MayaReadToolDeps): MayaReadResult<T> {
  return emit<T>(tool, NO_SUBJECT, 'unknown_person', UNRESOLVED, null, deps);
}

/**
 * Each tool is a thin wrapper over a `build*` that takes an ALREADY RESOLVED person.
 *
 * The split exists so `readEverythingAbout` assembles the profile once rather than four times.
 * It was four: every tool resolved independently, which is right for a caller that wants one
 * answer and wasteful for a caller that wants all of them.
 */

/** Who this is. Present whenever the person resolved at all - identity is what resolution IS. */
function buildIdentity(r: Resolved, deps: MayaReadToolDeps): MayaReadResult<MayaPersonIdentity> {
  return emit<MayaPersonIdentity>('who_is_this_person', r.subject, 'present', null, {
    greetingName: firstNameOf(r.profile.name),
    stage: r.profile.stage,
    tracedToLead: r.profile.tracedToLead,
    company: r.profile.company,
    title: r.profile.title,
  }, deps);
}

export async function whoIsThisPerson(
  ref: string, deps: MayaReadToolDeps = defaultDeps(),
): Promise<MayaReadResult<MayaPersonIdentity>> {
  const r = await resolve(ref, deps);
  return r ? buildIdentity(r, deps) : unknown<MayaPersonIdentity>('who_is_this_person', deps);
}

/**
 * What they did on the website before registering.
 *
 * Two panels, so three ways to have nothing: `engagement` withheld, `acquisition` withheld, or
 * both readable and both empty. The first two are facts about Maya's permissions and say so.
 */
function buildBefore(r: Resolved, deps: MayaReadToolDeps): MayaReadResult<MayaPreRegistration> {
  const tool: MayaReadTool = 'before_they_registered';
  const { profile } = r;
  const engagementWithheld = profile.withheldPanels.includes('engagement');
  const acquisitionWithheld = profile.withheldPanels.includes('acquisition');
  const withheld = [
    ...(engagementWithheld ? ['engagement'] : []),
    ...(acquisitionWithheld ? ['acquisition'] : []),
  ];

  if (engagementWithheld && acquisitionWithheld) {
    return emit<MayaPreRegistration>(tool, r.subject, 'withheld',
      'Neither the browsing record nor the acquisition record is readable with Maya\'s '
      + 'permissions, so this says nothing about what this person did.', null, deps);
  }

  const eng = engagementWithheld ? null : profile.engagement ?? null;
  const acq = acquisitionWithheld ? null : profile.acquisition ?? null;

  if (!eng && !acq) {
    // Every readable panel was empty. The reason names the withheld one when there is one, so
    // "nothing here" is never reported as broader than what was actually looked at.
    const looked = withheld.length
      ? `The ${withheld.join(' and ')} record is not readable with Maya's permissions, and of `
        + 'what remained, nothing exists.'
      : 'Both records were readable and neither exists.';
    return emit<MayaPreRegistration>(tool, r.subject, 'absent',
      `${looked} This person has no browsing or lead evidence Maya can see, which is an `
      + 'absence of evidence rather than a quiet visit.',
      null, deps);
  }

  return emit<MayaPreRegistration>(tool, r.subject, 'present', null, {
    withheld,
    sessions: eng ? eng.sessions : null,
    firstSeen: eng?.firstSeen ?? null,
    lastSeen: eng?.lastSeen ?? null,
    sites: eng ? eng.sites : null,
    source: acq?.source ?? null,
    formType: acq?.formType ?? null,
    utmSource: acq?.utmSource ?? null,
    utmCampaign: acq?.utmCampaign ?? null,
    interestArea: acq?.interestArea ?? null,
    consentContact: acq?.consentContact ?? null,
  }, deps);
}

export async function beforeTheyRegistered(
  ref: string, deps: MayaReadToolDeps = defaultDeps(),
): Promise<MayaReadResult<MayaPreRegistration>> {
  const r = await resolve(ref, deps);
  return r ? buildBefore(r, deps) : unknown<MayaPreRegistration>('before_they_registered', deps);
}

/**
 * What they have done since.
 *
 * The journey summary is built for every caller, so this is `present` whenever the person
 * resolved. Its per-field nulls are the point and are passed through untouched: M24.2 and M24.3
 * made six of these honestly nullable, and coercing one to 0 here would undo that work one layer
 * further out, where nobody would think to look for it.
 */
function buildSince(r: Resolved, deps: MayaReadToolDeps): MayaReadResult<MayaSinceRegistration> {
  const tool: MayaReadTool = 'since_they_registered';
  const j = r.profile.journey;
  if (!j) {
    return emit<MayaSinceRegistration>(tool, r.subject, 'absent',
      'No journey summary was assembled for this person.', null, deps);
  }

  return emit<MayaSinceRegistration>(tool, r.subject, 'present', null, {
    withheld: r.profile.withheldPanels.filter((p) => p.startsWith('journey.')),
    firstTouch: j.firstTouch,
    lastActivity: j.lastActivity,
    daysKnown: j.daysKnown,
    sessions: j.sessions,
    pageEvents: j.pageEvents,
    campaigns: j.campaigns,
    emailsSent: j.emailsSent,
    enrollments: j.enrollments,
    cardsCompleted: j.cardsCompleted,
    sessionsAttended: j.sessionsAttended,
  }, deps);
}

export async function sinceTheyRegistered(
  ref: string, deps: MayaReadToolDeps = defaultDeps(),
): Promise<MayaReadResult<MayaSinceRegistration>> {
  const r = await resolve(ref, deps);
  return r ? buildSince(r, deps) : unknown<MayaSinceRegistration>('since_they_registered', deps);
}

/**
 * How ready they are: the M25 score and its M27 freshness.
 *
 * ── A TOTAL OF ZERO AT ZERO COVERAGE IS NOT A SCORE ─────────────────────────
 *
 * The engine always returns a number, because each factor reports `absent` individually. For
 * somebody with no evidence at all that number is 0 out of a scoreableMax of 0 - and `0` handed
 * to an agent is the exact "empty-looking shape" M34 forbids. It would read as "measured, and
 * not ready" when the truth is "nothing was measurable". So zero coverage returns `absent` with
 * the reason, and the number is withheld rather than published as a judgement about a person
 * nobody has any evidence about.
 */
function buildReadiness(r: Resolved, deps: MayaReadToolDeps): MayaReadResult<MayaReadiness> {
  const tool: MayaReadTool = 'how_ready_they_are';
  const computedAt = deps.now();
  const score = scoreReadiness(inputsFromProfile(r.profile), computedAt);

  if (score.coverage === 0) {
    return emit<MayaReadiness>(tool, r.subject, 'absent',
      'No factor had any evidence, so there is no score. A total of zero here would mean '
      + '"measured and not ready"; the truth is that nothing about this person was measurable.',
      null, deps);
  }

  const freshness = assessFreshness(
    { computedAt, oldestEvidenceAt: score.oldestEvidenceAt }, computedAt,
  );

  return emit<MayaReadiness>(tool, r.subject, 'present', null, {
    withheld: [...r.profile.withheldPanels],
    total: score.total,
    scoreableMax: score.scoreableMax,
    rulesetMax: score.rulesetMax,
    coverage: score.coverage,
    rulesetVersion: score.rulesetVersion,
    frictionFlag: score.frictionFlag,
    factors: score.factors.map((f) => ({
      key: f.key, label: f.label, state: f.state, points: f.points, max: f.max, reason: f.reason,
    })),
    freshness: {
      state: freshness.state,
      ageHours: freshness.ageHours,
      boundBy: freshness.boundBy,
      label: freshness.label,
      clockSkew: freshness.clockSkew,
    },
  }, deps);
}

export async function howReadyTheyAre(
  ref: string, deps: MayaReadToolDeps = defaultDeps(),
): Promise<MayaReadResult<MayaReadiness>> {
  const r = await resolve(ref, deps);
  return r ? buildReadiness(r, deps) : unknown<MayaReadiness>('how_ready_they_are', deps);
}


/**
 * Every tool, for one person, from ONE assembly of the profile.
 *
 * The first version called the four public tools in turn, which resolved the same person four
 * times and assembled four identical profiles - dozens of queries to answer one question. A test
 * asserts the resolver is called exactly once, so that cannot quietly come back.
 */
export async function readEverythingAbout(
  ref: string, deps: MayaReadToolDeps = defaultDeps(),
): Promise<MayaEverything> {
  const r = await resolve(ref, deps);
  if (!r) {
    return {
      identity: unknown<MayaPersonIdentity>('who_is_this_person', deps),
      before: unknown<MayaPreRegistration>('before_they_registered', deps),
      since: unknown<MayaSinceRegistration>('since_they_registered', deps),
      readiness: unknown<MayaReadiness>('how_ready_they_are', deps),
    };
  }
  return {
    identity: buildIdentity(r, deps),
    before: buildBefore(r, deps),
    since: buildSince(r, deps),
    readiness: buildReadiness(r, deps),
  };
}
