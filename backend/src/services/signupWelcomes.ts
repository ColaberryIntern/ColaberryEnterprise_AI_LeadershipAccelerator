/**
 * The greetings a person gets when they sign up, in one place, so freeSignupService (a grandfathered 500+ line file)
 * calls ONE function instead of growing a block per agent.
 *
 *   1. Reese's intros (reese/reeseWelcomeService): unchanged behavior, called first.
 *   2. Maya's welcome (maya/mayaWelcomeService, M32): shadow by default; records and sends nothing until Ali promotes it.
 *
 * Fire-and-forget by contract: signup must never wait on, or fail because of, a greeting. Each greeting runs in its own
 * try so one failing cannot stop the other, and a failure is logged with its class rather than swallowed silently.
 *
 * WHY THE GREETERS ARE LOADED LAZILY, and why that must not be "simplified" to a static import.
 * `reese/reeseWelcomeService` statically imports three Sequelize models (ReeseWelcome, Enrollment, Cohort), so a static
 * import here would pull the whole model layer into every module that imports this one. `backend/jest.ci.config.ts`
 * documents at length what that costs: suites that touch the model layer at import time die before a single test runs.
 * The lazy import keeps this module cheap to import, and it is also why `freeSignupService` imports THIS module lazily.
 *
 * WHY THERE IS A `deps` SEAM. Mocking those two modules out of the registry is how the test used to reach them, and on
 * CI it was not reliable: main's run 42663193985 executed the REAL reeseWelcomeService despite a `jest.mock` of it
 * (the giveaway was its own `welcome_failed` warning, reeseWelcomeService.ts:438, in a test that had mocked the module
 * to reject), while run 42639241242 passed on a byte-identical tree. An injected greeter is deterministic: there is no
 * module registry in the path at all. The defaults below are the production wiring, and `signupWelcomes.test.ts`
 * asserts that those defaults still name the two real modules, so the seam cannot drift away from what ships.
 */
import { classifyError } from '../utils/errorClassifier';

/**
 * One greeter: given an enrollment, greet that person.
 *
 * The result is `unknown` rather than `void` because each agent returns its own report -- `maybeSendWelcomes` gives
 * `WelcomeResult[]`, `maybeSendMayaWelcome` gives `MayaWelcomeResult` -- and nothing here reads either. `Promise<void>`
 * would not merely be untidy, it would not compile: the "a source may return anything where the target returns void"
 * rule applies to a signature's own return type, not to a type argument inside `Promise<...>`.
 */
export type Greeter = (enrollmentId: string) => Promise<unknown>;

export interface SignupWelcomeDeps {
  reese?: Greeter;
  maya?: Greeter;
}

function logFailure(event: string, enrollmentId: string, err: unknown): void {
  console.warn(JSON.stringify({
    timestamp: new Date().toISOString(), level: 'warn', service: 'backend', event, outcome: 'failure',
    error_class: classifyError(err), context: { enrollment_id: enrollmentId },
  }));
}

/**
 * Greet a new signup: Reese first, then Maya. Never rejects, never lets one greeter stop the other.
 *
 * `deps` exists for tests. Production calls this with one argument, so a greeter left unset is loaded from its real
 * module at the moment it is needed -- which is also what keeps the model layer out of this module's import graph.
 */
export async function runSignupWelcomes(enrollmentId: string, deps: SignupWelcomeDeps = {}): Promise<void> {
  try {
    // The import sits INSIDE the try on purpose: a greeter whose module fails to load is a failed greeting, logged
    // with its class, not an exception that escapes into signup.
    const reese = deps.reese ?? (await import('./reese/reeseWelcomeService')).maybeSendWelcomes;
    await reese(enrollmentId);
  } catch (err: unknown) {
    logFailure('signup_reese_welcome_failed', enrollmentId, err);
  }
  try {
    const maya = deps.maya ?? (await import('./maya/mayaWelcomeService')).maybeSendMayaWelcome;
    await maya(enrollmentId);
  } catch (err: unknown) {
    logFailure('signup_maya_welcome_failed', enrollmentId, err);
  }
}
