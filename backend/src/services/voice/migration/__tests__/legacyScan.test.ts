import { byFile } from '../../../../scripts/voice/scanLegacy';
import { isScanned, scanAll, scanFile } from '../legacyScan';

const kinds = (text: string, file = 'backend/src/x.ts') => scanFile(file, text).operational.map((h) => `${h.line}:${h.kind}`);

describe('what counts as depending on Synthflow', () => {
  it.each<[string, string, string[]]>([
    ['a host', "fetch('https://api.synthflow.ai/v2/calls');", ['1:host']],
    ['an environment variable', 'const k = process.env.SYNTHFLOW_API_KEY;', ['1:env']],
    ['an identifier', 'callSynthflow();', ['1:identifier']],
    ['an import', "import { x } from './synthflowService';", ['1:string']],
    ['a string', "const p = 'synthflow';", ['1:string']],
    ['the misspelling', 'const syntheflowId = 1;', ['1:identifier']],
    ['inside a template', '`a ${b} synthflow`;', ['1:string']],
    ['inside a regular expression', 'const r = /synthflow/;', ['1:string']],
    ['a later line of a template', 'const s = `one\ntwo\nsynthflow`;', ['3:string']],
    ['a property', 'a.synthflow_call_id;', ['1:identifier']],
  ])('%s', (_n, text, want) => expect(kinds(text)).toEqual(want));
  it('JSX text', () => expect(kinds('export const A = () => <p>Synthflow</p>;', 'frontend/src/A.tsx')).toEqual(['1:string']));
  it('a config file, but not its comments', () => {
    expect(kinds('a: 1\nb: ${SYNTHFLOW_API_KEY}\n# synthflow note\nc: synthflow\n', 'docker-compose.production.yml')).toEqual(['2:env', '4:config']);
    expect(kinds("SELECT 1; -- synthflow\nSELECT 'synthflow';", 'backend/src/db/x.sql')).toEqual(['2:config']);
  });
});

describe('what does not', () => {
  it.each([['a line comment', '// synthflow once did this\nconst a = 1;'], ['a block comment', '/* synthflow */ const a = 1;'], ['nothing', 'const a = 1;']])('%s', (_n, t) => expect(kinds(t)).toEqual([]));
  it.each(['docs/a.md', 'README.md', 'backend/src/a/__tests__/x.ts', 'backend/src/a.test.ts', 'tests/systemV2/a.js', 'scripts/artifacts/tickets/vsData.js', 'backend/src/services/voice/migration/legacyScan.ts', 'backend/src/scripts/voice/scanLegacy.ts', 'package-lock.json'])('%s is not scanned', (p) => expect(isScanned(p)).toBe(false));
  it.each(['backend/src/a.ts', 'frontend/src/A.tsx', 'docker-compose.production.yml', '.env.example', 'nginx/nginx.conf', 'scripts/x.js', 'execution/a.py', 'backend/src/services/voice/rollout/reconcile.ts'])('%s is', (p) => expect(isScanned(p)).toBe(true));
});

describe('archival marks', () => {
  const run = (t: string) => { const r = scanFile('a.ts', t); return [r.operational.length, r.archival.length, r.badMarks.length]; };
  it('a reason excuses a name on that line only', () => {
    expect(run("const p = 'synthflow'; // synthflow-archival: historical rows keep their provider name")).toEqual([0, 1, 0]);
    expect(run("const p = 'synthflow'; // synthflow-archival: historical rows keep their provider name\nconst q = 'synthflow';")).toEqual([1, 1, 0]);
  });
  it.each([
    ['no reason', "const p = 'synthflow'; // synthflow-archival:"],
    ['hardly a reason', "const p = 'synthflow'; // synthflow-archival: ok"],
    ['a host', "fetch('https://api.synthflow.ai'); // synthflow-archival: historical rows keep their provider name"],
    ['a key', 'process.env.SYNTHFLOW_API_KEY; // synthflow-archival: historical rows keep their provider name'],
  ])('%s is not excused, and is reported', (_n, t) => expect(run(t)).toEqual([1, 0, 1]));
  it('a mark inside a string is not a mark', () => expect(run("const p = 'synthflow-archival: historical rows keep their provider name';")).toEqual([1, 0, 0]));
});

describe('the verdict', () => {
  it('a planted reference anywhere fails it; none passes it', () => {
    const clean = [{ path: 'backend/src/a.ts', text: 'const a = 1; // synthflow' }];
    expect(scanAll(clean).clean).toBe(true);
    expect(scanAll([...clean, { path: 'frontend/src/B.tsx', text: 'export const b = synthflowThing;' }])).toMatchObject({ clean: false, byKind: { identifier: 1 } });
    expect(scanAll([{ path: 'backend\\src\\w.ts', text: "'synthflow'" }]).clean).toBe(false);
  });
  it('scanning nothing is not clean', () => {
    expect(scanAll([]).clean).toBe(false);
    expect(scanAll([{ path: 'docs/a.md', text: 'x' }]).clean).toBe(false);
  });
  it('lists the worst files first', () => expect(byFile([{ file: 'b', line: 1, kind: 'env' }, { file: 'a', line: 1, kind: 'env' }, { file: 'a', line: 2, kind: 'env' }])).toEqual([['a', 2], ['b', 1]]));
});
