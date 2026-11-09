/**
 * M32 hook: signup greets with Reese, then Maya; one failing never stops the other or the signup.
 *
 * WHY THIS SUITE INJECTS ITS GREETERS INSTEAD OF MOCKING THEIR MODULES.
 * It used to `jest.mock` both welcome modules and let `runSignupWelcomes` pick them up out of the registry. On CI that
 * was not reliable. In main's run 42663193985 the REAL `reeseWelcomeService` ran despite being mocked -- the proof is
 * that the only warning captured was its own `welcome_failed` (reeseWelcomeService.ts:438) in a test whose mock was set
 * to REJECT, so the mock plainly never applied -- while run 42639241242 passed on a byte-identical tree. Two runs red,
 * one green, same bytes. Injecting the greeter removes the module registry from the path, so these assertions are now
 * about behavior only.
 *
 * That trade has a cost: nothing below exercises the default (uninjected) wiring, because that is the part that was
 * flaky. The last two tests cover it statically instead -- they assert the defaults still name the two real modules AND
 * that those modules really export the functions named. That is what stops the seam drifting away from what ships.
 */
import * as fs from 'fs';
import * as path from 'path';
import { runSignupWelcomes, type SignupWelcomeDeps } from '../signupWelcomes';

const SERVICES = path.join(__dirname, '..');
const read = (rel: string) => fs.readFileSync(path.join(SERVICES, rel), 'utf8');

let warnSpy: jest.SpyInstance;
beforeEach(() => { warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => undefined); });
afterEach(() => warnSpy.mockRestore());

/** Every event name this run logged, in order, ignoring any warning that is not our JSON envelope. */
const loggedEvents = (): string[] => warnSpy.mock.calls
  .map((c) => { try { return JSON.parse(String(c[0])).event as string; } catch { return null; } })
  .filter((e): e is string => typeof e === 'string');

it('calls Reese first, then Maya, for the same enrollment', async () => {
  const order: string[] = [];
  const deps: SignupWelcomeDeps = {
    reese: async (id) => { order.push(`reese:${id}`); },
    maya: async (id) => { order.push(`maya:${id}`); },
  };

  await runSignupWelcomes('enr-1', deps);

  expect(order).toEqual(['reese:enr-1', 'maya:enr-1']);
  expect(loggedEvents()).toEqual([]);
});

it('Reese throwing does not stop Maya, and is logged with its class', async () => {
  const maya = jest.fn(async () => undefined);

  await expect(runSignupWelcomes('enr-1', {
    reese: async () => { throw new Error('reese down'); },
    maya,
  })).resolves.toBeUndefined();

  expect(maya).toHaveBeenCalledWith('enr-1');
  expect(loggedEvents()).toEqual(['signup_reese_welcome_failed']);
  const logged = JSON.parse(String(warnSpy.mock.calls[0][0]));
  expect(logged).toMatchObject({
    level: 'warn', outcome: 'failure', error_class: 'Error', context: { enrollment_id: 'enr-1' },
  });
});

it('Maya throwing never rejects, and is logged separately from Reese', async () => {
  const reese = jest.fn(async () => undefined);

  await expect(runSignupWelcomes('enr-2', {
    reese,
    maya: async () => { throw new Error('maya down'); },
  })).resolves.toBeUndefined();

  expect(reese).toHaveBeenCalledWith('enr-2');
  expect(loggedEvents()).toEqual(['signup_maya_welcome_failed']);
});

it('both failing still resolves, and logs one event each, Reese first', async () => {
  await expect(runSignupWelcomes('enr-3', {
    reese: async () => { throw new Error('reese down'); },
    maya: async () => { throw new Error('maya down'); },
  })).resolves.toBeUndefined();

  expect(loggedEvents()).toEqual(['signup_reese_welcome_failed', 'signup_maya_welcome_failed']);
});

it('the default wiring still points at the two real welcome modules', () => {
  const src = read('signupWelcomes.ts');

  // Each default is the real module's export, reached lazily. Asserted together so a greeter cannot be silently
  // unhooked while the import is left behind looking correct.
  // Anchored on the terminating `;`: without it, `maybeSendWelcomes` matches inside `maybeSendWelcomesNow`, and a
  // rename to a function that does not exist slips straight through. That mutation survived until this anchor existed.
  expect(src).toMatch(/deps\.reese \?\? \(await import\('\.\/reese\/reeseWelcomeService'\)\)\.maybeSendWelcomes;/);
  expect(src).toMatch(/deps\.maya \?\? \(await import\('\.\/maya\/mayaWelcomeService'\)\)\.maybeSendMayaWelcome;/);

  // The imports must stay LAZY: reeseWelcomeService statically imports three Sequelize models, and a static import
  // here would drag the model layer into every importer of this module. jest.ci.config.ts documents what that costs.
  expect(src).not.toMatch(/^import .*reeseWelcomeService/m);
  expect(src).not.toMatch(/^import .*mayaWelcomeService/m);
});

it('the functions those defaults name actually exist, with one required argument', () => {
  // Read rather than import: importing reeseWelcomeService here would load the model layer, which is the thing the
  // lazy import exists to avoid. A name that no longer exists is the drift this guards against.
  expect(read('reese/reeseWelcomeService.ts')).toMatch(/export async function maybeSendWelcomes\(enrollmentId: string/);
  expect(read('maya/mayaWelcomeService.ts')).toMatch(/export async function maybeSendMayaWelcome\(enrollmentId: string/);
});

it('freeSignupService calls the hook (so Reese is still greeted) instead of Reese directly', () => {
  const src = read('freeSignupService.ts');
  expect(src).toMatch(/runSignupWelcomes\(enrollment\.id\)/);
  // It must not have grown a second, direct greeting path alongside the hook.
  expect(src).not.toMatch(/maybeSendWelcomes|maybeSendMayaWelcome/);
});
