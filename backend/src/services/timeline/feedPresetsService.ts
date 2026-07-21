/**
 * feedPresetsService — named, reusable Feed Control configurations. A preset is a
 * saved set of "included" curriculum-type slugs (the sandbox selection) that an
 * admin can re-load into the sandbox or apply to the live feed. Stored as a single
 * system_settings row (`feed_control_presets`); no new table required.
 */
import { randomUUID } from 'crypto';
import { getSetting, setSetting } from '../settingsService';

const PRESETS_KEY = 'feed_control_presets';

export interface FeedPreset {
  id: string;
  name: string;
  includes: string[];   // curriculum-type slugs the preset turns on
  created_at: string;
}

function normalize(raw: unknown): FeedPreset[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((p): p is Record<string, unknown> => !!p && typeof p === 'object' && typeof (p as any).id === 'string' && typeof (p as any).name === 'string')
    .map((p) => ({
      id: String(p.id),
      name: String(p.name).slice(0, 80),
      includes: Array.isArray(p.includes) ? (p.includes as unknown[]).filter((s): s is string => typeof s === 'string') : [],
      created_at: typeof p.created_at === 'string' ? p.created_at : new Date(0).toISOString(),
    }));
}

export async function listPresets(): Promise<FeedPreset[]> {
  try { return normalize(await getSetting(PRESETS_KEY)); } catch { return []; }
}

/** Create or overwrite a preset. Upserts by name (case-insensitive) so re-saving a
 *  named setup replaces it instead of duplicating. */
export async function savePreset(name: string, includes: string[], adminId?: string): Promise<FeedPreset> {
  const clean = String(name || '').trim();
  if (!clean) throw Object.assign(new Error('preset name required'), { status: 400 });
  const slugs = Array.isArray(includes)
    ? Array.from(new Set(includes.filter((s) => typeof s === 'string' && s.trim())))
    : [];
  const presets = await listPresets();
  const existing = presets.find((p) => p.name.toLowerCase() === clean.toLowerCase());
  const preset: FeedPreset = existing
    ? { ...existing, name: clean, includes: slugs }
    : { id: randomUUID(), name: clean, includes: slugs, created_at: new Date().toISOString() };
  const next = existing ? presets.map((p) => (p.id === existing.id ? preset : p)) : [...presets, preset];
  await setSetting(PRESETS_KEY, next, adminId);
  return preset;
}

export async function deletePreset(id: string, adminId?: string): Promise<void> {
  const presets = await listPresets();
  await setSetting(PRESETS_KEY, presets.filter((p) => p.id !== id), adminId);
}
