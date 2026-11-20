import { Op } from 'sequelize';
import CommsHubEvent from '../../../models/CommsHubEvent';
import CommsHubThumbnail from '../../../models/CommsHubThumbnail';
import { centralDateKey, centralWallClockToInstant, formatCentralClock } from '../../centralDate';
import { centralClock } from '../eventRecurrence';
import type { Actor } from '../activityLog';
import { TEMPLATES, type TemplateId } from './templateSvg';
import { renderAllSizes } from './templateRender';
import { buildPrompt, NEEDS_PHOTO, type PromptSlots, type StyleFamily } from './stylePrompts';
import { generateImage, IMAGE_QUALITY, ImageApiError } from './openaiImages';
import { estimateCostUsd, storeOption } from './thumbnailStore';

/**
 * Where thumbnail options come from (CH4.3): a pluggable source interface with two implementations.
 * - template: the three branded templates (CH4.2), always available, deterministic, no cost.
 * - ai: OpenAI image generation from the style families, with the organizer's photos when given.
 * The AI source never fails the organizer: a refusal (flag off, daily ceiling, a family that needs a
 * photo, an API error or timeout) falls back to the templates and says why in `fallbackReason`.
 */
export interface GenerateRequest { event: CommsHubEvent; headline: string; supporting: string | null; showWhen: boolean; photos: Buffer[]; actor: Actor }
export interface GeneratedOption { id: string; source: 'template' | 'ai'; style: string; prompt: string | null; costUsd: number | null }
export interface GenerateResult { options: GeneratedOption[]; fallbackReason: string | null }

export const AI_DAILY_LIMIT = 12;
export const aiEnabled = (): boolean => (process.env.COMMS_HUB_AI_THUMBNAILS ?? 'true').trim().toLowerCase() !== 'false';

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
    cadence, when: !req.showWhen ? '' : cadence ? clock : `${day} · ${clock}`,
    hosts: (e.hosts ?? []).map((h) => (h.role ? `${h.name} - ${h.role}` : h.name)),
    platform: e.join_url && /zoom\.us/i.test(e.join_url) ? 'Live on Zoom' : 'Online',
    aspect, photoCount: req.photos.length,
  };
}

/** Template options: one per branded template, all three sizes. */
export async function templateOptions(req: GenerateRequest, only?: TemplateId[]): Promise<GeneratedOption[]> {
  const slots = slotsFor(req, 'wide 16:9 banner');
  const badge = req.showWhen ? (slots.cadence ? `${slots.cadence} · ${slots.when}` : slots.when) : null;
  const out: GeneratedOption[] = [];
  for (const id of only ?? TEMPLATES) {
    const renders = await renderAllSizes(id, { headline: req.headline, supporting: req.supporting, badge }, req.photos);
    const row = await storeOption({
      eventId: req.event.id, source: 'template', styleFamily: id, promptUsed: null, inputs: { headline: req.headline, supporting: req.supporting, badge, photos: req.photos.length },
      pngs: Object.fromEntries(renders.map((r) => [r.size, r.png])), altText: req.headline, model: null, costUsd: 0, latencyMs: null, actor: req.actor,
    });
    out.push({ id: row.id, source: 'template', style: id, prompt: null, costUsd: 0 });
  }
  return out;
}

/** AI generations today (Central) for this event, counted from stored rows. */
export async function aiCountToday(eventId: string, now: Date = new Date()): Promise<number> {
  const midnight = centralWallClockToInstant(new Date(`${centralDateKey(now.getTime())}T00:00:00Z`));
  return CommsHubThumbnail.count({ where: { event_id: eventId, source: 'ai', created_at: { [Op.gte]: midnight } } });
}

/** One AI option in the chosen family, or the templates with the reason they were used instead. */
export async function aiOption(req: GenerateRequest, family: StyleFamily, now: Date = new Date()): Promise<GenerateResult> {
  const fallback = async (why: string): Promise<GenerateResult> => ({ options: await templateOptions(req), fallbackReason: why });
  if (!aiEnabled()) return fallback('AI pictures are switched off on this server, so these are the branded templates.');
  if (NEEDS_PHOTO[family] && req.photos.length === 0) return fallback('That style re-stages a person, so it needs a photo. Add one, or pick another style.');
  if ((await aiCountToday(req.event.id, now)) >= AI_DAILY_LIMIT) return fallback(`This event has used today's ${AI_DAILY_LIMIT} AI pictures. Try again tomorrow, or use a template.`);
  const prompt = buildPrompt(family, slotsFor(req, 'wide 16:9 banner'));
  try {
    const img = await generateImage(prompt, '1536x1024', req.photos);
    const cost = estimateCostUsd(IMAGE_QUALITY(), '1536x1024');
    const row = await storeOption({
      eventId: req.event.id, source: 'ai', styleFamily: family, promptUsed: prompt, inputs: { headline: req.headline, supporting: req.supporting, photos: req.photos.length, usage: img.usage },
      pngs: { '16x9': img.png }, altText: req.headline, model: img.model, costUsd: cost, latencyMs: img.latencyMs, actor: req.actor,
    });
    return { options: [{ id: row.id, source: 'ai', style: family, prompt, costUsd: cost }], fallbackReason: null };
  } catch (err) {
    if (err instanceof ImageApiError) return fallback(`${err.message} These are the branded templates instead.`);
    throw err;
  }
}
