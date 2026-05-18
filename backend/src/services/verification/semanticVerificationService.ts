import { callLLMWithAudit } from '../llmCallWrapper';
import { CodeAnalysis } from './codeAnalysisService';
import { CodeExcerpt, formatExcerptsForPrompt } from './smartCodeReader';

export interface SemanticResult {
  semantic_status: 'semantic_not_aligned' | 'semantic_partial' | 'semantic_aligned' | 'unknown';
  semantic_confidence: number;
  semantic_reasoning: string;
  missing_elements: string[];
  evidence_kind: 'path_only' | 'code_sampled';
  files_read: string[];
}

const MODEL = 'gpt-4o-mini';

export async function verifySemantic(
  enrollmentId: string,
  requirementText: string,
  analysis: CodeAnalysis,
  codeExcerpts: CodeExcerpt[] = []
): Promise<SemanticResult> {
  const evidenceKind: 'path_only' | 'code_sampled' = codeExcerpts.length > 0 ? 'code_sampled' : 'path_only';

  try {
    const systemPrompt = buildSystemPrompt(evidenceKind);
    const userPrompt = buildUserPrompt(requirementText, analysis, codeExcerpts);

    const result = await callLLMWithAudit({
      lessonId: 'semantic-verification',
      enrollmentId,
      generationType: 'admin_structure',
      step: evidenceKind === 'code_sampled' ? 'deep_requirement_verification' : 'semantic_requirement_verification',
      systemPrompt,
      userPrompt,
      model: MODEL,
      temperature: 0.2,
      maxTokens: 600,
      responseFormat: { type: 'json_object' },
    });

    const parsed = parseResponse(result.content);

    console.log(
      `[SemanticVerification:${evidenceKind}] ${parsed.semantic_status} (confidence: ${parsed.semantic_confidence}) ${result.cacheHit ? '[cached]' : '[fresh]'}`
    );

    return {
      ...parsed,
      evidence_kind: evidenceKind,
      files_read: codeExcerpts.map((e) => e.path),
    };
  } catch (err: any) {
    console.error(`[SemanticVerification:${evidenceKind}] LLM error: ${err.message}`);
    return {
      semantic_status: 'unknown',
      semantic_confidence: 0,
      semantic_reasoning: `LLM unavailable: ${err.message}`,
      missing_elements: [],
      evidence_kind: evidenceKind,
      files_read: codeExcerpts.map((e) => e.path),
    };
  }
}

function buildSystemPrompt(evidenceKind: 'path_only' | 'code_sampled'): string {
  const base = `You are a senior software architect performing code verification.

Your task: determine whether a software requirement is implemented in a codebase based on the detected features${evidenceKind === 'code_sampled' ? ', file structure, and ACTUAL CODE EXCERPTS' : ' and file structure'}.

You MUST return ONLY valid JSON with this exact structure:
{
  "status": "not_aligned" | "partial" | "aligned",
  "confidence": <number 0-1>,
  "reasoning": "<clear explanation in 1-2 sentences>",
  "missing_elements": ["<element1>", "<element2>"]
}

Rules:
- "aligned" means the requirement is fully satisfied by the detected code
- "partial" means some aspects are implemented but gaps remain
- "not_aligned" means no meaningful implementation exists
- confidence should reflect how certain you are (0.9+ for clear matches, 0.5-0.7 for uncertain)
- missing_elements should list specific things that are not implemented (empty array if aligned)
- Be concise and precise in reasoning`;

  if (evidenceKind === 'code_sampled') {
    return `${base}

CRITICAL — recognize semantic equivalence:
- A requirement asking for "POST /api/auth/login" is SATISFIED by "POST /api/admin/login" if the latter does equivalent JWT issuance + credential verification. The literal path does not have to match — what matters is whether the requirement's intent is fulfilled.
- A requirement asking for "user roles CRUD" is SATISFIED by middleware-enforced role checks even if there is no dedicated roles table — the intent is access control, not a particular schema.
- A requirement asking for "ML algorithms" is SATISFIED by rule-based + LLM heuristics if they accomplish the same outcome at the project's scale.
- When code excerpts demonstrate equivalent functionality under a different name, mark "aligned" with high confidence and explain the equivalence in reasoning.
- Mark "not_aligned" only when no equivalent functionality exists anywhere in the sampled code or detected features.`;
  }

  return base;
}

function buildUserPrompt(
  requirementText: string,
  analysis: CodeAnalysis,
  codeExcerpts: CodeExcerpt[]
): string {
  const features = analysis.detected_features.length > 0
    ? analysis.detected_features.join(', ')
    : 'none detected';

  const signals = analysis.structural_signals.length > 0
    ? analysis.structural_signals.join(', ')
    : 'none detected';

  const fileSummary = analysis.file_map
    .slice(0, 15)
    .map((f) => `  ${f.path} [${f.detected_keywords.join(', ')}]`)
    .join('\n');

  const excerptSection = codeExcerpts.length > 0
    ? `\n\n## Sampled Code Excerpts\n${formatExcerptsForPrompt(codeExcerpts)}`
    : '';

  return `## Requirement
"${requirementText}"

## Detected Code Features
${features}

## Structural Signals
${signals}

## Relevant Files
${fileSummary || '  (no matching files detected)'}${excerptSection}

Evaluate whether this requirement is implemented based on the code evidence above.`;
}

function parseResponse(content: string): Omit<SemanticResult, 'evidence_kind' | 'files_read'> {
  try {
    const data = JSON.parse(content);

    const statusMap: Record<string, SemanticResult['semantic_status']> = {
      'not_aligned': 'semantic_not_aligned',
      'partial': 'semantic_partial',
      'aligned': 'semantic_aligned',
    };

    const semantic_status = statusMap[data.status] || 'unknown';
    const semantic_confidence = Math.max(0, Math.min(1, Number(data.confidence) || 0));
    const semantic_reasoning = String(data.reasoning || 'No reasoning provided');
    const missing_elements = Array.isArray(data.missing_elements)
      ? data.missing_elements.map(String).slice(0, 10)
      : [];

    return { semantic_status, semantic_confidence, semantic_reasoning, missing_elements };
  } catch {
    return {
      semantic_status: 'unknown',
      semantic_confidence: 0,
      semantic_reasoning: 'Failed to parse LLM response',
      missing_elements: [],
    };
  }
}
