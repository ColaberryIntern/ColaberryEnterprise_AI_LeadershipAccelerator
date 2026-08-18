import type { IssueClass } from './issueClassifier';
import type { Claim, ClaimBundle, Evidence } from './claimGate';

/**
 * Diagnose one bounded issue class against live data, optionally apply the one
 * fix that is safe to apply, and produce a reply whose every sentence is backed
 * by something that was actually read.
 *
 * ── WHAT IS ALLOWED TO BE FIXED, AND WHAT IS ONLY ALLOWED TO BE REPORTED ────
 *
 * Exactly one repair is applied automatically: minting a fresh sign-in link.
 * It is reversible, it is idempotent, it touches nothing a student made, and it
 * can be proved afterwards by re-reading the row. Every other class is
 * diagnosis-only, and says so.
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
 * given a link. That is precisely the Million Meshesha failure: two active
 * rows, the tiebreaker picking the newer empty one, and three rounds of "just
 * request a new link" that could never work. If the resolution is not singular,
 * the watcher does not guess which seat to mint against.
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
      return diagnoseLoginLink(facts, deps, readAt);
    case 'repo_connect':
      return diagnoseRepoConnect(facts, readAt);
    case 'webhook_not_firing':
      return diagnoseWebhook(facts, readAt);
    case 'project_state':
      return diagnoseProjectState(facts, readAt);
  }
}

async function diagnoseLoginLink(
  facts: StudentFacts,
  deps: WatcherDataAccess,
  readAt: Date,
): Promise<DiagnosisResult> {
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

  const actionAt = readAt;
  await deps.requestFreshLoginLink(facts.email);

  // Verified by re-reading, not by the call returning without throwing.
  const after = await deps.loadStudentFacts(facts.email);
  /*
   * The CYCLE's clock, not the wall clock.
   *
   * This function is handed a clock and every sibling diagnosis threads it
   * through as `readAt`. This one branch used to call `new Date()` twice, which
   * made the injected clock dead at the only place it decides anything -- the
   * `landed` comparison below. Two consequences, both real:
   *
   *  1. The cycle became untestable against a pinned clock. The suite pinned
   *     `now` to 2026-08-17 and minted a token expiring 2026-08-18T04:00:05Z;
   *     it passed until real time crossed that instant, then every live run
   *     started reading its own fresh token as already expired and escalating
   *     instead of replying. It went red mid-morning on 2026-08-18 with nobody
   *     having touched the watcher -- a test that fails by calendar.
   *  2. A replay or backfill run, which exists precisely to reason about a past
   *     window, would judge that window's tokens against today.
   *
   * Using the cycle clock does mean a token that expires DURING the cycle is
   * still called live. That window is seconds against an expiry measured in
   * hours, and the honest reading of `landed` is "did the link the repair just
   * minted take effect", which is a question about the moment of repair.
   */
  const verifiedAt = readAt;
  const postRead = ev(
    'enrollment-post',
    'enrollments: re-read after requesting the link',
    `count=${after?.activeEnrollmentCount ?? 'unknown'}, ` +
    `portal_token_expires_at=${after?.portalTokenExpiresAt ?? 'null'}`,
    verifiedAt,
    true,
  );

  const newExpiry = after?.portalTokenExpiresAt ? Date.parse(after.portalTokenExpiresAt) : NaN;
  const oldExpiry = facts.portalTokenExpiresAt ? Date.parse(facts.portalTokenExpiresAt) : NaN;
  const landed =
    after != null &&
    !after.unverifiable.includes('enrollment') &&
    after.activeEnrollmentCount === 1 &&
    Number.isFinite(newExpiry) &&
    newExpiry > verifiedAt.getTime() &&
    (!Number.isFinite(oldExpiry) || newExpiry > oldExpiry);

  if (!landed) {
    return {
      outcome: 'escalate',
      detail:
        `A fresh link was requested for ${facts.email} but the re-read does not show a live ` +
        `token (expires_at=${after?.portalTokenExpiresAt ?? 'null'}). Refusing to tell them it ` +
        'is fixed when the row does not agree.',
      evidence: [preRead, postRead],
    };
  }

  const expiryText = new Date(newExpiry).toISOString().replace('T', ' ').slice(0, 16) + ' UTC';
  const checkedClaim: Claim = {
    id: 'single-enrollment',
    kind: 'checked',
    text: 'I checked your account and it now resolves to exactly one active enrollment.',
    evidenceIds: ['enrollment-pre'],
  };
  const fixedClaim: Claim = {
    id: 'link-minted',
    kind: 'fixed',
    text: `I have just sent you a fresh sign in link, and I confirmed it is live until ${expiryText}.`,
    evidenceIds: ['enrollment-post'],
  };

  const body = [
    greeting(facts),
    '',
    'Sorry about the sign in trouble, and sorry it took a while to come back to you.',
    '',
    checkedClaim.text,
    fixedClaim.text,
    '',
    'Open the newest email from us and use the link in it. If you would rather request one',
    'yourself at any time, go to https://enterprise.colaberry.ai/portal/login and ask for a',
    'fresh link there. The links are single use and short lived, so always use the most recent.',
    '',
    'If it still will not let you in, reply here and I will pick it up.',
    SIGNOFF.trim(),
  ].join('\n');

  return {
    outcome: 'reply',
    body,
    bundle: {
      claims: [checkedClaim, fixedClaim],
      evidence: [preRead, postRead],
      actionAt: actionAt.toISOString(),
    },
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
