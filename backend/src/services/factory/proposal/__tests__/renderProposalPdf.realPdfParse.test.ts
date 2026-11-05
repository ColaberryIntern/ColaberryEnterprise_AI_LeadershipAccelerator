/**
 * countPdfPages against the REAL pdf-parse. The mocked suite once faked a v1 default export that pdf-parse@2 does not
 * have, so it passed while every real render failed with `count_failed`. This suite cannot pass unless the installed
 * library actually reads the page count from real PDF bytes.
 *
 * It runs in a child Node process because pdf-parse's engine loads through a dynamic import, which jest's VM refuses
 * without --experimental-vm-modules. The child transpiles the real source file to CommonJS, as the production build does.
 */
import { spawnSync } from 'child_process';
import path from 'path';

/** A minimal, valid PDF with `pages` blank pages and a correct cross-reference table. */
function buildPdf(pages: number): Buffer {
  const pageIds = Array.from({ length: pages }, (_, i) => i + 3);
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    `<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(' ')}] /Count ${pages} >>`,
    ...pageIds.map(() => '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] >>'),
  ];
  let body = '%PDF-1.4\n';
  const offsets = objects.map((object, i) => {
    const offset = body.length;
    body += `${i + 1} 0 obj\n${object}\nendobj\n`;
    return offset;
  });
  const xrefAt = body.length;
  const entries = offsets.map((offset) => `${String(offset).padStart(10, '0')} 00000 n \n`).join('');
  body += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${entries}`;
  body += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefAt}\n%%EOF\n`;
  return Buffer.from(body, 'latin1');
}

const CHILD = `
const fs = require('fs');
const ts = require('typescript');
require.extensions['.ts'] = (mod, file) => mod._compile(ts.transpileModule(fs.readFileSync(file, 'utf8'), {
  compilerOptions: { module: 'commonjs', target: 'es2022', esModuleInterop: true },
}).outputText, file);
const { countPdfPages } = require(process.argv[1]);
(async () => {
  const results = [];
  for (const encoded of process.argv.slice(2)) {
    const buffer = Buffer.from(encoded, 'base64');
    try {
      results.push({ pages: await countPdfPages(buffer), intact: buffer.toString('base64') === encoded });
    } catch (err) {
      results.push({ error: err.reason });
    }
  }
  process.stdout.write('RESULT' + JSON.stringify(results));
  process.exit(0);
})();
`;

describe('countPdfPages with the real pdf-parse', () => {
  it('reads real page counts, leaves the bytes intact, and types a non-PDF as count_failed', () => {
    const inputs = [buildPdf(1), buildPdf(3), Buffer.from('this is not a pdf')].map((b) => b.toString('base64'));
    const source = path.join(__dirname, '..', 'renderProposalPdf.ts');
    const run = spawnSync(
      process.execPath,
      ['-e', CHILD, source, ...inputs],
      { cwd: path.join(__dirname, '..', '..', '..', '..', '..'), encoding: 'utf8', timeout: 90_000 },
    );
    const marker = run.stdout.indexOf('RESULT');
    if (marker < 0) throw new Error(`child produced no result. status=${run.status} stderr=${run.stderr}`);
    expect(JSON.parse(run.stdout.slice(marker + 'RESULT'.length))).toEqual([
      { pages: 1, intact: true },
      { pages: 3, intact: true },
      { error: 'count_failed' },
    ]);
  }, 120_000);
});
