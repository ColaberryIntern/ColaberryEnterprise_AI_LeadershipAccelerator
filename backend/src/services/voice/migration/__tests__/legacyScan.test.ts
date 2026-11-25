import fs from 'fs';
import path from 'path';
import { byFile } from '../../../../scripts/voice/scanLegacy';
import { isScanned, scanAll, scanFile, TOOLING } from '../legacyScan';

const kinds = (text: string, file = 'backend/src/x.ts') => scanFile(file, text).operational.map((h) => `${h.line}:${h.kind}`);
const WHY = 'synthflow-archival: historical rows keep their provider name';

describe('what counts as depending on Synthflow', () => {
  it.each<[string, string, string[]]>([
    ['a host', "const u = 'https://api.synthflow.ai/v2/calls';", ['1:host']],
    ['an environment variable', 'const k = process.env.SYNTHFLOW_API_KEY;', ['1:env']],
    ['one with a prefix or an underscore', "const k = ['MY_SYNTHFLOW_KEY', 'SYNTH_FLOW_API_KEY'];", ['1:env']],
    ['an identifier', 'const synthflowId = 1;', ['1:identifier']],
    ['a property', 'const x = a.synthflow_call_id;', ['1:identifier']],
    ['a call', 'callSynthflow();', ['1:dispatch']],
    ['a method on it', 'b.synthflowService.startCall(p);', ['1:dispatch']],
    ['an argument', "dial('synthflow');", ['1:dispatch']],
    ['an import', "import { x } from './synthflowService';", ['1:dispatch']],
    ['a re-export', "export * from './synthflowService';", ['1:dispatch']],
    ['a dynamic import', "const m = import('./synthflowService');", ['1:dispatch']],
    ['a string', "const p = 'synthflow';", ['1:string']],
    ['the misspelling', 'const syntheflowId = 1;', ['1:identifier']],
    ['a hyphen', "const p = 'synth-flow';", ['1:string']],
    ['inside a template', 'const t = `a ${b} synthflow`;', ['1:string']],
    ['inside a regular expression', 'const r = /synthflow/;', ['1:string']],
    ['a later line of a template', 'const s = `one\ntwo\nsynthflow`;', ['3:string']],
    ['a unicode escape', "const p = '\\u0073ynthflow';", ['1:string']],
    ['a hex escape in a host', "const p = '\\x73ynthflow.ai';", ['1:host']],
    ['a line continuation', "const p = 'synth\\\nflow';", ['1:string']],
    ['joined strings', "const p = 'syn' + ('thfl' + 'ow.ai');", ['1:host']],
    ['a template joined from constants', "const p = `synth${'flow'}`;", ['1:string']],
    ['inside a function passed to a call', "run(() => { const p = 'synthflow'; });", ['1:string']],
  ])('%s', (_n, text, want) => expect(kinds(text)).toEqual(want));
  it('JSX text and props, in tsx and js', () => {
    expect(kinds('export const A = () => <p>Synthflow</p>;', 'frontend/src/A.tsx')).toEqual(['1:string']);
    expect(kinds('export const A = () => <P who="synthflow" />;', 'frontend/src/A.js')).toEqual(['1:dispatch']);
  });
  it.each<[string, string, string[]]>([
    ['docker-compose.production.yml', 'a: 1\nb: ${SYNTHFLOW_API_KEY}\n# synthflow note\nc: synthflow\n', ['2:env', '4:config']],
    ['backend/src/db/x.sql', "SELECT 1;\n-- synthflow\nSELECT 'a -- b', 'synthflow';", ['3:config']],
    ['scripts/x.sh', 'curl -H "X: # y" https://api.synthflow.ai', ['1:host']],
    ['a.yml', 'note: "a # b synthflow"', ['1:config']],
    ['x.ps1', '$env:SYNTHFLOW_API_KEY', ['1:env']], ['Makefile', 'synthflow:', ['1:config']], ['prod.env', 'SYNTHFLOW_API_KEY=', ['1:env']], ['.githooks/pre-commit', 'synthflow', ['1:config']],
    ['package.json', '# synthflow', ['1:config']],
  ])('%s, but not a line that is only a comment', (file, text, want) => expect(kinds(text, file)).toEqual(want));
});

describe('what does not', () => {
  it.each([['a line comment', '// synthflow once did this\nconst a = 1;'], ['a block comment', '/* synthflow */ const a = 1;'], ['nothing', 'const a = 1;'], ['a runtime name', 'const a = `synth${x}`;']])('%s', (_n, t) => expect(kinds(t)).toEqual([]));
  it.each(['docs/a.md', 'README.md', 'backend/src/a/__tests__/x.ts', 'backend/src/a.test.ts', 'tests/systemV2/a.js', 'scripts/artifacts/tickets/vsData.js', 'backend/src/services/voice/migration/legacyScan.ts', 'backend/src/scripts/voice/scanLegacy.ts', 'package-lock.json', 'a/b.png'])('%s is not scanned', (p) => expect(isScanned(p)).toBe(false));
  it.each(['backend/src/a.ts', 'frontend/src/A.tsx', 'docker-compose.production.yml', '.env.example', 'prod.env', 'nginx/nginx.conf', 'scripts/x.js', 'execution/a.py', 'x.ps1', 'x.bat', 'Makefile', 'crontab', 'a.service', 'a.tf', 'a.txt', 'a.xml', '.claude/skills/x/run.js', 'backend/src/build/x.ts', 'backend/src/services/voice/migration/dispatch.ts'])('%s is', (p) => expect(isScanned(p)).toBe(true));
});

describe('archival marks', () => {
  const run = (t: string, f = 'a.ts') => { const r = scanFile(f, t); return [r.operational.length, r.archival.length, r.badMarks.length]; };
  it('a reason excuses a constant on that line only', () => {
    expect(run(`const p = 'synthflow'; // ${WHY}`)).toEqual([0, 1, 0]);
    expect(run(`const p = 'synthflow'; /* ${WHY} */`)).toEqual([0, 1, 0]);
    expect(run(`const p = row.synthflow_call_id; // ${WHY}`)).toEqual([0, 1, 0]);
    expect(run(`const p = 'synthflow'; // ${WHY}\nconst q = 'synthflow';`)).toEqual([1, 1, 0]);
    expect(run(`// ${WHY}\nconst q = 'synthflow';`)).toEqual([1, 0, 0]);
  });
  it.each([
    ['no reason', "const p = 'synthflow'; // synthflow-archival:"],
    ['hardly a reason', "const p = 'synthflow'; // synthflow-archival: ok"],
    ['a host', `const h = 'https://api.synthflow.ai'; // ${WHY}`],
    ['a host spelled with an escape', `const h = '\\x73ynthflow.ai'; // ${WHY}`],
    ['a key', `const k = process.env.SYNTHFLOW_API_KEY; // ${WHY}`],
    ['a call', `triggerSynthflowCall(x); // ${WHY}`],
    ['a method call', `b.synthflowService.startCall(p); // ${WHY}`],
    ['an argument', `dial('synthflow'); // ${WHY}`],
    ['a constructor', `const c = new SynthflowClient(); // ${WHY}`],
    ['an import', `import './synthflowService'; // ${WHY}`],
    ['a require', `const s = require('./synthflowService'); // ${WHY}`],
  ])('%s is not excused, and is reported', (_n, t) => { const [op, arch, bad] = run(t); expect([op > 0, arch, bad > 0]).toEqual([true, 0, true]); });
  it.each([`const p = '${WHY}';`, `const p = 'synthflow // ${WHY}';`, `const p = \`synthflow // ${WHY}\`;`, `const p = 'https://x/${WHY}';`])('a mark inside a string is not a mark: %s', (t) => expect(run(t)).toEqual([1, 0, 0]));
  it('a config line cannot be excused', () => expect(run(`c: synthflow # ${WHY}`, 'a.yml')).toEqual([1, 0, 1]));
});

describe('the verdict', () => {
  it('a planted reference anywhere fails it; none passes it', () => {
    const clean = [{ path: 'backend/src/a.ts', text: 'const a = 1; // synthflow' }];
    expect(scanAll(clean).clean).toBe(true);
    expect(scanAll([...clean, { path: 'frontend/src/B.tsx', text: 'export const b = synthflowThing;' }])).toMatchObject({ clean: false, byKind: { identifier: 1 } });
    expect(scanAll([{ path: 'backend\\src\\w.ts', text: "'synthflow'" }]).clean).toBe(false);
    expect(scanAll([{ path: 'backend/src/services/voice/migration/dispatch.ts', text: "fetch('https://api.synthflow.ai/v2/calls',{method:'POST'})" }])).toMatchObject({ clean: false, tooling: [] });
    for (const t of ["const a='\\x73\\x79\\x6e\\x74\\x68\\x66\\x6c\\x6f\\x77'", "const a='s'+'y'+'n'+'t'+'h'+'f'+'l'+'o'+'w'", "const a='syn'+'thf'+'low'"]) expect(scanAll([{ path: 'a.ts', text: t }]).clean).toBe(false);
  });
  it('a migration tool is counted apart, marks or not, and still blocks', () => {
    const r = scanAll([{ path: 'backend/src/services/voice/migration/historyExport.ts', text: `const p = 'synthflow'; // ${WHY}` }]);
    expect(r).toMatchObject({ clean: false, operational: [], archival: [] });
    expect(r.tooling).toHaveLength(1);
  });
  it('every tool on the list exists', () => { for (const f of TOOLING) expect(fs.existsSync(path.resolve(__dirname, '../../../../../..', f))).toBe(true); });
  it('scanning nothing is not clean', () => {
    expect(scanAll([]).clean).toBe(false);
    expect(scanAll([{ path: 'docs/a.md', text: 'x' }]).clean).toBe(false);
  });
  it('lists the worst files first', () => expect(byFile([{ file: 'b', line: 1, kind: 'env' }, { file: 'a', line: 1, kind: 'env' }, { file: 'a', line: 2, kind: 'env' }])).toEqual([['a', 2], ['b', 1]]));
});
