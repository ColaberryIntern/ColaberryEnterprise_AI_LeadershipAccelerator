import type { IssueClass } from './issueClassifier';
import type { Claim, ClaimBundle, Evidence } from './claimGate';

/**
 * Diagnose one bounded issue class against live data and produce a reply whose
 * every sentence is backed by something that was actually read.
 *
 * ── WHAT IS ALLOWED TO BE FIXED, AND WHAT IS ONLY ALLOWED TO BE REPORTED ────
 *
 * NOTHING is repaired automatically. Every class is diagnosis-only.
 *
 * This file used to make exactly one exception, minting a fresh sign-in link, on
 * the grounds that it was reversible, idempotent, touched nothing a student made
 * and could be proved afterwards by re-reading the row. Every one of those things
 * was true, and it was still withdrawn: a link minted overnight by a watcher has
 * usually expired by the time the student reads the mail, so the repair produced
 * the very round trip it existed to save. See diagnoseLoginLink.
 *
 * What that leaves is a watcher which performs no writes against a student's
 * account at all. That is a much easier property to keep true than "it writes,
 * but only the safe one".
 *
 * That is not timidity. Connecting a repo needs the student's own OAuth grant.
 * Re-registering a webhook and regenerating a plan both write to the project,
 * and "regenerate the plan" is the operation that would erase the 24
 * hand-ticked completions belonging to Quincy, Shabana, Liza and Farhat. A
 * watcher running unattended at 3am is the worst possible operator for any of
 * those, so it reports what it found and hands the decision to Ali.
 *
 * ── AMBIGUITY IS AN ESCALATION ──────────────────────────────────────────────
 *
 * A student whose address resolves to more than one active enrollment is NOT
 * answered at all. That is precisely the Million Meshesha failure: two active
 * rows, the tiebreaker picking the newer empty one, and three rounds of "just
 * request a new link" that could never work. If the resolution is not singular,
 * the watcher cannot say which seat the student is even asking about, so it
 * hands the message to Ali rather than reporting on the wrong row.
 */

/** Fact groups a diagnosis can require. Anything listed in `unverifiable` was not read. */
export type FactGroup = 'enrollment' | 'github' | 'webhook' | 'plan';

export interface StudentFacts {
  email: string;
  name: string | null;
  /** Rows the magic-link query would consider. Anything but 1 is ambiguous. */
  activeEnrollmentCount: number;
  enrollmentId: string | null;
  portalTokenExpiresAt: string | null;
  projectId: string | null;
  githubRepo: string | null;
  webhookRegistered: boolean;
  webhookLastDeliveryAt: string | null;
  story000Present: boolean;
  acceptanceCriteriaCount: number | null;
  /**
   * Fact groups the read could NOT establish — a query that threw, a table that
   * is not there, a column that has moved. Absent from this list means read;
   * present means unknown. A default value is not a reading, and a diagnosis
   * built on one would report "no repository connected" when the truth is "the
   * query failed", which is a confident wrong answer sent to a paying student.
   */
  unverifiable: FactGroup[];
}

const REQUIRED_FACTS: Record<string, FactGroup[]> = {
  login_link: ['enrollment'],
  repo_connect: ['github'],
  webhook_not_firing: ['github', 'webhook'],
  project_state: ['plan'],
};

export interface WatcherDataAccess {
  loadStudentFacts(email: string): Promise<StudentFacts | null>;
  /** Mints and emails a fresh sign-in link. Verified by re-reading, never by its return. */
  requestFreshLoginLink(email: string): Promise<void>;
  /**
   * Is this address a person we have a relationship with — an enrolled student
   * or a staff member — regardless of whether they were on the campaign roster?
   *
   * THE QUESTION THE ROSTER CANNOT ANSWER.
   *
   * The roster is "who did the send harness mail", which is the right gate for
   * "may we auto-reply". It is the WRONG gate for "should a human hear about
   * this", and conflating the two cost us real mail: in the 2026-08-25 window
   * `not_campaign_recipient` fired 3,667 times, and it is the one skip reason
   * that does not escalate. Sai Tejesh (staff) and Kepha Ohanga (a student who
   * simply was not on that one campaign) were both seen, classified as
   * strangers, and dropped in silence while they waited on an answer.
   *
   * Widening the roster would not have fixed it and narrowing it is what caused
   * it. The set of people we actually know is bounded, already in the database,
   * and cannot be flooded — which is exactly what an escalation gate needs.
   *
   * `null` means WE COULD NOT CHECK (the lookup failed). That is deliberately
   * distinct from `false`, because "the database was unreachable" must not read
   * as "this is a stranger" and silently resurrect the bug this closes.
   */
  isKnownPerson(email: string): Promise<boolean | null>;
}

export type DiagnosisResult =
  | { outcome: 'escalate'; detail: string; evidence: Evidence[] }
  | { outcome: 'reply'; body: string; bundle: ClaimBundle };

const SIGNOFF = '\n\nAli\nColaberry';

function ev(id: string, what: string, result: string, at: Date, postChange = false): Evidence {
  return { id, what, result, at: at.toISOString(), postChange };
}

function greeting(facts: StudentFacts): string {
  const first = (facts.name ?? '').trim().split(/\s+/)[0];
  return first ? `Hi ${first},` : 'Hi,';
}

export async function diagnose(
  issueClass: IssueClass,
  email: string,
  deps: WatcherDataAccess,
  now: Date = new Date(),
): Promise<DiagnosisResult> {
  const readAt = now;
  const facts = await deps.loadStudentFacts(email);
  if (!facts) {
    return {
      outcome: 'escalate',
      detail: `No student record resolves from ${email}. The watcher will not answer an address it cannot identify.`,
      evidence: [ev('lookup', 'enrollments lookup by email', 'no matching record', readAt)],
    };
  }

  const missing = (REQUIRED_FACTS[issueClass] ?? []).filter((g) => facts.unverifiable.includes(g));
  if (missing.length > 0) {
    return {
      outcome: 'escalate',
      detail:
        `Cannot diagnose ${issueClass} for ${facts.email}: ${missing.join(', ')} could not be read. ` +
        'Reporting an unread fact as a finding would be a confident wrong answer, so this needs a human.',
      evidence: [ev('facts-unavailable', 'student fact read', `unverifiable=${facts.unverifiable.join(',')}`, readAt)],
    };
  }

  switch (issueClass) {
    case 'login_link':
      return diagnoseLoginLink(facts, readAt);
    case 'repo_connect':
      return diagnoseRepoConnect(facts, readAt);
    case 'webhook_not_firing':
      return diagnoseWebhook(facts, readAt);
    case 'project_state':
      return diagnoseProjectState(facts, readAt);
  }
}

function diagnoseLoginLink(facts: StudentFacts, readAt: Date): DiagnosisResult {
  const preRead = ev(
    'enrollment-pre',
    'enrollments: active rows resolving from this address',
    `count=${facts.activeEnrollmentCount}, enrollment_id=${facts.enrollmentId ?? 'none'}, ` +
    `portal_token_expires_at=${facts.portalTokenExpiresAt ?? 'null'}`,
    readAt,
  );

  if (facts.activeEnrollmentCount !== 1) {
    return {
      outcome: 'escalate',
      detail:
        `${facts.email} resolves to ${facts.activeEnrollmentCount} active enrollments. A link ` +
        'minted against the wrong one is the exact failure that kept Million Meshesha locked ' +
        'out through three rounds of being told to request a new link. Not guessing.',
      evidence: [preRead],
    };
  }

  /*
   * ── NO TOKEN IS MINTED HERE, DELIBERATELY ─────────────────────────────────
   *
   * This branch used to call `requestFreshLoginLink`, which rotates the
   * student's portal token and mails them a magic link, then re-read the row and
   * told them the link was "live until <expiry>". It was carefully verified and
   * it was still the wrong thing to send.
   *
   * A link minted by a watcher is minted at the watcher's convenience, not the
   * student's. These expire in 24 hours, and the watcher runs unattended
   * overnight — so the student opens the mail the next morning, the link is
   * already dead, and they write back. That round trip is the reported failure,
   * and generating the link faster does not fix it because the clock starts when
   * WE press the button rather than when THEY read it.
   *
   * Pointing at the login page inverts that: the link is created at the moment
   * it is going to be used, by the person who is going to use it. It is also the
   * only version of this reply that makes no promise about a future instant.
   *
   * The happy side effect is that the watcher now performs no writes of any kind
   * against a student's account. Every diagnosis in this file reads and reports.
   * That is a much easier property to keep true than "writes, but only the safe
   * one".
   */
  const checkedClaim: Claim = {
    id: 'single-enrollment',
    kind: 'checked',
    text:
      'I checked your account just now and it resolves to exactly one active enrollment, so ' +
      'there is nothing on our side stopping you from signing in.',
    evidenceIds: ['enrollment-pre'],
  };

  const body = [
    greeting(facts),
    '',
    'Sorry about the sign in trouble, and sorry it took a while to come back to you.',
    '',
    checkedClaim.text,
    '',
    'Sign in links are single use and they expire quickly, so the reliable way to do this is to',
    'ask for one at the moment you want to use it rather than working from an older email. Go to',
    'https://enterprise.colaberry.ai/portal/login, enter this address, and use the link it sends',
    'you straight away.',
    '',
    'I have deliberately not generated a link for you here. One created now would very likely',
    'have expired by the time you read this, and that is what has been causing the back and forth.',
    '',
    'If you request one and it still will not let you in, reply here and I will pick it up.',
    SIGNOFF.trim(),
  ].join('\n');

  return {
    outcome: 'reply',
    body,
    bundle: { claims: [checkedClaim], evidence: [preRead] },
  };
}

function diagnoseRepoConnect(facts: StudentFacts, readAt: Date): DiagnosisResult {
  const evidence = [
    ev(
      'github-connection',
      'github_connections for this student',
      facts.githubRepo ? `connected repo=${facts.githubRepo}` : 'no connected repository',
      readAt,
    ),
  ];

  const checked: Claim = facts.githubRepo
    ? {
        id: 'repo-connected',
        kind: 'checked',
        text: `I checked your account and your repository ${facts.githubRepo} is connected.`,
        evidenceIds: ['github-connection'],
      }
    : {
        id: 'repo-not-connected',
        kind: 'checked',
        text: 'I checked your account just now and no GitHub repository is connected to it yet.',
        evidenceIds: ['github-connection'],
      };

  const body = [
    greeting(facts),
    '',
    'Thanks for flagging this.',
    '',
    checked.text,
    '',
    facts.githubRepo
      ? 'So the connection itself is in place. If the build still is not picking up your work, tell me what you see on screen and I will look at it directly.'
      : [
          'Connecting it is the step that unblocks verification. Sign in at',
          'https://enterprise.colaberry.ai/portal/login, open your project, and use Connect GitHub.',
          'It asks for authorisation on GitHub, then comes back and registers a webhook so your',
          'pushes are picked up automatically. The authorisation has to come from you, which is why',
          'I cannot do this half from my side.',
        ].join('\n'),
    '',
    'I have not changed anything on your account. Reply here if it does not go through and I will look at it with you.',
    SIGNOFF.trim(),
  ].join('\n');

  return { outcome: 'reply', body, bundle: { claims: [checked], evidence } };
}

function diagnoseWebhook(facts: StudentFacts, readAt: Date): DiagnosisResult {
  if (!facts.githubRepo) {
    return {
      outcome: 'escalate',
      detail:
        `${facts.email} reports a webhook problem but no repository is connected, so there is no ` +
        'webhook to diagnose. The underlying issue is different from the one reported.',
      evidence: [ev('github-connection', 'github_connections', 'no connected repository', readAt)],
    };
  }

  const evidence = [
    ev('webhook-row', 'webhook registration for the connected repo',
      facts.webhookRegistered ? 'registered' : 'not registered', readAt),
    ev('webhook-delivery', 'last recorded webhook delivery',
      facts.webhookLastDeliveryAt ?? 'none recorded', readAt),
  ];

  const checked: Claim = {
    id: 'webhook-state',
    kind: 'checked',
    text:
      `I checked your repository ${facts.githubRepo}: the webhook is ` +
      `${facts.webhookRegistered ? 'registered' : 'not registered'}, and the last delivery we have ` +
      `on record is ${facts.webhookLastDeliveryAt ?? 'none at all'}.`,
    evidenceIds: ['webhook-row', 'webhook-delivery'],
  };

  const body = [
    greeting(facts),
    '',
    'Thanks for the detail, that helped me look in the right place.',
    '',
    checked.text,
    '',
    'Push a commit to the default branch and give it a minute. If nothing moves after that,',
    'reply and say so. I have deliberately not re-registered anything from my side, because',
    'that writes to your project and I would rather do it with you than behind you.',
    SIGNOFF.trim(),
  ].join('\n');

  return { outcome: 'reply', body, bundle: { claims: [checked], evidence } };
}

function diagnoseProjectState(facts: StudentFacts, readAt: Date): DiagnosisResult {
  const evidence = [
    ev('story000', 'published plan: STORY-000 row',
      facts.story000Present ? 'present' : 'absent', readAt),
    ev('acceptance', 'acceptance criteria count on STORY-000',
      facts.acceptanceCriteriaCount === null ? 'unavailable' : String(facts.acceptanceCriteriaCount),
      readAt),
  ];

  // Restoring a missing STORY-000 means regenerating a plan, which is a write
  // over student work. That decision is Ali's, always.
  if (!facts.story000Present) {
    return {
      outcome: 'escalate',
      detail:
        `${facts.email} has no STORY-000. Restoring it means regenerating their plan, which ` +
        'overwrites student work and is the operation that would erase hand-ticked completions. ' +
        'Diagnosed, not touched.',
      evidence,
    };
  }

  const checked: Claim = {
    id: 'plan-state',
    kind: 'checked',
    text:
      `I looked at your plan: STORY-000 is there, with ${facts.acceptanceCriteriaCount ?? 'an unrecorded number of'} ` +
      'acceptance criteria on it.',
    evidenceIds: ['story000', 'acceptance'],
  };

  const body = [
    greeting(facts),
    '',
    'Good question, and worth checking rather than guessing.',
    '',
    checked.text,
    '',
    'Anything already ticked stays ticked. I have not regenerated or pruned anything, and',
    'nothing automated will. If what you see on screen does not match that, tell me what it',
    'shows and I will go through it with you.',
    SIGNOFF.trim(),
  ].join('\n');

  return { outcome: 'reply', body, bundle: { claims: [checked], evidence } };
}
