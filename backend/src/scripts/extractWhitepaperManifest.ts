/**
 * SV0.2 (Services Upgrade, Basecamp todo 10506775194): turn the 39 source whitepapers into
 * `docs/services/whitepaper_manifest.json`, the cited evidence every later Services ticket builds on.
 *
 * The PDFs are NOT in the repo: the canonical copies live in Basecamp (Ali Personal > Docs & Files > Services
 * Upgrade > 01 - Source whitepapers). Each record carries the file's sha256 and Basecamp upload id instead.
 *
 * Deterministic: pdftotext + a heading map + a fixed capability vocabulary; no LLM, no network. Two runs over the
 * same PDFs produce byte-identical output.
 *
 * Gates (exit 1, nothing written): CLIENT_NAMES_FILE missing; a confidential client name in any manifest field;
 * an outcome number that is not verbatim in its source; a record failing the Zod schema.
 * Full-text client-name hits (e.g. inside a testimonial) are reported to REPORT_DIR only, never to the repo.
 *
 * Run (local, needs poppler `pdftotext` on PATH):
 *   CLIENT_NAMES_FILE=<untracked> REPORT_DIR=<outside repo> UPLOAD_MAP=<json {file: uploadId}> \
 *   npx ts-node --transpile-only src/scripts/extractWhitepaperManifest.ts <pdfDir> <outFile>
 */
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { execFileSync } from 'child_process';
import { parseWhitepaper } from '../services/servicesUpgrade/whitepaperParser';
import { verifyOutcomesVerbatim } from '../services/servicesUpgrade/outcomeCheck';
import { assertNoClientNames, findClientNameHits, loadClientNames } from '../services/servicesUpgrade/clientNameGate';
import { Manifest, type ManifestRecord } from '../services/servicesUpgrade/schemas';

function pdfText(file: string): string {
  // execFile with args (no shell): filenames contain spaces and parentheses.
  return execFileSync('pdftotext', ['-layout', '-enc', 'UTF-8', file, '-'], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, timeout: 60000 });
}

export function buildManifest(pdfDir: string, names: string[], uploadMap: Record<string, number>): { manifest: Manifest; fullTextHits: Record<string, string[]> } {
  const files = fs.readdirSync(pdfDir).filter((f) => /\.pdf$/i.test(f) && !/^Copy of /i.test(f)).sort();
  const records: ManifestRecord[] = [];
  const fullTextHits: Record<string, string[]> = {};
  for (const f of files) {
    const abs = path.join(pdfDir, f);
    const raw = pdfText(abs);
    const p = parseWhitepaper(raw, f);
    const missing = verifyOutcomesVerbatim(p.outcomes, raw);
    if (missing.length) throw new Error(`${f}: outcome numbers not verbatim in source: ${missing.join(', ')}`);
    const hits = findClientNameHits(`${f}\n${raw}`, names);
    if (hits.length) fullTextHits[f] = hits;
    const rec: ManifestRecord = {
      sourceFile: f,
      sha256: crypto.createHash('sha256').update(fs.readFileSync(abs)).digest('hex'),
      basecampUploadId: uploadMap[f] ?? null,
      title: p.title, industry: p.industry, clientDescriptor: p.clientDescriptor, problem: p.problem, solution: p.solution,
      capabilities: p.capabilities, techStack: p.techStack, outcomes: p.outcomes, pageCount: p.pageCount, gaps: p.gaps,
      extractedBy: 'deterministic',
    };
    assertNoClientNames({
      sourceFile: rec.sourceFile, title: rec.title, clientDescriptor: rec.clientDescriptor, problem: rec.problem, solution: rec.solution,
      techStack: rec.techStack.join(' | '), outcomes: rec.outcomes.map((o) => o.text).join(' | '),
    }, names);
    records.push(rec);
  }
  const manifest = Manifest.parse({ kind: 'whitepaper_manifest', version: 1, recordCount: records.length, records });
  return { manifest, fullTextHits };
}

function main(): void {
  const [pdfDir, outFile] = process.argv.slice(2);
  if (!pdfDir || !outFile) throw new Error('usage: extractWhitepaperManifest.ts <pdfDir> <outFile>');
  const names = loadClientNames(process.env.CLIENT_NAMES_FILE);
  const reportDir = process.env.REPORT_DIR;
  if (!reportDir) throw new Error('REPORT_DIR is required (outside the repo) for the full-text hit report');
  const uploadMap: Record<string, number> = process.env.UPLOAD_MAP ? JSON.parse(fs.readFileSync(process.env.UPLOAD_MAP, 'utf8')) : {};
  const { manifest, fullTextHits } = buildManifest(pdfDir, names, uploadMap);
  fs.mkdirSync(path.dirname(outFile), { recursive: true });
  fs.writeFileSync(outFile, JSON.stringify(manifest, null, 2) + '\n');
  fs.mkdirSync(reportDir, { recursive: true });
  fs.writeFileSync(path.join(reportDir, 'client_name_fulltext_hits.json'), JSON.stringify(fullTextHits, null, 2));
  console.log(JSON.stringify({ event: 'svc_manifest_written', outcome: 'success', records: manifest.recordCount, fullTextHitFiles: Object.keys(fullTextHits).length }));
}

if (require.main === module) {
  try { main(); } catch (e) {
    console.error(JSON.stringify({ event: 'svc_manifest_failed', outcome: 'failure', error_class: (e as Error)?.constructor?.name ?? 'Error', message: (e as Error)?.message }));
    process.exitCode = 1;
  }
}
