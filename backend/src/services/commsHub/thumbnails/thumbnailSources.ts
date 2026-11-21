import type CommsHubEvent from '../../../models/CommsHubEvent';
import { centralDateKey, formatCentralClock } from '../../centralDate';
import { emitAiEvent } from '../../aiEventService';
import { centralClock } from '../eventRecurrence';
import type { Actor } from '../activityLog';
import { TEMPLATES, type TemplateId } from './templateSvg';
import { deriveAllSizes, renderAllSizes, renderOverlayAllSizes } from './templateRender';
import { buildArtPrompt, buildPrompt, NEEDS_PHOTO, OVERLAY_THEME, TEXT_MODE, type PromptSlots, type StyleFamily } from './stylePrompts';
import { generateImage, IMAGE_MODEL, IMAGE_QUALITY, ImageApiError } from './openaiImages';
import { completeAiAttempt, estimateCostUsd, failAiAttempt, reserveAiAttempt, storeOption } from './thumbnailStore';

/**
 * Where thumbnail options come from (CH4.3): a pluggable ThumbnailSource with two implementations.
 * - templateSource: the three branded templates (CH4.2), always available, deterministic, no cost.
 * - aiSource: OpenAI image generation from the style families, with the organizer's photos when given.
 * The AI source never fails the organizer: a refusal (flag off, a portrait style with no photo, the
 * daily ceiling, an API error or timeout) falls back to the templates and says why. Every AI call,
 * success or failure, is written to the platform's AI event log (ai_events: model, cost, duration).
 */
export interface GenerateRequest { event: CommsHubEvent; headline: string; supporting: string | null; showWhen: boolean; photos: Buffer[]; actor: Actor; artNote?: string | null }
export interface GeneratedOption { id: string; source: 'template' | 'ai'; style: string; prompt: string | null; costUsd: number | null }
export interface GenerateResult { options: GeneratedOption[]; fallbackReason: string | null }
export interface ThumbnailSource { id: 'template' | 'ai'; generate(req: GenerateRequest, style: string): Promise<GenerateResult> }

export const AI_DAILY_LIMIT = 12;
export const MAX_AI_PHOTOS = 6;
/** On unless switched off; OFF under jest unless a test turns it on, so no test can reach the paid service by accident. */
export const aiEnabled = (): boolean => {
  const raw = process.env.COMMS_HUB_AI_THUMBNAILS?.trim().toLowerCase();
  if (raw) return raw !== 'false';
  return process.env.NODE_ENV !== 'test';
};

const WEEKDAY = (d: Date): string => new Intl.DateTimeFormat('en-US', { timeZone: 'America/Chicago', weekday: 'long' }).format(d).toUpperCase();

/** The event's facts as picture text, all from the record: cadence, Central time, hosts, platform. */
export function slotsFor(req: GenerateRequest, aspect: string): PromptSlots {
  const e = req.event;
  const clock = formatCentralClock(centralDateKey(e.starts_at.getTime()), centralClock(e.starts_at));
  const rule = e.repeat_rule;
  const cadence = !rule ? null : rule.freq === 'weekly' ? `EVERY ${WEEKDAY(e.starts_at)}` : rule.freq === 'biweekly' ? `EVERY OTHER ${WEEKDAY(e.starts_at)}` : 'MONTHLY';
  const day = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Chicago', weekday: 'short', month: 'short', day: 'numeric' }).format(e.starts_at).toUpperCase();
  return {
    headline: req.headline, supporting: req.supporting,
    cadence, when: !req.showWhen ? '' : cadence ? clock : `${day} \u00B7 ${clock}`,
    hosts: (e.hosts ?? []).map((h) => (h.role ? `${h.name} - ${h.role}` : h.name)),
    platform: e.join_url && /zoom\.us/i.test(e.join_url) ? 'Live on Zoom' : 'Online',
    aspect, photoCount: Math.min(req.photos.length, MAX_AI_PHOTOS),
  };
}

/** The date badge text, from the record: "EVERY TUESDAY \u00B7 6:00 PM CST" or "TUE, DEC 1 \u00B7 6:00 PM CST". */
export function badgeFor(slots: PromptSlots, showWhen: boolean): string | null {
  if (!showWhen) return null;
  return slots.cadence ? `${slots.cadence} \u00B7 ${slots.when}` : slots.when;
}

/** Template options: one per branded template, all three sizes. */
export async function templateOptions(req: GenerateRequest, only?: TemplateId[]): Promise<GeneratedOption[]> {
  const slots = slotsFor(req, 'wide 16:9 banner');
  const badge = badgeFor(slots, req.showWhen);
  const out: GeneratedOption[] = [];
  for (const id of only ?? TEMPLATES) {
    const renders = await renderAllSizes(id, { headline: req.headline, supporting: req.supporting, badge }, req.photos);
    const row = await storeOption({
      eventId: req.event.id, source: 'template', styleFamily: id, promptUsed: null, inputs: { headline: req.headline, supporting: req.supporting, badge, show_when: req.showWhen, photos: Math.min(req.photos.length, 3) },
      pngs: Object.fromEntries(renders.map((r) => [r.size, r.png])), altText: req.headline, model: null, costUsd: 0, latencyMs: null, actor: req.actor,
    });
    out.push({ id: row.id, source: 'template', style: id, prompt: null, costUsd: 0 });
  }
  return out;
}

function logCall(req: GenerateRequest, family: string, thumbnailId: string, outcome: 'success' | 'failure', fields: { cost: number | null; ms: number; usage?: Record<string, unknown> | null; error?: string }): void {
  void emitAiEvent({
    event_type: 'comms_hub.thumbnail_generated', outcome, model: IMAGE_MODEL(), cost_usd: fields.cost, duration_ms: fields.ms,
    error_class: fields.error ?? null, user_id: req.actor.id, external_system: 'openai_images',
    total_tokens: typeof fields.usage?.total_tokens === 'number' ? fields.usage.total_tokens : null,
    metadata: { event_id: req.event.id, thumbnail_id: thumbnailId, style_family: family, photos: Math.min(req.photos.length, MAX_AI_PHOTOS), usage: fields.usage ?? null, quality: IMAGE_QUALITY() },
  });
}

/** One AI attempt: the option it made, or the plain reason it could not (the caller decides the fallback). */
export interface AiAttemptResult { option: GeneratedOption | null; reason: string | null }

export async function aiAttempt(req: GenerateRequest, family: StyleFamily, now: Date = new Date()): Promise<AiAttemptResult> {
  const refuse = (reason: string): AiAttemptResult => ({ option: null, reason });
  if (!aiEnabled()) return refuse('AI pictures are switched off on this server, so these are the branded templates.');
  if (NEEDS_PHOTO[family] && req.photos.length === 0) return refuse('That style re-stages a person, so it needs a photo. Add one, or pick another style.');
  const slots = { ...slotsFor(req, 'wide 16:9 banner'), artNote: req.artNote ?? null };
  const mode = TEXT_MODE();
  const prompt = mode === 'overlay' ? buildArtPrompt(family, slots) : buildPrompt(family, slots);
  const row = await reserveAiAttempt(req.event.id, family, prompt, IMAGE_MODEL(), AI_DAILY_LIMIT, req.actor, now);
  if (!row) return refuse(`This event has used today's ${AI_DAILY_LIMIT} AI pictures. Try again tomorrow, or use a template.`);
  const started = Date.now();
  let billed: number | null = null; // set once the image came back: a later failure was still paid for
  try {
    const img = await generateImage(prompt, '1536x1024', req.photos.slice(0, MAX_AI_PHOTOS));
    const cost = estimateCostUsd(IMAGE_QUALITY(), '1536x1024');
    billed = cost;
    // Overlay mode: the model drew art only; code lays the exact text over it, giving all three sizes from one call.
    // Model mode: the model drew the text too, so the other sizes are centred crops of its wide picture.
    const renders = mode === 'overlay'
      ? await renderOverlayAllSizes(img.png, OVERLAY_THEME[family], { headline: req.headline, supporting: req.supporting, badge: badgeFor(slots, req.showWhen) })
      : await deriveAllSizes(img.png);
    await completeAiAttempt(row, {
      pngs: Object.fromEntries(renders.map((r) => [r.size, r.png])), altText: req.headline, costUsd: cost, latencyMs: img.latencyMs, actor: req.actor,
      inputs: { headline: req.headline, supporting: req.supporting, show_when: req.showWhen, art_note: req.artNote ?? null, photos: Math.min(req.photos.length, MAX_AI_PHOTOS), usage: img.usage, text_mode: mode, cropped: mode === 'model' ? ['1x1', '3x1'] : [] },
    });
    logCall(req, family, row.id, 'success', { cost, ms: img.latencyMs, usage: img.usage });
    return { option: { id: row.id, source: 'ai', style: family, prompt, costUsd: cost }, reason: null };
  } catch (err) {
    const ms = Date.now() - started;
    const kind = err instanceof ImageApiError ? err.kind : 'unexpected';
    await failAiAttempt(row, kind, ms);
    logCall(req, family, row.id, 'failure', { cost: billed, ms, error: kind });
    if (err instanceof ImageApiError) return refuse(`${err.message} These are the branded templates instead.`);
    throw err;
  }
}

/** One AI option in the chosen family, or the templates with the reason they were used instead. */
export async function aiOption(req: GenerateRequest, family: StyleFamily, now: Date = new Date()): Promise<GenerateResult> {
  const r = await aiAttempt(req, family, now);
  if (r.option) return { options: [r.option], fallbackReason: null };
  return { options: await templateOptions(req), fallbackReason: r.reason };
}

export const templateSource: ThumbnailSource = {
  id: 'template',
  generate: async (req, style) => ({ options: await templateOptions(req, (TEMPLATES as string[]).includes(style) ? [style as TemplateId] : undefined), fallbackReason: null }),
};
export const aiSource: ThumbnailSource = { id: 'ai', generate: (req, style) => aiOption(req, style as StyleFamily) };
