import OpenAI from 'openai';
import crypto from 'crypto';
import { ContentGenerationLog } from '../models/ContentGenerationLog';

// ─── Shared OpenAI singleton ────────────────────────────────────────────────
let _openai: OpenAI | null = null;
export function getOpenAI(): OpenAI {
  if (!_openai) _openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  return _openai;
}

// ─── In-memory cache ────────────────────────────────────────────────────────
interface CacheEntry {
  content: string;
  usage: { prompt_tokens: number; completion_tokens: number; total_tokens: number };
  timestamp: number;
}

const memoryCache = new Map<string, CacheEntry>();
const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour
const CACHE_MAX_SIZE = 100;

function getCachedResponse(hash: string): CacheEntry | null {
  const entry = memoryCache.get(hash);
  if (!entry) return null;
  if (Date.now() - entry.timestamp > CACHE_TTL_MS) {
    memoryCache.delete(hash);
    return null;
  }
  return entry;
}

function setCachedResponse(hash: string, entry: CacheEntry): void {
  // Evict oldest if at capacity
  if (memoryCache.size >= CACHE_MAX_SIZE) {
    const oldestKey = memoryCache.keys().next().value;
    if (oldestKey) memoryCache.delete(oldestKey);
  }
  memoryCache.set(hash, entry);
}

// ─── Types ──────────────────────────────────────────────────────────────────
export type GenerationType = 'participant_content' | 'admin_structure' | 'admin_blueprint' | 'admin_simulation';

export interface LLMCallParams {
  lessonId: string;
  enrollmentId?: string;
  generationType: GenerationType;
  step: string;
  systemPrompt: string;
  userPrompt: string;
  model: string;
  temperature: number;
  maxTokens: number;
  responseFormat?: { type: string };
  force?: boolean; // bypass cache
}

export interface LLMCallResult {
  content: string;
  usage: { prompt_tokens: number; completion_tokens: number; total_tokens: number };
  cacheHit: boolean;
}

// ─── Constants ──────────────────────────────────────────────────────────────
const TIMEOUT_MS = 15_000;
const MAX_RETRIES = 2;
const BASE_DELAY_MS = 1000;

// ─── Main wrapper ───────────────────────────────────────────────────────────
export async function callLLMWithAudit(params: LLMCallParams): Promise<LLMCallResult> {
  const {
    lessonId, enrollmentId, generationType, step,
    systemPrompt, userPrompt, model, temperature, maxTokens,
    responseFormat, force,
  } = params;

  const inputsHash = crypto
    .createHash('sha256')
    .update(systemPrompt + '||' + userPrompt)
    .digest('hex');

  // Check cache (unless force bypass)
  if (!force) {
    const cached = getCachedResponse(inputsHash);
    if (cached) {
      // Log cache hit
      try {
        await ContentGenerationLog.create({
          lesson_id: lessonId,
          enrollment_id: enrollmentId || null,
          generation_type: generationType,
          step,
          inputs_hash: inputsHash,
          model_used: model,
          duration_ms: 0,
          prompt_tokens: cached.usage.prompt_tokens,
          completion_tokens: cached.usage.completion_tokens,
          token_count: cached.usage.total_tokens,
          success: true,
          retry_count: 0,
          error_message: null,
          cache_hit: true,
        } as any);
      } catch (logErr) {
        console.error('[LLMWrapper] Failed to log cache hit:', logErr);
      }
      return { content: cached.content, usage: cached.usage, cacheHit: true };
    }
  }

  const startTime = Date.now();
  let lastError: Error | null = null;
  let retryCount = 0;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

      const openaiParams: any = {
        model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        temperature,
        max_tokens: maxTokens,
      };
      if (responseFormat) {
        openaiParams.response_format = responseFormat;
      }

      const response = await getOpenAI().chat.completions.create(openaiParams, {
        signal: controller.signal,
      });

      clearTimeout(timer);

      const content = response.choices[0]?.message?.content;
      if (!content) throw new Error('Empty response from LLM');

      const usage = {
        prompt_tokens: response.usage?.prompt_tokens || 0,
        completion_tokens: response.usage?.completion_tokens || 0,
        total_tokens: response.usage?.total_tokens || 0,
      };

      const durationMs = Date.now() - startTime;

      // Cache the result
      setCachedResponse(inputsHash, { content, usage, timestamp: Date.now() });

      // Log success
      try {
        await ContentGenerationLog.create({
          lesson_id: lessonId,
          enrollment_id: enrollmentId || null,
          generation_type: generationType,
          step,
          inputs_hash: inputsHash,
          model_used: model,
          duration_ms: durationMs,
          prompt_tokens: usage.prompt_tokens,
          completion_tokens: usage.completion_tokens,
          token_count: usage.total_tokens,
          success: true,
          retry_count: attempt,
          error_message: null,
          cache_hit: false,
        } as any);
      } catch (logErr) {
        console.error('[LLMWrapper] Failed to log success:', logErr);
      }

      return { content, usage, cacheHit: false };
    } catch (err: any) {
      lastError = err;
      retryCount = attempt + 1;

      if (attempt < MAX_RETRIES) {
        const delay = BASE_DELAY_MS * Math.pow(2, attempt);
        console.warn(`[LLMWrapper] Attempt ${attempt + 1} failed (${err.message}), retrying in ${delay}ms...`);
        await new Promise(r => setTimeout(r, delay));
      }
    }
  }

  // All retries exhausted — log failure
  const durationMs = Date.now() - startTime;
  try {
    await ContentGenerationLog.create({
      lesson_id: lessonId,
      enrollment_id: enrollmentId || null,
      generation_type: generationType,
      step,
      inputs_hash: inputsHash,
      model_used: model,
      duration_ms: durationMs,
      prompt_tokens: null,
      completion_tokens: null,
      token_count: null,
      success: false,
      retry_count: retryCount,
      error_message: lastError?.message || 'Unknown error',
      cache_hit: false,
    } as any);
  } catch (logErr) {
    console.error('[LLMWrapper] Failed to log failure:', logErr);
  }

  throw lastError || new Error('LLM call failed after retries');
}
