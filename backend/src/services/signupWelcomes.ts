/**
 * The greetings a person gets when they sign up, in one place, so freeSignupService (a grandfathered 500+ line file)
 * calls ONE function instead of growing a block per agent.
 *
 *   1. Reese's intros (reese/reeseWelcomeService): unchanged behavior, called first.
 *   2. Maya's welcome (maya/mayaWelcomeService, M32): shadow by default; records and sends nothing until Ali promotes it.
 *
 * Fire-and-forget by contract: signup must never wait on, or fail because of, a greeting. Each greeting runs in its own
 * try so one failing cannot stop the other, and a failure is logged with its class rather than swallowed silently.
 */
import { classifyError } from '../utils/errorClassifier';

function logFailure(event: string, enrollmentId: string, err: unknown): void {
  console.warn(JSON.stringify({
    timestamp: new Date().toISOString(), level: 'warn', service: 'backend', event, outcome: 'failure',
    error_class: classifyError(err), context: { enrollment_id: enrollmentId },
  }));
}

export async function runSignupWelcomes(enrollmentId: string): Promise<void> {
  try {
    const { maybeSendWelcomes } = await import('./reese/reeseWelcomeService');
    await maybeSendWelcomes(enrollmentId);
  } catch (err: unknown) {
    logFailure('signup_reese_welcome_failed', enrollmentId, err);
  }
  try {
    const { maybeSendMayaWelcome } = await import('./maya/mayaWelcomeService');
    await maybeSendMayaWelcome(enrollmentId);
  } catch (err: unknown) {
    logFailure('signup_maya_welcome_failed', enrollmentId, err);
  }
}
