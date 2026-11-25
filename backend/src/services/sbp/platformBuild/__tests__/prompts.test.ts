jest.mock('../../commandCenterStory', () => ({ commandCenterPrompt: jest.fn(() => 'STUDENT CC BRIEF') }));
jest.mock('../../connectedDemoStory', () => ({ connectedDemoPrompt: jest.fn(() => 'STUDENT DEMO BRIEF') }));

import { platformCommandCenterPrompt, platformDemoPrompt, PLATFORM_BUILD_DONE } from '../prompts';

const plan = { project_name: 'x', releases: [], stories: [], requirements: [] } as any;

describe('platform build prompts', () => {
  it('put the unattended rules FIRST and the unchanged student brief after them', () => {
    const p = platformCommandCenterPrompt(plan, null, { projectId: 'p' });
    expect(p.startsWith('# PLATFORM BUILD MODE')).toBe(true);
    expect(p.indexOf('THIS BLOCK WINS')).toBeLessThan(p.indexOf('STUDENT CC BRIEF'));
    expect(p).toContain(PLATFORM_BUILD_DONE);
    expect(p).toMatch(/Never stop to ask/);
    expect(p).toMatch(/Do not run git/);
    expect(p).toMatch(/localStorage/);
  });

  it('limit the demo brief to the spec and point it back at the Command Center', () => {
    const d = platformDemoPrompt(plan);
    expect(d.indexOf('demo/demo-spec.json')).toBeLessThan(d.indexOf('STUDENT DEMO BRIEF'));
    expect(d).toContain('../index.html');
    expect(d).toMatch(/Do not write `demo\/index.html`/);
  });

  it('only ever ask for file types nginx routes to the backend', () => {
    const p = platformCommandCenterPrompt(plan, null);
    expect(p).toMatch(/Write only `\.html`, `\.css`, `\.js`, `\.json` or `\.md` files/);
  });
});
