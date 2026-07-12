/**
 * multimodalVisionEngine — top-level entry for vision-powered UX analysis.
 *
 * Pipeline:
 *   1. Build cache key from inputs.
 *   2. If cached + fresh → return cached.
 *   3. Otherwise call the configured provider (GPT-4o by default).
 *   4. Normalize the response.
 *   5. Store in cache.
 *
 * The provider interface is pluggable: tests use a stub; production uses
 * `gpt4oVisionProvider`. If the OpenAI dep is missing or no API key is
 * configured, the engine returns a low-confidence "rule_based" stub
 * (composed from the existing Phase 6 analyzers when DOM is available).
 *
 * Phase 7 §1, §2, §16.
 */
import { getInstrumentedOpenAI } from '../../../services/openaiInstrumented';
import { buildVisionPrompt, type VisionPromptInput } from './visionPromptBuilder';
import { normalizeVisionResponse, type MultimodalVisionAnalysis } from './visionResponseNormalizer';
import { getCached, setCached, makeCacheKey, shaOfBytes } from './visionResultCache';

export interface VisionProviderInput {
  readonly system: string;
  readonly user: string;
  readonly screenshot_path: string;
  readonly comparison_screenshot_path?: string | null;
}

export interface VisionProvider {
  readonly id: 'gpt4o' | 'stub';
  analyze(input: VisionProviderInput): Promise<string>;       // returns raw model output
}

let activeProvider: VisionProvider | null = null;

export function setVisionProvider(p: VisionProvider | null): void {
  activeProvider = p;
}

/**
 * Default GPT-4o provider, only constructed lazily on first use. If
 * OPENAI_API_KEY is missing, returns null (engine falls back to stub).
 */
async function getDefaultProvider(): Promise<VisionProvider | null> {
  if (activeProvider) return activeProvider;
  if (!process.env.OPENAI_API_KEY) return null;
  try {
    const client = getInstrumentedOpenAI({ workflow_id: 'vision' });
    const provider: VisionProvider = {
      id: 'gpt4o',
      async analyze(input: VisionProviderInput): Promise<string> {
        // Best-effort: encode the local screenshot file as base64 data URL.
        const fs = await import('fs/promises');
        const path = await import('path');
        const buf = await fs.readFile(path.resolve(input.screenshot_path));
        const dataUrl = `data:image/png;base64,${buf.toString('base64')}`;
        const messages: any[] = [
          { role: 'system', content: input.system },
          {
            role: 'user',
            content: [
              { type: 'text', text: input.user },
              { type: 'image_url', image_url: { url: dataUrl } },
            ],
          },
        ];
        if (input.comparison_screenshot_path) {
          const cmpBuf = await fs.readFile(path.resolve(input.comparison_screenshot_path));
          const cmpDataUrl = `data:image/png;base64,${cmpBuf.toString('base64')}`;
          messages[1].content.push({ type: 'text', text: '— Previous screenshot for comparison —' });
          messages[1].content.push({ type: 'image_url', image_url: { url: cmpDataUrl } });
        }
        const completion = await client.chat.completions.create({
          model: 'gpt-4o',
          temperature: 0.2,
          max_tokens: 1500,
          response_format: { type: 'json_object' },
          messages,
        });
        return completion.choices[0]?.message?.content ?? '';
      },
    };
    activeProvider = provider;
    return provider;
  } catch (err: any) {
    console.warn('[multimodalVisionEngine] OpenAI provider unavailable:', err?.message);
    return null;
  }
}

export interface AnalyzeImageInput extends VisionPromptInput {
  readonly screenshot_path: string;
  readonly comparison_screenshot_path?: string | null;
  /** Optional: the bytes themselves so we can hash them for cache keys. */
  readonly screenshot_bytes?: Buffer | Uint8Array;
}

export interface AnalyzeImageResult {
  readonly analysis: MultimodalVisionAnalysis;
  readonly cache_hit: boolean;
  readonly provider_id: VisionProvider['id'] | 'none';
  readonly elapsed_ms: number;
}

export async function analyzeImage(input: AnalyzeImageInput): Promise<AnalyzeImageResult> {
  const t0 = Date.now();
  const cacheKey = makeCacheKey({
    screenshot_path: input.screenshot_path,
    screenshot_bytes_sha: input.screenshot_bytes ? shaOfBytes(input.screenshot_bytes) : undefined,
    viewport: input.viewport,
    comparing: !!input.comparison_screenshot_path,
    intent: input.user_intent,
  });

  const cached = getCached(cacheKey);
  if (cached) {
    return { analysis: cached, cache_hit: true, provider_id: 'gpt4o', elapsed_ms: Date.now() - t0 };
  }

  const prompt = buildVisionPrompt(input);
  const provider = await getDefaultProvider();
  if (!provider) {
    // Stubbed analysis — used when OpenAI not available. The shape matches
    // the LLM contract so callers don't branch.
    const stub: MultimodalVisionAnalysis = {
      source: 'rule_based',
      overall_assessment: 'Vision provider unavailable (no API key or dep). Falling back to heuristic baseline.',
      cognition_score: 50,
      visual_hierarchy_score: 50,
      cta_prominence_score: 50,
      aesthetic_harmony_score: 50,
      workflow_intuitiveness_score: 50,
      accessibility_score: 50,
      observations: [`No multimodal provider available for ${input.route}.`],
      concerns: [],
      suggested_improvements: [],
      highlight_regions: [],
      confidence: 10,
    };
    setCached(cacheKey, stub);
    return { analysis: stub, cache_hit: false, provider_id: 'none', elapsed_ms: Date.now() - t0 };
  }

  let raw: string;
  try {
    raw = await provider.analyze({
      system: prompt.system,
      user: prompt.user,
      screenshot_path: input.screenshot_path,
      comparison_screenshot_path: input.comparison_screenshot_path,
    });
  } catch (err: any) {
    console.warn('[multimodalVisionEngine] provider.analyze failed:', err?.message);
    const stub: MultimodalVisionAnalysis = {
      source: 'rule_based',
      overall_assessment: `Vision provider error: ${err?.message ?? 'unknown'}`,
      cognition_score: 0,
      visual_hierarchy_score: 0,
      cta_prominence_score: 0,
      aesthetic_harmony_score: 0,
      workflow_intuitiveness_score: 0,
      accessibility_score: 0,
      observations: [],
      concerns: [],
      suggested_improvements: [],
      highlight_regions: [],
      confidence: 0,
    };
    return { analysis: stub, cache_hit: false, provider_id: provider.id, elapsed_ms: Date.now() - t0 };
  }

  const analysis = normalizeVisionResponse(raw, 'llm');
  setCached(cacheKey, analysis);
  return { analysis, cache_hit: false, provider_id: provider.id, elapsed_ms: Date.now() - t0 };
}
