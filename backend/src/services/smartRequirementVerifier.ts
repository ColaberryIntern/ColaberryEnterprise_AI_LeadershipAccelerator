/**
 * Smart Requirement Verifier
 *
 * Uses LLM to cross-reference unmatched requirements against the actual
 * repo file tree. The keyword matcher can't connect "rate limiting" to
 * "rateLimiter.ts" — the LLM can.
 *
 * Called during resync AFTER keyword matching, to catch what keywords missed.
 */
import OpenAI from 'openai';

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

export interface VerificationResult {
  verified: Array<{ id: string; requirement_key: string; matched_files: string[]; reason: string }>;
  still_unmatched: string[];
  llm_called: boolean;
}

/**
 * Ask the LLM which unmatched requirements are already covered by existing files.
 * Returns the IDs of requirements that should be marked as verified.
 */
export async function verifyUnmatchedWithLLM(
  unmatchedReqs: UnmatchedReq[],
  repoFiles: string[],
  processName: string,
): Promise<VerificationResult> {
  if (!process.env.OPENAI_API_KEY || unmatchedReqs.length === 0) {
    return { verified: [], still_unmatched: unmatchedReqs.map(r => r.requirement_key), llm_called: false };
  }

  // Filter repo files to implementation files only (not configs, migrations, etc.)
  const implFiles = repoFiles.filter(f => {
    const name = (f.split('/').pop() || '').toLowerCase();
    if (name.startsWith('.') || /^\d{14}/.test(name)) return false;
    if (f.includes('migrations/') || f.includes('node_modules/') || f.includes('scripts/')) return false;
    return /\.(ts|tsx|js|jsx)$/.test(name);
  });

  // Limit to avoid token overflow
  const reqList = unmatchedReqs.slice(0, 30).map(r =>
    `${r.requirement_key}: ${(r.requirement_text || '').substring(0, 100)}`
  ).join('\n');

  const fileList = implFiles.slice(0, 200).join('\n');

  try {
    const response = await getOpenAI().chat.completions.create({
      model: 'gpt-4o-mini',
      temperature: 0,  // fully deterministic
      max_tokens: 2000,
      response_format: { type: 'json_object' },
      messages: [{
        role: 'system',
        content: 'You verify which software requirements are already implemented by checking against a repository file list. Respond with valid JSON only. Be conservative — only mark as covered if you are confident the file implements the requirement.',
      }, {
        role: 'user',
        content: `Business process: "${processName}"

UNMATCHED REQUIREMENTS (marked as not yet implemented):
${reqList}

REPOSITORY FILES (what already exists in the codebase):
${fileList}

For each requirement, determine if it is ALREADY COVERED by existing files.
Examples of matches:
- "rate limiting" → rateLimiter.ts
- "user authentication" → auth.ts, authorize.ts
- "webhook handling" → mandrillWebhook.ts
- "payment processing" → stripeService.ts
- "visitor analytics" → visitorAnalyticsRoutes.ts

Respond:
{"covered": [{"key": "REQ-001", "files": ["path/to/file.ts"], "reason": "brief explanation"}], "not_covered": ["REQ-002", "REQ-003"]}`,
      }],
    });

    const parsed = JSON.parse(response.choices[0]?.message?.content || '{}');
    const covered = (parsed.covered || []) as Array<{ key: string; files: string[]; reason: string }>;
    const notCovered = (parsed.not_covered || []) as string[];

    // Map back to requirement IDs
    const verified = covered.map(c => {
      const req = unmatchedReqs.find(r => r.requirement_key === c.key);
      return req ? { id: req.id, requirement_key: c.key, matched_files: c.files || [], reason: c.reason || '' } : null;
    }).filter(Boolean) as VerificationResult['verified'];

    console.log(`[SmartVerifier] ${processName}: ${verified.length}/${unmatchedReqs.length} verified by LLM, ${notCovered.length} still unmatched`);

    return { verified, still_unmatched: notCovered, llm_called: true };
  } catch (err) {
    console.error('[SmartVerifier] LLM call failed:', (err as Error).message);
    return { verified: [], still_unmatched: unmatchedReqs.map(r => r.requirement_key), llm_called: false };
  }
}
