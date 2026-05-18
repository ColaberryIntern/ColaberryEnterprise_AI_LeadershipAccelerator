import { Op } from 'sequelize';
import { readFileFromRepo } from '../githubService';
import VerificationLog from '../../models/VerificationLog';

export interface CodeExcerpt {
  path: string;
  content: string;
  total_lines: number;
  truncated: boolean;
  char_count: number;
}

export interface ReadOptions {
  maxFiles?: number;
  maxLinesPerFile?: number;
  maxTotalChars?: number;
}

const DEFAULT_MAX_FILES = 3;
const DEFAULT_MAX_LINES_PER_FILE = 200;
const DEFAULT_MAX_TOTAL_CHARS = 12_000;

// Per-project deep-verify cap per 24h. Bounds LLM spend even if a runaway
// loop kicks off thousands of re-verifications. ~150 covers a typical
// project's full unmatched-requirement backfill plus headroom for ongoing
// manifest-triggered verifications.
const DEFAULT_DAILY_BUDGET = 150;

export async function readCandidateFiles(
  enrollmentId: string,
  candidatePaths: string[],
  options: ReadOptions = {}
): Promise<CodeExcerpt[]> {
  const maxFiles = options.maxFiles ?? DEFAULT_MAX_FILES;
  const maxLinesPerFile = options.maxLinesPerFile ?? DEFAULT_MAX_LINES_PER_FILE;
  const maxTotalChars = options.maxTotalChars ?? DEFAULT_MAX_TOTAL_CHARS;

  const paths = candidatePaths.filter(Boolean).slice(0, maxFiles);
  if (paths.length === 0) return [];

  const fetched = await Promise.all(
    paths.map(async (path) => {
      const content = await readFileFromRepo(enrollmentId, path);
      return { path, content };
    })
  );

  const excerpts: CodeExcerpt[] = [];
  let totalChars = 0;

  for (const { path, content } of fetched) {
    if (!content) continue;

    const allLines = content.split('\n');
    const truncated = allLines.length > maxLinesPerFile;
    const kept = allLines.slice(0, maxLinesPerFile).join('\n');

    const remaining = maxTotalChars - totalChars;
    if (remaining <= 200) break;

    const finalContent = kept.length > remaining ? kept.slice(0, remaining) : kept;
    totalChars += finalContent.length;

    excerpts.push({
      path,
      content: finalContent,
      total_lines: allLines.length,
      truncated: truncated || finalContent.length < kept.length,
      char_count: finalContent.length,
    });
  }

  return excerpts;
}

/**
 * Format excerpts for inclusion in an LLM prompt. Returns a single string
 * with file markers + line counts so the model knows what it's looking at.
 */
export function formatExcerptsForPrompt(excerpts: CodeExcerpt[]): string {
  if (excerpts.length === 0) return '';

  return excerpts
    .map((ex) => {
      const header = ex.truncated
        ? `### ${ex.path} (first ${ex.content.split('\n').length} of ${ex.total_lines} lines)`
        : `### ${ex.path} (${ex.total_lines} lines)`;
      return `${header}\n\`\`\`\n${ex.content}\n\`\`\``;
    })
    .join('\n\n');
}

/**
 * Returns true when the project has room in its 24h deep-verification
 * budget. Counts VerificationLog rows where evidence.evidence_kind === 'code_sampled'
 * in the last 24 hours.
 */
export async function hasDeepVerifyBudget(
  projectId: string,
  dailyBudget: number = DEFAULT_DAILY_BUDGET
): Promise<{ allowed: boolean; used: number; budget: number }> {
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const used = await VerificationLog.count({
    where: {
      project_id: projectId,
      created_at: { [Op.gte]: since },
      // Filter for rows that performed deep verification via JSONB key match.
      // Sequelize's JSONB Op support is uneven across versions, so we use a
      // raw-ish where on the evidence column with a known shape.
      evidence: { evidence_kind: 'code_sampled' } as any,
    },
  });
  return { allowed: used < dailyBudget, used, budget: dailyBudget };
}

export const BUDGET_DEFAULTS = {
  DEFAULT_MAX_FILES,
  DEFAULT_MAX_LINES_PER_FILE,
  DEFAULT_MAX_TOTAL_CHARS,
  DEFAULT_DAILY_BUDGET,
};
