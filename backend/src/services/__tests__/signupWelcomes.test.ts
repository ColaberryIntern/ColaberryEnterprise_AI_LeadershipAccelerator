const reese = jest.fn();
const maya = jest.fn();
jest.mock('../reese/reeseWelcomeService', () => ({ maybeSendWelcomes: (...a: unknown[]) => reese(...a) }));
jest.mock('../maya/mayaWelcomeService', () => ({ maybeSendMayaWelcome: (...a: unknown[]) => maya(...a) }));

import * as fs from 'fs';
import * as path from 'path';
import { runSignupWelcomes } from '../signupWelcomes';

/** M32 hook: signup greets with Reese, then Maya; one failing never stops the other or the signup. */
let warnSpy: jest.SpyInstance;
beforeEach(() => { reese.mockReset(); maya.mockReset(); warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => undefined); });
afterEach(() => warnSpy.mockRestore());

it('calls Reese first, then Maya, for the same enrollment', async () => {
  const order: string[] = [];
  reese.mockImplementation(async () => { order.push('reese'); });
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
  expect(JSON.parse(String(warnSpy.mock.calls[0][0])).event).toBe('signup_reese_welcome_failed');
});

it('Maya throwing never rejects', async () => {
  maya.mockRejectedValue(new Error('maya down'));
  await expect(runSignupWelcomes('enr-1')).resolves.toBeUndefined();
});

it('freeSignupService calls the hook (so Reese is still greeted) instead of Reese directly', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'freeSignupService.ts'), 'utf8');
  expect(src).toMatch(/runSignupWelcomes\(enrollment\.id\)/);
});
