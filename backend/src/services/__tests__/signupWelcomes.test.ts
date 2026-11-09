import * as fs from 'fs';
import * as path from 'path';
import * as reeseSvc from '../reese/reeseWelcomeService';
import * as mayaSvc from '../maya/mayaWelcomeService';
import { runSignupWelcomes } from '../signupWelcomes';

/**
 * M32 hook: signup greets with Reese, then Maya; one failing never stops the other or the signup.
 *
 * runSignupWelcomes reaches the two services via dynamic `await import()`. Under the CI suite's worker sharding a
 * prior file in the same worker loads the REAL reeseWelcomeService into Node's module cache BELOW jest's registry,
 * so `jest.mock` + the dynamic import stop intercepting (the real service runs, logs its own `welcome_failed`, and
 * the order/warning assertions miss — the test passed alone but failed in the suite). Resetting the registry does
 * not clear that cache. So instead of mocking the module, spy on the real module OBJECTS: whatever instance the
 * dynamic import resolves to is the same one spied here, so the stubs always apply, hermetic regardless of sharding.
 */
let reese: jest.SpyInstance;
let maya: jest.SpyInstance;
let warnSpy: jest.SpyInstance;
beforeEach(() => {
  reese = jest.spyOn(reeseSvc, 'maybeSendWelcomes').mockResolvedValue([]);
  maya = jest.spyOn(mayaSvc, 'maybeSendMayaWelcome').mockResolvedValue(undefined as never);
  warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
});
afterEach(() => { jest.restoreAllMocks(); });

it('calls Reese first, then Maya, for the same enrollment', async () => {
  const order: string[] = [];
  reese.mockImplementation(async () => { order.push('reese'); return []; });
  maya.mockImplementation(async () => { order.push('maya'); });
  await runSignupWelcomes('enr-1');
  expect(order).toEqual(['reese', 'maya']);
  expect(reese).toHaveBeenCalledWith('enr-1');
  expect(maya).toHaveBeenCalledWith('enr-1');
});

it('Reese throwing does not stop Maya, and is logged with its class', async () => {
  reese.mockRejectedValue(new Error('reese down'));
  await expect(runSignupWelcomes('enr-1')).resolves.toBeUndefined();
  expect(maya).toHaveBeenCalled();
  // Among the warnings, not necessarily first: other welcome code may also warn in the same run.
  expect(warnSpy.mock.calls.map((c) => { try { return JSON.parse(String(c[0])).event; } catch { return null; } })).toContain('signup_reese_welcome_failed');
});

it('Maya throwing never rejects', async () => {
  maya.mockRejectedValue(new Error('maya down'));
  await expect(runSignupWelcomes('enr-1')).resolves.toBeUndefined();
});

it('freeSignupService calls the hook (so Reese is still greeted) instead of Reese directly', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'freeSignupService.ts'), 'utf8');
  expect(src).toMatch(/runSignupWelcomes\(enrollment\.id\)/);
});
