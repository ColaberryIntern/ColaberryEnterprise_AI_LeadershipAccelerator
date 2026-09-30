/**
 * The canonical key for an execution-control scope (Phase 5 T504). PURE.
 *
 * `growth_journey_execution_controls` keeps ONE active row per scope, and says
 * so with a partial unique index on a single column. That only works if every
 * writer and every reader spells a scope the same way, which is what this
 * module is for.
 *
 *   rollout|<brand>|<programme>|<channel>            all three required
 *   pause|<brand|*>|<programme|*>|<channel|*>|<subject|*>
 *
 * ─── THERE IS NO ALL-WILDCARD PAUSE ─────────────────────────────────────────
 *
 * `pause|*|*|*|*` would be a journey-wide stop — a SECOND global switch beside
 * the existing `system_kill_switch`, which §14 forbids ("never two independent
 * switches that can disagree silently"). Building one throws here, at the one
 * place every pause must pass through, rather than being caught by a reviewer.
 */

export const WILDCARD = '*';

export class ScopeKeyError extends Error {
  readonly error_class = 'ValidationError';
  readonly status = 400;
  constructor(message: string) {
    super(message);
    this.name = 'ScopeKeyError';
  }
}

export interface RolloutScope {
  brandId: string;
  programId: string;
  channel: string;
}

export interface PauseScope {
  brandId?: string | null;
  programId?: string | null;
  channel?: string | null;
  subjectRef?: string | null;
}

const part = (v: string | null | undefined): string => {
  if (v === null || v === undefined || v === '') return WILDCARD;
  if (String(v).includes('|')) throw new ScopeKeyError(`a scope part may not contain "|": ${v}`);
  return String(v);
};

/** A rollout names exactly one brand, one programme and one channel — it RAISES a mode, so it may not be wild. */
export function rolloutScopeKey(scope: RolloutScope): string {
  for (const [name, value] of Object.entries(scope)) {
    if (!value) throw new ScopeKeyError(`a rollout scope needs a ${name}`);
  }
  return ['rollout', part(scope.brandId), part(scope.programId), part(scope.channel)].join('|');
}

/** A pause may leave any dimension wild — but not all four. */
export function pauseScopeKey(scope: PauseScope): string {
  const parts = [part(scope.brandId), part(scope.programId), part(scope.channel), part(scope.subjectRef)];
  if (parts.every((p) => p === WILDCARD)) {
    throw new ScopeKeyError('a pause with no scope would be a second global kill switch; use the system kill switch instead');
  }
  return ['pause', ...parts].join('|');
}

export interface PauseTarget {
  brandId: string;
  programId: string;
  channel: string;
  subjectRef?: string | null;
}

/**
 * Every pause key that would cover this target, MOST SPECIFIC FIRST.
 *
 * Fifteen keys: the four dimensions either named or wild, minus the all-wildcard
 * one this module refuses. The resolver asks for these in one query and takes
 * the first match, so "which pause stopped it" is a fact about the key rather
 * than a judgement made in code.
 */
export function pauseScopeKeysFor(target: PauseTarget): string[] {
  const dims: Array<string | null> = [target.brandId, target.programId, target.channel, target.subjectRef ?? null];
  // Deduplicated: a dimension the target does not have (no subject) yields the same key named or wild.
  const keys = new Map<string, { key: string; named: number }>();
  for (let mask = 0; mask < 16; mask += 1) {
    const chosen = dims.map((value, i) => ((mask >> i) & 1 ? value : null));
    if (chosen.every((c) => c === null || c === undefined || c === '')) continue;
    const [brandId, programId, channel, subjectRef] = chosen;
    const key = pauseScopeKey({ brandId, programId, channel, subjectRef });
    if (!keys.has(key)) keys.set(key, { key, named: chosen.filter(Boolean).length });
  }
  return [...keys.values()]
    .sort((a, b) => b.named - a.named || a.key.localeCompare(b.key))
    .map((k) => k.key);
}

/** The scope a key names, for a reason string a human reads: `pause:brand+channel`. */
export function describeScopeKey(key: string): string {
  const [kind, ...parts] = key.split('|');
  if (kind !== 'pause') return kind;
  const names = ['brand', 'programme', 'channel', 'subject'].filter((_, i) => parts[i] && parts[i] !== WILDCARD);
  return `pause:${names.join('+') || 'none'}`;
}
