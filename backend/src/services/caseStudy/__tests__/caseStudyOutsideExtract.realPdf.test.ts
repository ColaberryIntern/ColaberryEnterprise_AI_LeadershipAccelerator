/**
 * extractOutsideText against the REAL pdf-parse and the REAL AgTech fixture from Ali's design package.
 *
 * Runs in a child Node process for the same reason as renderProposalPdf.realPdfParse.test.ts: pdf-parse@2 loads its
 * engine through a dynamic import that jest's VM refuses without --experimental-vm-modules. The child transpiles
 * the real source file to CommonJS, as the production build does, so a mocked-only suite cannot pass while the real
 * parser fails.
 */
import { spawnSync } from 'child_process';
import path from 'path';

const CHILD = `
const fs = require('fs');
const ts = require('typescript');
require.extensions['.ts'] = (mod, file) => mod._compile(ts.transpileModule(fs.readFileSync(file, 'utf8'), {
  compilerOptions: { module: 'commonjs', target: 'es2022', esModuleInterop: true },
}).outputText, file);
const { extractOutsideText } = require(process.argv[1]);
(async () => {
  const pdf = await extractOutsideText(fs.readFileSync(process.argv[2]), 'AgTech.pdf', 'application/pdf');
  const junk = await extractOutsideText(Buffer.from('this is not a pdf'), 'junk.pdf', 'application/pdf');
  process.stdout.write('RESULT' + JSON.stringify({
    ok: pdf.ok, chars: pdf.text.length, hasTitle: pdf.text.includes('Econometric Pricing Model'),
    hasXgb: pdf.text.includes('XGBoost'), junk: junk.errorClass,
  }));
  process.exit(0);
})();
`;

describe('extractOutsideText with the real pdf-parse and the AgTech fixture', () => {
  it('reads the fixture text and types a non-PDF as ParseFailed', () => {
    const source = path.join(__dirname, '..', 'caseStudyOutsideExtract.ts');
    const fixture = path.join(__dirname, 'fixtures', 'outside-case-studies', 'AgTech_-_Advanced_Econometric_Pricing_Model.pdf');
    const run = spawnSync(process.execPath, ['-e', CHILD, source, fixture], {
      cwd: path.join(__dirname, '..', '..', '..', '..', '..'), encoding: 'utf8', timeout: 90_000,
    });
    const marker = run.stdout.indexOf('RESULT');
    if (marker < 0) throw new Error(`child produced no result. status=${run.status} stderr=${run.stderr}`);
    const r = JSON.parse(run.stdout.slice(marker + 'RESULT'.length));
    expect(r).toMatchObject({ ok: true, hasTitle: true, hasXgb: true, junk: 'ParseFailed' });
    expect(r.chars).toBeGreaterThan(5000);
  }, 120_000);
});
