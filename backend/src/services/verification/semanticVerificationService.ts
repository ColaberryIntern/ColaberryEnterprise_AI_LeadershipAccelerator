import { callLLMWithAudit } from '../llmCallWrapper';
import { CodeAnalysis } from './codeAnalysisService';

export interface SemanticResult {
  semantic_status: 'semantic_not_aligned' | 'semantic_partial' | 'semantic_aligned' | 'unknown';
  semantic_confidence: number;
  semantic_reasoning: string;
  missing_elements: string[];
}

const MODEL = 'gpt-4o-mini';

// ---------------------------------------------------------------------------
// Verify a requirement semantically using LLM
// ---------------------------------------------------------------------------

export async function verifySemantic(
  enrollmentId: string,
  requirementText: string,
  analysis: CodeAnalysis
): Promise<SemanticResult> {
  try {
    const systemPrompt = buildSystemPrompt();
    const userPrompt = buildUserPrompt(requirementText, analysis);

    const result = await callLLMWithAudit({
      lessonId: 'semantic-verification',
      enrollmentId,
      generationType: 'admin_structure',
      step: 'semantic_requirement_verification',
      systemPrompt,
      userPrompt,
      model: MODEL,
      temperature: 0.2,
      maxTokens: 500,
      responseFormat: { type: 'json_object' },
    });

    const parsed = parseResponse(result.content);

    console.log(
      `[SemanticVerification] ${parsed.semantic_status} (confidence: ${parsed.semantic_confidence}) ${result.cacheHit ? '[cached]' : '[fresh]'}`
    );

    return parsed;
  } catch (err: any) {
    console.error(`[SemanticVerification] LLM error: ${err.message}`);
    return {
      semantic_status: 'unknown',
      semantic_confidence: 0,
      semantic_reasoning: `LLM unavailable: ${err.message}`,
      missing_elements: [],
    };
  }
}

// ---------------------------------------------------------------------------
// Prompt Builders
// ---------------------------------------------------------------------------

function buildSystemPrompt(): string {
  return `You are a senior software architect performing code verification.

Your task: determine whether a software requirement is implemented in a codebase based on the detected features and file structure.

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
}

function buildUserPrompt(requirementText: string, analysis: CodeAnalysis): string {
  const features = analysis.detected_features.length > 0
    ? analysis.detected_features.join(', ')
    : 'none detected';

  const signals = analysis.structural_signals.length > 0
    ? analysis.structural_signals.join(', ')
    : 'none detected';

  // Summarize file map (top 15 most relevant files)
  const fileSummary = analysis.file_map
    .slice(0, 15)
    .map((f) => `  ${f.path} [${f.detected_keywords.join(', ')}]`)
    .join('\n');

  return `## Requirement
"${requirementText}"

## Detected Code Features
${features}

## Structural Signals
${signals}

## Relevant Files
${fileSummary || '  (no matching files detected)'}

Evaluate whether this requirement is implemented based on the code evidence above.`;
}

// ---------------------------------------------------------------------------
// Response Parser
// ---------------------------------------------------------------------------

function parseResponse(content: string): SemanticResult {
  try {
    const data = JSON.parse(content);

    // Map LLM status to our enum
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
