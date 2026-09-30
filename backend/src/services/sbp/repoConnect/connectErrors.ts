/**
 * connectErrors — the classified failure vocabulary of the connect step.
 *
 * A student connecting a folder they have already been working in is the single
 * most fragile moment in the pipeline: they have real work on disk, and every
 * message they see has to tell them exactly which of five different things went
 * wrong. "Bad request" sends them to Slack; "we can see the repo but you have
 * not pushed the connect file yet" sends them to their terminal.
 *
 * So every failure carries three things:
 *   - `error_class` — stable, logged, never prose. What the platform matches on.
 *   - `student_message` — what a human reads. Names the thing to do next.
 *   - `http_status` — decided here, not guessed at the route boundary.
 *
 * No generic 400 exists in this module by construction: every constructor
 * demands a class, and the class picks the status.
 */

export type RepoConnectErrorClass =
  /** The text they pasted is not a GitHub repo reference at all. */
  | 'InvalidRepoReference'
  /** GitHub answered 404 — it does not exist, or it is private and we cannot see it. */
  | 'RepoNotFound'
  /** The platform can see the repo but cannot establish that the student can push to it. */
  | 'NoPushAccess'
  /** Another project in the platform already points at this repo. */
  | 'RepoAlreadyClaimed'
  /** This project already points at a DIFFERENT repo that has commits in it. */
  | 'RepoRebindRefused'
  /** The proof file has not been pushed yet. Normal mid-flow state, not a fault. */
  | 'ChallengeNotFound'
  /** The proof file is there but carries the wrong token. */
  | 'ChallengeMismatch'
  /** No connect was started for this project, so there is nothing to confirm. */
  | 'NoPendingConnect'
  /** The repo exists but has no commits — nothing to read, nothing to verify against. */
  | 'RepoEmpty'
  /** GitHub rate-limited us. Their repo is fine; come back shortly. */
  | 'RateLimited'
  /** The platform's own credential cannot read the repo. Our side, not theirs. */
  | 'Unauthorized'
  /** GitHub did not answer inside the timeout. */
  | 'UpstreamTimeout'
  /** Anything else GitHub returned that we did not plan for. */
  | 'UpstreamError'
  /** The platform is missing configuration. Our side. */
  | 'ConfigError'
  /** The project does not exist, or is not the caller's. Deliberately the same. */
  | 'ProjectNotFound'
  /** There is no published plan to render documents from. */
  | 'NoPublishedPlan';

/** HTTP status per class. Centralised so no route has to decide. */
const STATUS: Record<RepoConnectErrorClass, number> = {
  InvalidRepoReference: 400,
  RepoNotFound: 404,
  NoPushAccess: 403,
  RepoAlreadyClaimed: 409,
  RepoRebindRefused: 409,
  ChallengeNotFound: 409,
  ChallengeMismatch: 409,
  NoPendingConnect: 409,
  RepoEmpty: 409,
  RateLimited: 429,
  Unauthorized: 502,
  UpstreamTimeout: 504,
  UpstreamError: 502,
  ConfigError: 503,
  ProjectNotFound: 404,
  NoPublishedPlan: 409,
};

export class RepoConnectError extends Error {
  public readonly error_class: RepoConnectErrorClass;
  public readonly http_status: number;
  /** What the student reads. Always says what to do next. */
  public readonly student_message: string;
  /** Extra structured context for the response — never secrets. */
  public readonly details: Record<string, unknown>;

  constructor(
    error_class: RepoConnectErrorClass,
    student_message: string,
    details: Record<string, unknown> = {},
  ) {
    super(`${error_class}: ${student_message}`);
    this.name = 'RepoConnectError';
    this.error_class = error_class;
    this.http_status = STATUS[error_class];
    this.student_message = student_message;
    this.details = details;
  }
}

export function isRepoConnectError(err: unknown): err is RepoConnectError {
  return err instanceof RepoConnectError;
}
