/**
 * Content-Aware Requirement Verifier
 *
 * Goes beyond filename matching: fetches the first ~80 lines of candidate
 * source files from GitHub and asks the LLM whether specific requirements
 * are implemented in the actual code. Deterministic (temperature=0) and
 * cached by (capability_id, repo_commit_sha).
 *
 * Called AFTER the path-only smartRequirementVerifier, as a second pass
 * on requirements that are still unmatched.
 */
import OpenAI from 'openai';
import { readFileFromRepo } from './githubService';

let _openai: OpenAI | null = null;
function getOpenAI(): OpenAI {
  if (!_openai) _openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  return _openai;
}

interface UnmatchedReq {
  id: string;
  requirement_key: string;
  requirement_text: string;
}

export interface ContentVerificationResult {
  verified: Array<{ id: string; requirement_key: string; matched_files: string[]; reason: string }>;
  still_unmatched: string[];
  files_read: number;
  llm_called: boolean;
}

/**
 * Select the most relevant files for a BP by scoring filenames against
 * the BP name + requirement keywords. Returns top N paths.
 */
function selectCandidateFiles(
  bpName: string,
  requirements: UnmatchedReq[],
  allImplFiles: string[],
  maxFiles: number = 15,
): string[] {
  const keywords = new Set<string>();
  const text = [bpName, ...requirements.map(r => r.requirement_text)].join(' ').toLowerCase();
  for (const w of text.split(/\W+/)) {
    if (w.length > 3) keywords.add(w);
  }

  const scored = allImplFiles.map(f => {
    const fLower = f.toLowerCase();
    let score = 0;
    for (const kw of keywords) {
      if (fLower.includes(kw)) score++;
    }
    return { path: f, score };
  });

  scored.sort((a, b) => b.score - a.score);
  return scored.filter(s => s.score > 0).slice(0, maxFiles).map(s => s.path);
}

const MAX_LINES_PER_FILE = 80;

export async function verifyWithFileContent(
  enrollmentId: string,
  unmatchedReqs: UnmatchedReq[],
  allImplFiles: string[],
  bpName: string,
): Promise<ContentVerificationResult> {
  if (!process.env.OPENAI_API_KEY || unmatchedReqs.length === 0) {
    return { verified: [], still_unmatched: unmatchedReqs.map(r => r.requirement_key), files_read: 0, llm_called: false };
  }

  const candidateFiles = selectCandidateFiles(bpName, unmatchedReqs, allImplFiles);
  if (candidateFiles.length === 0) {
    return { verified: [], still_unmatched: unmatchedReqs.map(r => r.requirement_key), files_read: 0, llm_called: false };
  }

  // Fetch file contents (first N lines each) from GitHub
  const fileContents: Array<{ path: string; content: string }> = [];
  for (const fp of candidateFiles) {
    try {
      const raw = await readFileFromRepo(enrollmentId, fp);
      if (raw) {
        const truncated = raw.split('\n').slice(0, MAX_LINES_PER_FILE).join('\n');
        fileContents.push({ path: fp, content: truncated });
      }
    } catch {}
  }

  if (fileContents.length === 0) {
    return { verified: [], still_unmatched: unmatchedReqs.map(r => r.requirement_key), files_read: 0, llm_called: false };
  }

  const reqList = unmatchedReqs.slice(0, 25).map(r =>
    `${r.requirement_key}: ${(r.requirement_text || '').substring(0, 120)}`
  ).join('\n');

  const codeSection = fileContents.map(f =>
    `--- ${f.path} ---\n${f.content}`
  ).join('\n\n');

  try {
    const response = await getOpenAI().chat.completions.create({
      model: 'gpt-4o-mini',
      temperature: 0,
      max_tokens: 2000,
      response_format: { type: 'json_object' },
      messages: [{
        role: 'system',
        content: 'You verify which software requirements are already implemented by reading actual source code. Respond with valid JSON only. Be thorough — if the code handles what the requirement describes (even partially or under a different name), mark it as covered. Look for the BEHAVIOR described, not exact naming matches.',
      }, {
        role: 'user',
        content: `Business process: "${bpName}"

REQUIREMENTS marked as NOT YET IMPLEMENTED:
${reqList}

ACTUAL SOURCE CODE from the repository (first ${MAX_LINES_PER_FILE} lines of each file):
${codeSection}

For each requirement, determine if the code ALREADY IMPLEMENTS it.
Look for:
- Error handling patterns (try/catch, status codes, validation)
- Business logic that matches the requirement's intent
- API endpoints that serve the described functionality
- Database queries or models that store the described data

Respond:
{"covered": [{"key": "REQ-001", "files": ["path/to/file.ts"], "reason": "brief explanation of how the code implements this"}], "not_covered": ["REQ-002"]}`,
      }],
    });

    const parsed = JSON.parse(response.choices[0]?.message?.content || '{}');
    const covered = (parsed.covered || []) as Array<{ key: string; files: string[]; reason: string }>;
    const notCovered = (parsed.not_covered || []) as string[];

    const verified = covered.map(c => {
      const req = unmatchedReqs.find(r => r.requirement_key === c.key);
      return req ? { id: req.id, requirement_key: c.key, matched_files: c.files || [], reason: c.reason || '' } : null;
    }).filter(Boolean) as ContentVerificationResult['verified'];

    console.log(`[ContentVerifier] ${bpName}: read ${fileContents.length} files, ${verified.length}/${unmatchedReqs.length} verified, ${notCovered.length} still unmatched`);

    return { verified, still_unmatched: notCovered, files_read: fileContents.length, llm_called: true };
  } catch (err) {
    console.error('[ContentVerifier] LLM call failed:', (err as Error).message);
    return { verified: [], still_unmatched: unmatchedReqs.map(r => r.requirement_key), files_read: fileContents.length, llm_called: false };
  }
}
