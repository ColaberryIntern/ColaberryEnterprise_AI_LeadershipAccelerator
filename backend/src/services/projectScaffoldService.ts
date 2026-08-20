/**
 * Project Scaffold Initialization Service
 *
 * Generates initial project structure and pushes to the participant's
 * GitHub repository after the system design contract is locked.
 */
import { getProjectByEnrollment } from './projectService';
import { getConnection, readFileFromRepo, writeMultipleFilesToRepo } from './githubService';
import { generateClaudeMd, generateProjectState } from './claudeMdService';
import { getRequirementsStatus } from './requirementsMatchingService';
import { spliceManagedBlock } from './sbp/managedBlock';
import { isWritableConnection, writeAccessOf } from './sbp/repoConnect/connectionAccess';
import { legacyWriteMode, LegacyWriteRefused } from './legacyWritePolicy';

interface ScaffoldFile {
  path: string;
  content: string;
}

interface ScaffoldResult {
  filesGenerated: number;
  filesWritten: number;
  files: string[];
  errors: string[];
}

// ---------------------------------------------------------------------------
// 1. Generate scaffold file manifest
// ---------------------------------------------------------------------------

async function generateScaffoldFiles(enrollmentId: string): Promise<ScaffoldFile[]> {
  const project = await getProjectByEnrollment(enrollmentId);
  if (!project) throw new Error('No project found');

  const files: ScaffoldFile[] = [];

  // 1. CLAUDE.md — from claudeMdService
  const claudeMd = await generateClaudeMd(enrollmentId);
  files.push({ path: 'CLAUDE.md', content: claudeMd });

  // 2. PROJECT_STATE.json
  const projectState = await generateProjectState(enrollmentId);
  files.push({ path: 'PROJECT_STATE.json', content: projectState });

  // 3. README.md
  const readme = generateReadme(project);
  files.push({ path: 'README.md', content: readme });

  // 4. requirements/master.md — from compiled requirements
  const reqContent = await generateRequirementsMd(project.id);
  if (reqContent) {
    files.push({ path: 'requirements/master.md', content: reqContent });
  }

  // 5. .gitignore
  files.push({ path: '.gitignore', content: generateGitignore() });

  /**
   * REMOVED: `.gitkeep` stubs for `src/`, `tests/`, `docs/` and any folder named
   * in the architecture contract.
   *
   * Judged VESTIGIAL rather than guarded, on three pieces of evidence:
   *   - It has never once run. A read of all 14 connected student repositories
   *     on 2026-08-19 found zero `PROJECT_STATE.json` and zero
   *     `requirements/master.md` — this whole writer has never completed against
   *     a real repo, so nothing depends on the stubs existing.
   *   - Empty folders are not a deliverable. Git does not track directories, so
   *     these commits added `.gitkeep` files and no content, scattered across a
   *     tree the student owns.
   *   - The folder names came from `getContractFolders`, which reads
   *     `comp.folder` out of LLM-authored contract JSON and interpolated it
   *     straight into a write path. A contract naming `../../.github/workflows`
   *     would have written outside the intended tree entirely. Deleting the
   *     feature removes that reachability; an allowlist would only have bounded it.
   *
   * `getContractFolders` is deleted with it — it had no other caller.
   */

  return files;
}

// ---------------------------------------------------------------------------
// 2. Push scaffold to repo
// ---------------------------------------------------------------------------

/**
 * Render the scaffold and commit it, under the legacy write policy.
 *
 * This used to full-replace every file it generated, using the STUDENT'S OWN
 * OAuth token, with no allowlist and no access check. Three separate ways to
 * destroy work, all now closed:
 *
 *  1. **Access is checked before anything leaves the process.** The old check was
 *     `access_token_encrypted` being non-empty, which asks whether we have *a
 *     credential*, not whether that credential may *write here*. On a pull-only
 *     repo it queued a PUT per file and swallowed each 403 inside
 *     `writeMultipleFilesToRepo`, reporting a partial success that had written
 *     nothing. `isWritableConnection` is the shared predicate — the same one the
 *     SBP publisher asks — so this path inherits its hardening.
 *
 *  2. **Every path is checked against the policy, before the network.** Throwing
 *     rather than filtering is deliberate and matches `sbp/repoWriter`: a path
 *     outside the list is a bug in our scaffold, not noise to skip quietly.
 *
 *  3. **No file a student may have authored is replaced.** `CLAUDE.md` is
 *     spliced; `README.md` and `.gitignore` are seed-once, written only when the
 *     repo does not already have them. A student's README is prose we did not
 *     write and must not overwrite on a re-run — and this function is reachable
 *     more than once, so "initialize" was never a guarantee of running once.
 */
export async function generateAndPushScaffold(enrollmentId: string): Promise<ScaffoldResult> {
  const connection = await getConnection(enrollmentId);
  if (!connection) throw new Error('No GitHub repository connected');

  if (!isWritableConnection(connection)) {
    throw new LegacyWriteRefused(
      'NoWriteAccess',
      `Refusing to scaffold — the platform has no push access on this repo (${writeAccessOf(connection) ?? 'never recorded'}).`,
    );
  }

  const files = await generateScaffoldFiles(enrollmentId);

  // Allowlist BEFORE any I/O, so a bad path cannot reach GitHub even once.
  for (const f of files) {
    if (legacyWriteMode(f.path) === null) {
      throw new LegacyWriteRefused(
        'AllowlistViolation',
        `refusing to write "${f.path}" — outside the legacy scaffold write policy`,
      );
    }
  }

  const result: ScaffoldResult = {
    filesGenerated: files.length,
    filesWritten: 0,
    files: files.map(f => f.path),
    errors: [],
  };

  // Apply each path's mode. Reads are per-file and only for the modes that need
  // one, so a pure `platform_owned` set still costs no extra calls.
  const toWrite: ScaffoldFile[] = [];
  for (const f of files) {
    const mode = legacyWriteMode(f.path);

    if (mode === 'managed_block') {
      const existing = await readFileFromRepo(enrollmentId, f.path);
      toWrite.push({ ...f, content: spliceManagedBlock(existing, f.content) });
      continue;
    }

    if (mode === 'seed_once') {
      const existing = await readFileFromRepo(enrollmentId, f.path);
      if (existing !== null && existing.trim() !== '') {
        // DROPPED, not rewritten. Writing their own bytes back would still be a
        // commit that changed nothing.
        result.errors.push(`${f.path} left as the student wrote it (seed-once)`);
        continue;
      }
      toWrite.push(f);
      continue;
    }

    toWrite.push(f);
  }

  result.files = toWrite.map(f => f.path);

  const { filesWritten } = await writeMultipleFilesToRepo(
    enrollmentId,
    toWrite,
    'Initialize project scaffold'
  );
  result.filesWritten = filesWritten;

  if (filesWritten < toWrite.length) {
    result.errors.push(`${toWrite.length - filesWritten} file(s) failed to write`);
  }

  return result;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function generateReadme(project: any): string {
  const lines = [
    `# ${project.organization_name || 'AI Project'}`,
    '',
    project.primary_business_problem
      ? `> ${project.primary_business_problem}`
      : '',
    '',
    '## Overview',
    '',
    `This project was initialized from the Colaberry Enterprise AI Leadership Accelerator.`,
    '',
    project.selected_use_case ? `**Use Case:** ${project.selected_use_case}` : '',
    project.automation_goal ? `**Goal:** ${project.automation_goal}` : '',
    '',
    '## Getting Started',
    '',
    '1. Read `CLAUDE.md` for full project context',
    '2. Review `requirements/master.md` for detailed requirements',
    '3. Check `PROJECT_STATE.json` for current progress',
    '',
    '## Project Structure',
    '',
    '```',
    '├── CLAUDE.md              # AI context file (auto-generated)',
    '├── PROJECT_STATE.json     # Machine-readable state',
    '├── requirements/',
    '│   └── master.md          # System requirements',
    '├── src/                   # Application source code',
    '├── tests/                 # Test files',
    '└── docs/                  # Documentation',
    '```',
    '',
    '---',
    '*Generated by Colaberry Enterprise AI Leadership Accelerator*',
  ].filter(Boolean);

  return lines.join('\n');
}

async function generateRequirementsMd(projectId: string): Promise<string | null> {
  try {
    const reqStatus = await getRequirementsStatus(projectId);
    if (!reqStatus.requirements || reqStatus.requirements.length === 0) return null;

    const lines = [
      '# System Requirements',
      '',
      `Total: ${reqStatus.requirements.length} requirements`,
      '',
    ];

    for (const req of reqStatus.requirements) {
      const status = req.status === 'verified' || req.status === 'matched'
        ? '✅' : req.status === 'partial' ? '🔄' : '⬜';
      lines.push(`${status} **${req.requirement_key}**: ${req.requirement_text}`);
      if (req.github_file_paths?.length) {
        lines.push(`  - Files: ${req.github_file_paths.join(', ')}`);
      }
      lines.push('');
    }

    return lines.join('\n');
  } catch {
    return null;
  }
}

function generateGitignore(): string {
  return [
    'node_modules/',
    '.env',
    '.env.local',
    'dist/',
    'build/',
    '*.log',
    '.DS_Store',
    '__pycache__/',
    '*.pyc',
    '.venv/',
    'venv/',
  ].join('\n');
}
