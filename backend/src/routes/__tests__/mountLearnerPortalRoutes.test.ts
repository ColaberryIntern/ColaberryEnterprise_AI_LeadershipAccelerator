// Each router is a sentinel: this suite is about the ORDER the module mounts them in, not what they serve, and importing the
// real routers would pull their controllers, models and half the service graph.
const ROUTERS = ['participantRoutes', 'capePortalRoutes', 'careerPortfolioRoutes', 'explorerSignalRoutes', 'journeyNudgeRoutes', 'consentPromptRoutes'] as const;
jest.mock('../participantRoutes', () => ({ __esModule: true, default: 'participantRoutes' }));
jest.mock('../capePortalRoutes', () => ({ __esModule: true, default: 'capePortalRoutes' }));
jest.mock('../careerPortfolioRoutes', () => ({ __esModule: true, default: 'careerPortfolioRoutes' }));
jest.mock('../explorerSignalRoutes', () => ({ __esModule: true, default: 'explorerSignalRoutes' }));
jest.mock('../journeyNudgeRoutes', () => ({ __esModule: true, default: 'journeyNudgeRoutes' }));
jest.mock('../consentPromptRoutes', () => ({ __esModule: true, default: 'consentPromptRoutes' }));

import fs from 'fs';
import path from 'path';
import type { Express } from 'express';
import { mountLearnerPortalRoutes } from '../mountLearnerPortalRoutes';

/**
 * T514 - the learner-portal mounts moved out of `server.ts` as they were
 * (T514a). Half source-level, like `publicCaseStudyRoutes.mount.test.ts`: the
 * property that matters most - these routers are mounted ABOVE `adminRoutes`,
 * whose guard would otherwise 401 every learner endpoint - is a property of
 * the text of `server.ts`. The other half drives the module for real against
 * a fake app and reads the order back.
 */

const SRC = path.join(__dirname, '..', '..');
const read = (rel: string) => fs.readFileSync(path.join(SRC, rel), 'utf8');
const server = read('server.ts');
const module_ = read('routes/mountLearnerPortalRoutes.ts');
const CALL = 'mountLearnerPortalRoutes(app);';

/** The block as it stood in server.ts at f3d5de7e..1e42709a (lines 186-194), one statement or comment per line. */
const BLOCK_BEFORE = [
  'app.use(participantRoutes);',
  'app.use(capePortalRoutes);',
  'app.use(careerPortfolioRoutes);',
  '// Explorer Growth OS learner signal ingest (EPIC 2). Dark until',
  '// EXPLORER_SIGNAL_INGEST_ENABLED + the master flag are both on.',
  'app.use(explorerSignalRoutes);',
  '// In-app consent prompt (participant-authed). A PROMPT, not a gate: the portal',
  '// stays fully usable whether a learner accepts, declines or ignores it.',
  'app.use(consentPromptRoutes);',
];

const mounted = (): string[] => {
  const use = jest.fn();
  mountLearnerPortalRoutes({ use } as unknown as Express);
  return use.mock.calls.map((c) => c[0] as string);
};

describe('the extraction (acceptance 7, 8)', () => {
  it('server.ts calls the module exactly once, at the position the block held: after the enrolment routes, before the CAPE admin routes, above adminRoutes', () => {
    expect(server).toContain("import { mountLearnerPortalRoutes } from './routes/mountLearnerPortalRoutes';");
    expect(server.split(CALL).length - 1).toBe(1);
    const call = server.indexOf(CALL);
    expect(server.indexOf('app.use(enrollmentRoutes);')).toBeLessThan(call);
    expect(server.indexOf('app.use(capeAdminRoutes);')).toBeGreaterThan(call);
    expect(server.indexOf('app.use(adminRoutes);')).toBeGreaterThan(call);
  });

  it('server.ts names none of the routers any more', () => {
    for (const r of ROUTERS) expect(server).not.toContain(r);
  });

  it('the module holds the block as it was, in order, one statement or comment per line, indented inside the function - with the nudge router in its slot', () => {
    const lines = module_.split('\n').map((l) => l.replace(/^ {2}/, ''));
    const at = lines.indexOf(BLOCK_BEFORE[0]);
    expect(at).toBeGreaterThan(-1);
    // T514b mounted journeyNudgeRoutes after explorerSignalRoutes (with a two-line comment); everything else is the block as it was.
    const withoutNudge = lines.slice(at).filter((l) => !/journey|Growth Journey|rows it answers/.test(l)).slice(0, BLOCK_BEFORE.length);
    expect(withoutNudge).toEqual(BLOCK_BEFORE);
    for (const r of ROUTERS) expect(module_).toContain(`import ${r} from './${r}';`);
    expect(module_).toContain('export function mountLearnerPortalRoutes(app: Express): void {');
  });

  it('the moved block is gone from server.ts line for line (the extraction commit recorded the count; a count is not a regression property - main grows)', () => {
    // T520's gate: the absolute pin (< 3,371 lines) broke the day main added 13 lines to server.ts. What the extraction
    // guarantees is that none of the block's lines remain in the parent, and that is what is pinned.
    const serverLines = new Set(server.split('\n').map((l) => l.trim()));
    for (const line of BLOCK_BEFORE) expect(serverLines.has(line.trim())).toBe(false);
  });
});

describe('the mount order, driven for real', () => {
  it('equals the old order, plus the nudge router in its slot: after the Explorer signals, before the consent prompt', () => {
    expect(mounted()).toEqual([...ROUTERS]);
    const order = mounted();
    expect(order.indexOf('journeyNudgeRoutes')).toBe(order.indexOf('explorerSignalRoutes') + 1);
    expect(order.indexOf('consentPromptRoutes')).toBe(order.indexOf('journeyNudgeRoutes') + 1);
  });

  it('mounts each router exactly once and nothing else', () => {
    const calls = mounted();
    expect(new Set(calls).size).toBe(calls.length);
    expect(calls.length).toBe(ROUTERS.length);
  });
});
