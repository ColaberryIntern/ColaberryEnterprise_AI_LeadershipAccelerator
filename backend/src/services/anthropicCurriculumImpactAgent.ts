import AnthropicChangeEvent, { ChangeSeverity } from '../models/AnthropicChangeEvent';
import { getOpenAIClient } from '../intelligence/assistant/openaiHelper';
import { sendCurriculumImpactDigest } from './emailService';
import { getSetting } from './settingsService';
import { env } from '../config/env';

export interface ImpactEventResult {
  id: string;
  url: string;
  content_type: string;
  score: number;
  severity: ChangeSeverity;
  rationale: string;
  error?: string;
  error_class?: string;
}

export interface ImpactAgentRunResult {
  scored: number;
  alerted: number;
  errors: number;
  events: ImpactEventResult[];
}

// Timeout per OpenAI call. Events that exceed this stay 'unknown' and retry on the next nightly run.
const OPENAI_TIMEOUT_MS = 30_000;

const SYSTEM_PROMPT = `You are an AI curriculum impact analyst for an enterprise AI training program.
You score content changes on Anthropic's website by their impact on learners.

Scoring guide (1–10):
1–3 = low: cosmetic or metadata change, no learning content affected
4–6 = medium: supplementary content updated, minor course material change
7–8 = high: significant course material change, new modules, updated API content learners depend on
9–10 = critical: course restructured, breaking API changes, deprecated features in active use

Respond ONLY with valid JSON: { "score": <integer 1–10>, "rationale": "<one sentence>" }`;

function scoreToSeverity(score: number): ChangeSeverity {
  if (score >= 9) return 'critical';
  if (score >= 7) return 'high';
  if (score >= 4) return 'medium';
  return 'low';
}

function log(
  level: 'info' | 'warn' | 'error',
  event: string,
  context: Record<string, unknown> = {},
): void {
  process.stdout.write(
    JSON.stringify({
      timestamp: new Date().toISOString(),
      level,
      service: 'anthropicCurriculumImpactAgent',
      event,
      ...context,
    }) + '\n',
  );
}

async function scoreEvent(
  event: AnthropicChangeEvent,
): Promise<{ score: number; rationale: string }> {
  const client = getOpenAIClient();
  if (!client) throw new Error('OpenAI API key not configured');

  const isBaseline = !event.previous_value;
  const userPrompt = isBaseline
    ? `URL: ${event.url}
Content type: ${event.content_type}
Detection method: ${event.detection_method}
Note: Baseline capture — no prior value exists. Score the curriculum importance of this content type and URL.`
    : `URL: ${event.url}
Content type: ${event.content_type}
Detection method: ${event.detection_method}
Previous value: ${event.previous_value}
Current value: ${event.current_value}
Detected at: ${event.detected_at.toISOString()}`;

  const response = await client.chat.completions.create(
    {
      model: env.aiModel,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: userPrompt },
      ],
      max_tokens: 200,
      temperature: 0.2,
      response_format: { type: 'json_object' },
    },
    { timeout: OPENAI_TIMEOUT_MS },
  );

  const raw = response.choices[0]?.message?.content;
  if (!raw) throw new Error('OpenAI returned empty content');

  const parsed = JSON.parse(raw);
  const score = Math.max(1, Math.min(10, Math.round(Number(parsed.score))));
  if (isNaN(score)) throw new Error(`Invalid score in OpenAI response: ${parsed.score}`);
  return { score, rationale: String(parsed.rationale || '') };
}

async function resolveAlertRecipient(): Promise<string> {
  try {
    const setting = await getSetting('admin_notification_emails');
    if (setting && setting.trim()) return setting.trim().split(',')[0].trim();
  } catch {
    // Fall through to default
  }
  return 'ali@colaberry.com';
}

export async function runCurriculumImpactAgent(): Promise<ImpactAgentRunResult> {
  const unscored = await AnthropicChangeEvent.findAll({
    where: { severity: 'unknown' },
    order: [['processed_at', 'DESC']],
  });

  const result: ImpactAgentRunResult = { scored: 0, alerted: 0, errors: 0, events: [] };

  if (unscored.length === 0) {
    log('info', 'run_complete', { scored: 0, alerted: 0, errors: 0 });
    return result;
  }

  log('info', 'run_start', { unscored_count: unscored.length });

  for (const event of unscored) {
    try {
      const { score, rationale } = await scoreEvent(event);
      const severity = scoreToSeverity(score);
      await event.update({ severity });
      result.scored += 1;
      result.events.push({
        id: event.id,
        url: event.url,
        content_type: event.content_type,
        score,
        severity,
        rationale,
      });
      log('info', 'event_scored', { url: event.url, score, severity, outcome: 'success' });
    } catch (err: any) {
      result.errors += 1;
      const error_class =
        err instanceof SyntaxError || err.name === 'SyntaxError' ? 'ParseError' : 'ScoringError';
      result.events.push({
        id: event.id,
        url: event.url,
        content_type: event.content_type,
        score: 0,
        severity: 'unknown',
        rationale: '',
        error: err.message,
        error_class,
      });
      log('error', 'event_score_failed', {
        url: event.url,
        error_class,
        message: err.message,
        outcome: 'failure',
      });
    }
  }

  const highPriority = result.events.filter(e => e.score >= 7 && !e.error);
  if (highPriority.length > 0) {
    try {
      const to = await resolveAlertRecipient();
      await sendCurriculumImpactDigest(to, highPriority);
      result.alerted = highPriority.length;
      log('info', 'alert_sent', { to, count: highPriority.length, outcome: 'success' });
    } catch (err: any) {
      log('error', 'alert_send_failed', { message: err.message, outcome: 'failure' });
    }
  }

  log('info', 'run_complete', {
    scored: result.scored,
    alerted: result.alerted,
    errors: result.errors,
  });
  return result;
}
