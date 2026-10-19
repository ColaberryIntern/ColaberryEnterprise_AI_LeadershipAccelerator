import { ensureCampusLooksSchema } from '../../db/ensureCampusLooksSchema';
import { GEAR_CATALOG, Equipped, GearSlot, isUnlocked, publicGear, validateEquip, wearable } from './campusUnlocks';

/**
 * "My look" (Colaberry Campus C9): read and save the learner's gear, and the level + public gear of the people presence names.
 *
 * LEVEL is the band rung the portal already shows (progressionService.getRungNamesForEnrollments over the real points totals),
 * not the Apprentice / Builder / Architect / Principal names retired on 2026-09-16 (ladder decision D6).
 *
 * The heavy modules (points, progression, the model) are required lazily so route tests that never touch a look stay cheap.
 * Failures: getLook / setLook THROW (the route answers 500, nothing half-written: the upsert is one statement); looksFor never
 * throws, it logs and returns what it could (presence then shows the person without a level or gear, never drops them).
 */
export interface LookCatalogItem { id: string; name: string; slot: GearSlot; threshold: number; unlocked: boolean }
export interface Look { points: number; rung_name: string; catalog: LookCatalogItem[]; equipped: Equipped }
export interface PublicLook { rung_name?: string; gear?: Partial<Record<'head' | 'face' | 'body' | 'neck', string>> }

export interface LookDeps {
  totals: (ids: string[]) => Promise<Map<string, number>>;
  rungs: (ids: string[], totals: Map<string, number>) => Promise<Map<string, string>>;
  findLooks: (ids: string[]) => Promise<Array<{ enrollment_id: string; equipped: unknown }>>;
  upsertLook: (id: string, equipped: Equipped) => Promise<void>;
  ensureSchema: () => Promise<void>;
}

function defaultDeps(): LookDeps {
  const { getTotalsForEnrollments } = require('../pointsService') as { getTotalsForEnrollments: LookDeps['totals'] };
  const { getRungNamesForEnrollments } = require('../progression/progressionService') as { getRungNamesForEnrollments: LookDeps['rungs'] };
  const CampusLook = (require('../../models/CampusLook') as { default: {
    findAll: (q: unknown) => Promise<Array<{ enrollment_id: string; equipped: unknown }>>;
    upsert: (v: unknown) => Promise<unknown>;
  } }).default;
  return {
    totals: getTotalsForEnrollments,
    rungs: getRungNamesForEnrollments,
    findLooks: (ids) => CampusLook.findAll({ where: { enrollment_id: ids }, attributes: ['enrollment_id', 'equipped'] }),
    // INSERT ... ON CONFLICT (enrollment_id) DO UPDATE: one row per learner, the same save twice is the same end state.
    upsertLook: async (id, equipped) => { await CampusLook.upsert({ enrollment_id: id, equipped, updated_at: new Date() }); },
    ensureSchema: () => ensureCampusLooksSchema(),
  };
}

let depsOverride: LookDeps | null = null;
/** Test seam. */
export function __setLookDepsForTests(d: LookDeps | null): void { depsOverride = d; cache.clear(); }
const deps = (): LookDeps => depsOverride ?? defaultDeps();

async function pointsAndRung(d: LookDeps, id: string): Promise<{ points: number; rung: string }> {
  const totals = await d.totals([id]);
  const rungs = await d.rungs([id], totals);
  return { points: totals.get(id) ?? 0, rung: rungs.get(id) ?? '' };
}

export async function getLook(enrollmentId: string): Promise<Look> {
  const d = deps();
  await d.ensureSchema();
  const [{ points, rung }, rows] = await Promise.all([pointsAndRung(d, enrollmentId), d.findLooks([enrollmentId])]);
  return {
    points, rung_name: rung,
    catalog: GEAR_CATALOG.map((i) => ({ ...i, unlocked: isUnlocked(i, points) })),
    equipped: wearable(points, rows[0]?.equipped),
  };
}

/** Save the COMPLETE set. Validated against server-side points at write time; GearError (400) writes nothing. */
export async function setLook(enrollmentId: string, requested: Record<string, string | null | undefined>): Promise<Look> {
  const d = deps();
  await d.ensureSchema();
  const { points } = await pointsAndRung(d, enrollmentId);
  const equipped = validateEquip(points, requested);
  await d.upsertLook(enrollmentId, equipped);
  cache.delete(enrollmentId);
  return getLook(enrollmentId);
}

// ---- What other people see, for presence (named people only; the caller enforces that) ----
// Cached 60 s per enrollment, bounded, so a presence poll every 30 s does not re-sum everyone's points.
export const LOOK_CACHE_TTL_MS = 60_000;
const LOOK_CACHE_MAX = 2_000;
const cache = new Map<string, { at: number; look: PublicLook }>();

function logLookFailure(err: unknown): void {
  const e = err as { name?: string; message?: string };
  console.error(JSON.stringify({ timestamp: new Date().toISOString(), level: 'error', service: 'backend', event: 'campus_looks_read_failed',
    outcome: 'failure', error_class: e?.name || 'UnknownError', context: { message: String(e?.message ?? '').slice(0, 200) } }));
}

export async function looksFor(ids: string[], now: number = Date.now()): Promise<Map<string, PublicLook>> {
  const out = new Map<string, PublicLook>();
  const missing: string[] = [];
  for (const id of new Set(ids)) {
    const hit = cache.get(id);
    if (hit && now - hit.at < LOOK_CACHE_TTL_MS) out.set(id, hit.look); else missing.push(id);
  }
  if (missing.length === 0) return out;
  try {
    const d = deps();
    await d.ensureSchema();
    const totals = await d.totals(missing);
    const [rungs, rows] = await Promise.all([d.rungs(missing, totals), d.findLooks(missing)]);
    const stored = new Map(rows.map((r) => [r.enrollment_id, r.equipped]));
    if (cache.size + missing.length > LOOK_CACHE_MAX) cache.clear();
    for (const id of missing) {
      const look: PublicLook = { rung_name: rungs.get(id) || undefined, gear: publicGear(wearable(totals.get(id) ?? 0, stored.get(id))) };
      cache.set(id, { at: now, look });
      out.set(id, look);
    }
  } catch (err: unknown) {
    logLookFailure(err); // the people stay named; they just show no level or gear this time
  }
  return out;
}
