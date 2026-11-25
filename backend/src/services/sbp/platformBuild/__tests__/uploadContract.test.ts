import { checkUpload, isServablePath, PLATFORM_BUILD_MAX_CC_BYTES, PLATFORM_BUILD_MAX_FILE_BYTES } from '../uploadContract';

const VALID_SPEC = {
  schema_version: 2,
  environment: 'demo',
  app: { name: 'ShiftFill', descriptor: 'Fills shifts', persona: { name: 'Dana', role: 'Ops' } },
  events: [],
  // Fields outside the public allowlist must survive: the student's demo uses them.
  coverage: [{ story: 'STORY-001', screen: 'gaps' }],
};

const cc = (extra: Record<string, string> = {}) => ({
  'index.html': '<!doctype html><html><head></head><body>cc</body></html>',
  'command-center/js/core.js': 'console.log(1)',
  'command-center/styles.css': 'body{}',
  ...extra,
});

describe('uploadContract: happy path', () => {
  it('accepts a Command Center and a valid demo spec', () => {
    const v = checkUpload({ files: cc({ 'demo/demo-spec.json': JSON.stringify(VALID_SPEC) }), cost_usd: 3.2 });
    expect(v.ok).toBe(true);
    if (!v.ok) return;
    expect(Object.keys(v.accepted.commandCenter).sort()).toEqual(['command-center/js/core.js', 'command-center/styles.css', 'index.html']);
    expect(v.accepted.demoSpec).toEqual(VALID_SPEC);
    expect(v.accepted.demoProblems).toEqual([]);
  });

  it('keeps the Command Center when the demo is missing or invalid, and reports the demo', () => {
    const missing = checkUpload({ files: cc() });
    expect(missing.ok && missing.accepted.demoSpec).toBeNull();
    expect(missing.ok && missing.accepted.demoProblems[0].problem).toMatch(/no demo spec/);

    const broken = checkUpload({ files: cc({ 'demo/demo-spec.json': '{not json' }) });
    expect(broken.ok && broken.accepted.demoProblems[0].problem).toMatch(/not valid JSON/);

    const wrongShape = checkUpload({ files: cc({ 'demo/demo-spec.json': JSON.stringify({ schema_version: 1 }) }) });
    expect(wrongShape.ok).toBe(true);
    expect(wrongShape.ok && wrongShape.accepted.demoSpec).toBeNull();
    expect(wrongShape.ok && wrongShape.accepted.demoProblems.length).toBeGreaterThan(0);
  });
});

describe('uploadContract: refusals', () => {
  it('refuses a body that is not { files }', () => {
    expect(checkUpload(null).ok).toBe(false);
    expect(checkUpload({ files: 'x' }).ok).toBe(false);
    expect(checkUpload({ files: {}, extra: 1 }).ok).toBe(false);
  });

  it('refuses an upload with no index.html', () => {
    const v = checkUpload({ files: { 'command-center/a.js': '1' } });
    expect(v.ok).toBe(false);
    expect(!v.ok && v.problems.map((p) => p.problem).join()).toMatch(/entry point is missing/);
  });

  it.each([
    ['../etc/passwd.js'],
    ['/abs/index.html'],
    ['command-center/../../x.js'],
    ['.colaberry/plan.json'],
    ['command-center/.hidden.js'],
    ['command-center/logo.svg'],
    ['command-center/Upper.js'],
    ['command-center/a b.js'],
    ['docs/STORIES.md'],
  ])('refuses %s', (path) => {
    const v = checkUpload({ files: cc({ [path]: 'x' }) });
    expect(v.ok).toBe(false);
    expect(!v.ok && v.problems.some((p) => p.path === path)).toBe(true);
  });

  it('refuses an oversize file and an oversize Command Center, listing every problem', () => {
    const big = 'x'.repeat(PLATFORM_BUILD_MAX_FILE_BYTES + 1);
    const v = checkUpload({ files: cc({ 'command-center/big.js': big, 'command-center/x.svg': 'x' }) });
    expect(v.ok).toBe(false);
    expect(!v.ok && v.problems.length).toBe(2);

    const many: Record<string, string> = { 'index.html': 'x' };
    const chunk = 'y'.repeat(PLATFORM_BUILD_MAX_FILE_BYTES - 10);
    for (let i = 0; i * chunk.length <= PLATFORM_BUILD_MAX_CC_BYTES; i += 1) many[`command-center/f${i}.js`] = chunk;
    const total = checkUpload({ files: many });
    expect(!total.ok && total.problems.map((p) => p.problem).join()).toMatch(/Command Center is \d+ bytes/);
  });
});

describe('isServablePath', () => {
  it('allows only the four routed types', () => {
    expect(isServablePath('index.html')).toBe(true);
    expect(isServablePath('command-center/js/tabs/pm.js')).toBe(true);
    expect(isServablePath('command-center/notes.json')).toBe(true);
    expect(isServablePath('command-center/readme.md')).toBe(true);
    expect(isServablePath('command-center/x.png')).toBe(false);
    expect(isServablePath('command-center/x.txt')).toBe(false);
    expect(isServablePath('')).toBe(false);
  });
});
