/**
 * sbpFailure — classify a build failure, and say what it means for a student.
 *
 * Deliberately free of imports. It carries no axios, no React and no portal
 * client, so the distinction it draws can be tested on its own — which is the
 * point, because the thing that went wrong here was untested COPY, not
 * transport. See sbpApi.ts for the calls that produce these errors.
 */
/**
 * WHY a build did not happen, at the only granularity that changes what the
 * student should do next.
 *
 * The page used to collapse all of these into one banner reading "We could not
 * reach the requirements service ... start the build again once you are back
 * online". That sentence is true for exactly one member of this union. Taiwo
 * Oludimimu was shown it after a `rejected` — the server answered him in the
 * same second — so the only instruction he was given was the only one that
 * could not possibly work.
 */
export type SbpFailureKind =
  /** No response at all: DNS, offline, CORS, connection refused. */
  | 'unreachable'
  /** The server answered and refused the payload. Retrying unchanged repeats it. */
  | 'rejected'
  /** The server answered and broke. Not the student's doing; retrying may work. */
  | 'server_error'
  /** Pipeline flag off for this account. */
  | 'not_enabled'
  /** At capacity; a later retry is the right move. */
  | 'unavailable'
  /** We stopped waiting. The build may still be running server-side. */
  | 'timeout';

/** A failure the UI must show rather than swallow. */
export interface SbpError {
  status: number | null;
  message: string;
  kind: SbpFailureKind;
  /** Field paths the server named in its Zod `issues`, when it rejected us. */
  fields?: string[];
}

/** Student-facing names for the payload fields, including the derived ones. */
const FIELD_LABELS: Record<string, string> = {
  users: 'one of your interview answers',
  data_sources: 'one of your interview answers',
  done_definition: 'one of your interview answers',
  idea: 'your idea',
  name: 'your project name',
  answers: 'one of your interview answers',
};

const labelFor = (path: string): string => {
  // `answers.0.answer` and `users` should read the same to a student: both are
  // something they typed into the interview.
  const head = path.split('.')[0];
  return FIELD_LABELS[head] || 'one of your answers';
};

/** Turn the server's Zod issues into a sentence about what the student typed. */
function messageForIssues(issues: any[]): string | null {
  if (!Array.isArray(issues) || issues.length === 0) return null;

  const tooBig = issues.filter((i) => i?.code === 'too_big');
  if (tooBig.length > 0) {
    const limit = tooBig
      .map((i) => (typeof i.maximum === 'number' ? i.maximum : null))
      .filter((n): n is number => n !== null)
      .sort((a, b) => a - b)[0];
    const what = labelFor(String(tooBig[0]?.path?.[0] ?? ''));
    return limit
      ? `${what} is longer than we can take (the limit is ${limit.toLocaleString()} characters).`
      : `${what} is longer than we can take.`;
  }

  const tooSmall = issues.find((i) => i?.code === 'too_small');
  if (tooSmall) return `${labelFor(String(tooSmall.path?.[0] ?? ''))} is too short.`;

  const first = issues[0];
  return `We could not accept ${labelFor(String(first?.path?.[0] ?? ''))}.`;
}

/**
 * Classify an axios rejection. Exported so the distinction is testable —
 * the previous version was a private helper and its one-size message could not
 * be asserted against.
 */
export function classifyError(err: any): SbpError {
  const status: number | null = err?.response?.status ?? null;
  const data = err?.response?.data;
  const issues: any[] = Array.isArray(data?.issues) ? data.issues : [];
  const fields = issues
    .map((i) => (Array.isArray(i?.path) ? i.path.join('.') : null))
    .filter((p): p is string => !!p);

  if (status === null) {
    return { status, kind: 'unreachable', message: err?.message || 'We could not reach the server.' };
  }
  if (status === 404) {
    return { status, kind: 'not_enabled', message: 'The build pipeline is not enabled for your account yet.' };
  }
  if (status === 503) {
    return { status, kind: 'unavailable', message: 'We are at capacity right now. Try again in a few minutes.' };
  }
  if (status >= 500) {
    return { status, kind: 'server_error', message: data?.error || 'The build service hit an error.' };
  }
  if (status >= 400) {
    // Prefer the field-level reason over the server's generic word. `Invalid
    // input` is what a student was shown for a month; it names nothing and
    // suggests nothing.
    const specific = messageForIssues(issues);
    const generic = data?.error && data.error !== 'Invalid input' ? data.error : null;
    return {
      status,
      kind: 'rejected',
      message: specific || generic || 'Some of your answers could not be accepted.',
      ...(fields.length ? { fields } : {}),
    };
  }
  return { status, kind: 'server_error', message: data?.error || err?.message || 'Something went wrong starting your build.' };
}

/** Banner copy for a failure: what happened, and what to do about it. */
export function describeFailure(e: SbpError): { title: string; body: string; action: string } {
  switch (e.kind) {
    case 'rejected':
      return {
        title: 'We could not start your build from those answers.',
        body: `The build service read your answers and turned them down: ${e.message} Nothing was lost, and this is not a connection problem.`,
        action: 'Start the build again and shorten that answer, and it will go through.',
      };
    case 'unreachable':
      return {
        title: 'We built you a starter template, not your plan.',
        body: 'We could not reach the requirements service, so this is a general ten-task template rather than a plan written from your answers.',
        action: 'It is worth starting the build again once you are back online.',
      };
    case 'not_enabled':
      return {
        title: 'We built you a starter template, not your plan.',
        body: 'The build pipeline is not switched on for your account yet, so this is a general ten-task template.',
        action: 'Tell us and we will enable it for you.',
      };
    case 'unavailable':
      return {
        title: 'We built you a starter template, not your plan.',
        body: 'The build service is at capacity right now, so this is a general ten-task template.',
        action: 'Start the build again in a few minutes.',
      };
    case 'timeout':
      return {
        title: 'Your build is taking longer than expected.',
        body: 'It may still be running. What you are looking at is the starter template.',
        action: 'Reopen this page in a few minutes to check.',
      };
    default:
      return {
        title: 'We built you a starter template, not your plan.',
        body: `The build service hit an error, so this is a general ten-task template. ${e.message}`,
        action: 'Start the build again, and tell us if it happens twice.',
      };
  }
}

