/**
 * classify - PURE. What kind of artifact this is, from its path and filename only:
 *
 *   studio_artifact   built elsewhere and linked (a claude.ai Claude Studio)
 *   test_or_scratch   a file that exists to test the upload path, not to show work
 *                     ("write-access-test.txt", "test.pdf", "scratch.md", "untitled.docx")
 *   training_upload   a curriculum deliverable: artifacts/week-NN/... in their repo, or a portal upload
 *   project_artifact  a file in their repo outside the curriculum folders (docs/, src/, ...)
 *
 * test_or_scratch must not inflate the headline count: `artifacts_real_count` excludes it.
 * The test is narrow on purpose: "test-plan.pdf" or "unit-test-results.csv" are real work.
 */
import type { ArtifactClassification } from './types';

const SCRATCH = [
  /(^|[-_. ])(write[-_ ]?access|access|upload|smoke|connection|permission|push)[-_ ]?test([-_. ]|$)/i,
  /^test([-_ ]?(file|upload|doc|artifact|\d+))?\.[a-z0-9]+$/i,
  /(^|[-_. ])(scratch|tmp|temp|dummy|untitled|asdf|qwerty|lorem[-_ ]?ipsum|hello[-_ ]?world|foo|bar)([-_. ]|$)/i,
];
const CURRICULUM = /^artifacts\/week-\d+\//i;

const basename = (p: string): string => p.split(/[\\/]/).pop() ?? p;

export function classifyArtifact(a: { kind: string; source: 'repo' | 'upload' | 'link' | 'recording'; repoPath: string | null; uploadName: string | null; title: string }): ArtifactClassification {
  if (a.source === 'link' || a.kind === 'claude_studio') return 'studio_artifact';
  // A recorded demo of their own project is project evidence, never a test file.
  if (a.source === 'recording') return 'project_artifact';
  const name = basename(a.repoPath || a.uploadName || a.title || '');
  if (SCRATCH.some((re) => re.test(name))) return 'test_or_scratch';
  if (a.repoPath && !CURRICULUM.test(a.repoPath)) return 'project_artifact';
  return 'training_upload';
}
