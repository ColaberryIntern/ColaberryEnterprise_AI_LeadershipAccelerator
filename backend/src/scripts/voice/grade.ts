/**
 * voice:grade (VS2.5): grade a live-test evidence manifest.
 *
 *   node dist/scripts/voice/grade.js <manifest.json>
 *
 * Writes <manifest>.grade.json and <manifest>.grade.md beside it. Exit 0 = PASS (90+ and no failed
 * critical gate); 1 = FAIL (including an empty or missing manifest, which lists every missing artifact).
 */
import fs from 'fs';
import { gradeManifest, gradeMarkdown, type GradeReport } from '../../services/voice/testlab/grade';

export function runGradeCli(path: string | undefined, read: (p: string) => string = (p) => fs.readFileSync(p, 'utf-8')): { code: number; report: GradeReport; md: string } {
  let manifest: unknown = {};
  if (path) {
    try {
      manifest = JSON.parse(read(path));
    } catch {
      manifest = { __unreadable: true }; // graded as an invalid manifest: fails with every artifact missing
    }
  }
  const report = gradeManifest(manifest);
  return { code: report.passed ? 0 : 1, report, md: gradeMarkdown(report) };
}

if (require.main === module) {
  const path = process.argv[2];
  const r = runGradeCli(path);
  if (path) {
    fs.writeFileSync(`${path}.grade.json`, JSON.stringify(r.report, null, 2));
    fs.writeFileSync(`${path}.grade.md`, r.md);
  }
  console.log(r.md);
  process.exit(r.code);
}
