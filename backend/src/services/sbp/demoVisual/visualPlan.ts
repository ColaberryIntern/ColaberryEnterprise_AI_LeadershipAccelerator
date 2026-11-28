import type { DemoSpec, DemoEvent } from '../demoSpec/contract';
import {
  MAX_BAR_ROWS, MAX_FUNNEL_STAGES, MAX_HEADLINE_TILES, MAX_TIMELINE_LANES,
  MIN_BAR_ROWS, MIN_FUNNEL_STAGES, MIN_PATH_STEPS, MIN_TIER_SEGMENTS,
  MIN_TIMELINE_EVENTS, MIN_TIMELINE_LANES, QUOTE_BLOCK_MIN_CHARS,
  type Fallback, type SkipReason, type VisualKind,
} from './visualRules';
import {
  distinctValues, enumFields, entitiesOf, instantOf, measuredFields, plainNumberFields,
  refFields, rowsWithNumber, screensOf, timeFields,
  type EntityView,
} from './specReaders';

/**
 * demoVisual/visualPlan - decide what the demo DRAWS, from the shape of the data alone. PURE.
 *
 * ## The one idea
 *
 * The engine must not know what a dental practice is, or a sales pipeline, or a maintenance
 * queue. It renders thousands of projects in domains nobody has seen. So nothing here reads a
 * domain word: every decision is made from field TYPES, reference structure, enum variation,
 * timestamps and event causality. Give it a shift-coverage spec and it finds a timeline because
 * work items carry two times and events group by `work_id`, not because it knows what a shift is.
 *
 * ## Why a plan rather than drawing directly
 *
 * This function returns a description and touches no DOM, which buys three things. It can be unit
 * tested against many specs without a browser. The engine stays a renderer, so a layout change
 * cannot quietly change which chart appears. And the reasons a visual was REFUSED survive into
 * the output, so a missing timeline can be told apart from a timeline that was never earned.
 *
 * ## Refusals are first-class
 *
 * Every block that is not drawn is recorded with a reason and the fallback that replaces it. The
 * guard that matters most at scale is this: a picture drawn from too little data says less than
 * the table it replaced while implying more. Beneath a threshold the table stays.
 *
 * ## Determinism
 *
 * Same spec in, same plan out. Entities and screens are sorted by key, `now` is the latest event
 * time in the spec and never a clock read, and nothing samples or randomises. A demo that renders
 * differently on two loads cannot be reviewed.
 */

export interface VisualBlock {
  kind: VisualKind;
  /** Entity key this draws from, or null for blocks built from `events`. */
  entity: string | null;
  /** Field keys the block reads. Always from the spec, never invented. */
  fields: string[];
  /** Stable ids of the rows or groups drawn, after any cap is applied. */
  items: string[];
  /** Set when a cap trimmed the block, so the engine can offer the table for the rest. */
  capped: { shown: number; total: number } | null;
}

export interface SkippedBlock {
  kind: VisualKind;
  entity: string | null;
  reason: SkipReason;
  fallback: Fallback;
  /** The measurement that failed, so a test can assert the cause rather than the absence. */
  detail: string;
}

export interface ScreenPlan {
  screen: string;
  type: string | null;
  blocks: VisualBlock[];
  skipped: SkippedBlock[];
}

export interface VisualPlanResult {
  version: 1;
  /** The latest event time in the spec. The engine's "now" line. Null when there are no events. */
  now: string | null;
  /** The entity most work refers to, if any. The timeline's lanes come from it. */
  primaryWorkEntity: string | null;
  screens: ScreenPlan[];
  /** Blocks that belong to the whole demo rather than one screen. */
  global: VisualBlock[];
  globalSkipped: SkippedBlock[];
}

/* ------------------------------------------------------------------ small helpers */

const byCountDesc = (a: { n: number }, b: { n: number }): number => b.n - a.n;

function latestEventTime(events: ReadonlyArray<DemoEvent>): string | null {
  let best: string | null = null;
  let bestMs = -Infinity;
  for (const e of events) {
    const ms = Date.parse(e.occurred_at);
    // An unparseable timestamp is compared as a string rather than dropped: a spec using a
    // display time is still ordered, just not arithmetically.
    const value = Number.isNaN(ms) ? -Infinity : ms;
    if (value > bestMs || (best === null && Number.isNaN(ms))) {
      if (!Number.isNaN(ms) || best === null) { best = e.occurred_at; bestMs = value; }
    }
  }
  return best;
}

function cap<T>(items: T[], max: number): { items: T[]; capped: { shown: number; total: number } | null } {
  if (items.length <= max) return { items, capped: null };
  return { items: items.slice(0, max), capped: { shown: max, total: items.length } };
}

/**
 * Which entity is the work the demo is about?
 *
 * Scored, not guessed: an entity earns points for every event whose `work_id` matches one of its
 * row ids, and for every OTHER entity that points at it through a `ref` field. That is the
 * structural definition of "the thing the work is about" and it holds in any domain. Ties break
 * on the entity key so the answer is stable.
 */
export function primaryWorkEntity(entities: EntityView[], events: ReadonlyArray<DemoEvent>): string | null {
  if (!entities.length) return null;
  const scores = entities.map((e) => {
    const ids = new Set(e.rows.map((r) => String(r.id)));
    const fromEvents = events.filter((ev) => ids.has(ev.work_id)).length;
    const fromRefs = entities
      .filter((other) => other.key !== e.key)
      .reduce((n, other) => n + refFields(other).filter((f) => f.ref === e.key).length, 0);
    return { key: e.key, n: fromEvents + fromRefs };
  });
  const ranked = [...scores].sort((a, b) => (b.n - a.n) || a.key.localeCompare(b.key));
  return ranked[0] && ranked[0].n > 0 ? ranked[0].key : null;
}

/* ------------------------------------------------------------------ the detections */

function planTimeline(
  entities: EntityView[], events: ReadonlyArray<DemoEvent>, primary: string | null,
): VisualBlock | SkippedBlock {
  const entity = entities.find((e) => e.key === primary) || null;

  // Route 1: work items that carry two or more times of their own.
  if (entity) {
    const times = timeFields(entity);
    if (times.length >= 2) {
      /*
       * Counted on values that are USABLE as instants, not on values that are merely present.
       * `date`, `time` and `datetime` hold display strings by contract ("8:30 AM CST"), so a row
       * can declare four time fields and still give a timeline nothing to place. Requiring the
       * value to parse is what lets this fall through to the events route, which is the one that
       * works on real specs.
       */
      const lanes = entity.rows.filter(
        (r) => times.filter((f) => instantOf(r[f.key]) !== null).length >= 2,
      );
      if (lanes.length >= MIN_TIMELINE_LANES) {
        // Only the fields that actually parse, and only the first two: the engine reads
        // fields[0] and fields[1] as the start and the end of a lane.
        const usable = times.filter((f) => lanes.some((r) => instantOf(r[f.key]) !== null));
        const { items, capped } = cap(lanes.map((r) => String(r.id)), MAX_TIMELINE_LANES);
        return {
          kind: 'timeline', entity: entity.key,
          fields: usable.slice(0, 2).map((f) => f.key), items, capped,
        };
      }
    }
  }

  // Route 2: lanes from the events themselves, grouped by the work they belong to.
  const workIds = Array.from(new Set(events.map((e) => e.work_id))).sort();
  if (events.length >= MIN_TIMELINE_EVENTS && workIds.length >= MIN_TIMELINE_LANES) {
    const { items, capped } = cap(workIds, MAX_TIMELINE_LANES);
    return { kind: 'timeline', entity: primary, fields: ['work_id', 'occurred_at'], items, capped };
  }

  return {
    kind: 'timeline', entity: primary, reason: 'below_minimum', fallback: 'table',
    detail: `${workIds.length} work ids and ${events.length} events; needs ${MIN_TIMELINE_LANES} lanes or ${MIN_TIMELINE_EVENTS} events`,
  };
}

function planTargetBars(entity: EntityView): VisualBlock | SkippedBlock {
  const measured = measuredFields(entity);
  if (!measured.length) {
    return {
      kind: 'target_bar', entity: entity.key, reason: 'no_candidate_data', fallback: 'table',
      detail: 'no meter field and no number carrying a max or target',
    };
  }
  return {
    kind: 'target_bar', entity: entity.key,
    fields: measured.map((f) => f.key),
    items: entity.rows.map((r) => String(r.id)),
    capped: null,
  };
}

function planComparisonBars(entity: EntityView): VisualBlock | SkippedBlock {
  const candidates = plainNumberFields(entity)
    .map((f) => ({ f, n: rowsWithNumber(entity, f.key) }))
    .filter((c) => c.n >= MIN_BAR_ROWS)
    .sort(byCountDesc);
  if (!candidates.length) {
    const best = plainNumberFields(entity)
      .map((f) => rowsWithNumber(entity, f.key))
      .reduce((m, n) => Math.max(m, n), 0);
    return {
      kind: 'comparison_bars', entity: entity.key, reason: 'below_minimum', fallback: 'table',
      detail: `best numeric field is filled on ${best} rows; needs ${MIN_BAR_ROWS}`,
    };
  }
  const field = candidates[0].f;
  const rows = entity.rows.filter((r) => typeof r[field.key] === 'number').map((r) => String(r.id));
  const { items, capped } = cap(rows, MAX_BAR_ROWS);
  return { kind: 'comparison_bars', entity: entity.key, fields: [field.key], items, capped };
}

function planStatusPills(entity: EntityView): VisualBlock | SkippedBlock {
  const enums = enumFields(entity);
  if (!enums.length) {
    return {
      kind: 'status_pills', entity: entity.key, reason: 'no_candidate_data', fallback: 'table',
      detail: 'no enum field',
    };
  }
  const field = enums.find((f) => f.key === entity.statusField) || enums[0];
  const values = distinctValues(entity, field.key);
  const { items, capped } = cap(values, MAX_HEADLINE_TILES);
  return { kind: 'status_pills', entity: entity.key, fields: [field.key], items, capped };
}

/**
 * A funnel is child rows narrowing through stages. Stages come from the DATA in order of
 * narrowing count, never from a list somebody typed, and a stage set whose counts are all equal
 * is not a funnel: it is a category breakdown wearing a funnel's shape.
 */
function planFunnel(entity: EntityView, workEntity: string | null): VisualBlock | SkippedBlock {
  const pointsAtWork = refFields(entity).some((f) => f.ref === workEntity);
  const enums = enumFields(entity);
  if (!workEntity || !pointsAtWork || !enums.length) {
    return {
      kind: 'funnel', entity: entity.key, reason: 'no_candidate_data', fallback: 'table',
      detail: 'not a child of the work entity, or carries no status enum',
    };
  }
  const field = enums.find((f) => f.key === entity.statusField) || enums[0];
  const counts = distinctValues(entity, field.key)
    .map((v) => ({ v, n: entity.rows.filter((r) => String(r[field.key]) === v).length }))
    .sort(byCountDesc);
  if (counts.length < MIN_FUNNEL_STAGES) {
    return {
      kind: 'funnel', entity: entity.key, reason: 'below_minimum', fallback: 'table',
      detail: `${counts.length} stages; needs ${MIN_FUNNEL_STAGES}`,
    };
  }
  if (counts[0].n === counts[counts.length - 1].n) {
    return {
      kind: 'funnel', entity: entity.key, reason: 'no_variation', fallback: 'table',
      detail: `every stage holds ${counts[0].n} rows, so nothing narrows`,
    };
  }
  const { items, capped } = cap(counts.map((c) => c.v), MAX_FUNNEL_STAGES);
  return { kind: 'funnel', entity: entity.key, fields: [field.key], items, capped };
}

/** A path of steps is a causal chain: events linked by `parent_event_id` inside one `work_id`. */
function planStepPath(events: ReadonlyArray<DemoEvent>): VisualBlock | SkippedBlock {
  const byWork = new Map<string, DemoEvent[]>();
  for (const e of events) {
    const list = byWork.get(e.work_id) || [];
    list.push(e);
    byWork.set(e.work_id, list);
  }
  const chained = Array.from(byWork.entries())
    .map(([work, list]) => ({ work, n: list.filter((e) => e.parent_event_id !== null).length + 1 }))
    .filter((c) => c.n >= MIN_PATH_STEPS)
    .sort((a, b) => (b.n - a.n) || a.work.localeCompare(b.work));
  if (!chained.length) {
    return {
      kind: 'step_path', entity: null, reason: 'below_minimum', fallback: 'list',
      detail: `no work item has ${MIN_PATH_STEPS} causally linked events`,
    };
  }
  return {
    kind: 'step_path', entity: null,
    fields: ['parent_event_id', 'status', 'occurred_at'],
    items: chained.map((c) => c.work), capped: null,
  };
}

/** Rows a person must act on: an entity action with a `when`, and rows that match it. */
function planDecisionCards(entities: EntityView[]): VisualBlock | SkippedBlock {
  const pending: string[] = [];
  const fields = new Set<string>();
  for (const entity of entities) {
    for (const action of entity.actions) {
      if (!action.when) continue;
      for (const [k, v] of Object.entries(action.when)) {
        fields.add(k);
        for (const row of entity.rows) {
          const match = Array.isArray(v) ? v.map(String).includes(String(row[k])) : String(row[k]) === String(v);
          const id = `${entity.key}:${String(row.id)}`;
          if (match && !pending.includes(id)) pending.push(id);
        }
      }
    }
  }
  if (!pending.length) {
    return {
      kind: 'decision_cards', entity: null, reason: 'no_candidate_data', fallback: 'none',
      detail: 'no entity action declares a `when`, or no row matches one',
    };
  }
  return { kind: 'decision_cards', entity: null, fields: [...fields].sort(), items: pending, capped: null };
}

/**
 * Who did what, built from `events` rather than from the plan's roster.
 *
 * Guard 4 of the rules: never show an empty state the data contradicts. The old engine printed
 * "the plan names no agents" on a screen whose own activity log named twelve, because it read
 * `agents` and the scaffold had left it empty.
 */
function planActorSummary(events: ReadonlyArray<DemoEvent>): VisualBlock | SkippedBlock {
  const actors = Array.from(new Set(events.map((e) => e.actor.id))).sort();
  if (!actors.length) {
    return {
      kind: 'actor_summary', entity: null, reason: 'no_candidate_data', fallback: 'none',
      detail: 'the spec records no events, so nobody has acted',
    };
  }
  const tiers = Array.from(new Set(events.map((e) => e.autonomy_tier)));
  return {
    kind: 'actor_summary', entity: null,
    // The tier bar is part of this block only when it would carry information.
    fields: tiers.length >= MIN_TIER_SEGMENTS ? ['actor', 'autonomy_tier'] : ['actor'],
    items: actors, capped: null,
  };
}

/** Long text is quoted, never charted. Decided on the VALUES present, not on the field name. */
function planQuoteBlocks(entity: EntityView): VisualBlock | null {
  const keys = entity.fields
    .filter((f) => f.type === 'text')
    .filter((f) => entity.rows.some((r) => typeof r[f.key] === 'string' && (r[f.key] as string).length >= QUOTE_BLOCK_MIN_CHARS))
    .map((f) => f.key);
  if (!keys.length) return null;
  return { kind: 'quote_block', entity: entity.key, fields: keys, items: [], capped: null };
}

/* ------------------------------------------------------------------ assembly */

function isSkipped(b: VisualBlock | SkippedBlock): b is SkippedBlock {
  return (b as SkippedBlock).reason !== undefined;
}

/**
 * Build the plan.
 *
 * Screens keep the order and types the spec declares; this decides what each one DRAWS, in the
 * analysis order the rules set out (summary before detail on every screen).
 */
export function visualPlan(spec: DemoSpec): VisualPlanResult {
  const entities = entitiesOf(spec);
  const events = spec.events || [];
  const primary = primaryWorkEntity(entities, events);

  const timeline = planTimeline(entities, events, primary);
  const decisions = planDecisionCards(entities);
  const actors = planActorSummary(events);
  const steps = planStepPath(events);

  const global: VisualBlock[] = [];
  const globalSkipped: SkippedBlock[] = [];
  for (const b of [decisions, actors]) (isSkipped(b) ? globalSkipped : global).push(b as never);

  const screens: ScreenPlan[] = screensOf(spec).map((screen) => {
    const blocks: VisualBlock[] = [];
    const skipped: SkippedBlock[] = [];
    const push = (b: VisualBlock | SkippedBlock): void => {
      if (isSkipped(b)) skipped.push(b); else blocks.push(b);
    };
    const entity = entities.find((e) => e.key === screen.entity) || null;

    if (screen.type === 'home') {
      // Counts first, then measured-against-target, then the one picture of the whole, then what
      // needs a person, and the feed last. That order is the analysis the reader wants.
      const workEntity = entities.find((e) => e.key === primary);
      if (workEntity) push(planStatusPills(workEntity));
      if (workEntity) push(planTargetBars(workEntity));
      push(timeline);
      push(decisions);
      for (const child of entities) push(planFunnel(child, primary));
    } else if (screen.type === 'list' && entity) {
      push(planTargetBars(entity));
      push(planComparisonBars(entity));
      /*
       * Only on the screen showing the work the events are ABOUT. Events carry a `work_id`, so a
       * path of steps drawn on an unrelated entity's screen is a true picture of the wrong
       * thing: the people list showed how the shifts went, under a heading about the work.
       */
      if (entity.key === primary) push(steps);
      const matrixRefs = refFields(entity);
      if (matrixRefs.length >= 2 && plainNumberFields(entity).length >= 1) {
        blocks.push({
          kind: 'matrix', entity: entity.key,
          fields: [...matrixRefs.slice(0, 2).map((f) => f.key), plainNumberFields(entity)[0].key],
          items: entity.rows.map((r) => String(r.id)), capped: null,
        });
      }
    } else if (screen.type === 'queue') {
      push(decisions);
    } else if (screen.type === 'roster') {
      push(actors);
    }

    if (entity) {
      const quote = planQuoteBlocks(entity);
      if (quote) blocks.push(quote);
    }
    return { screen: screen.id, type: screen.type, blocks, skipped };
  });

  return {
    version: 1,
    now: latestEventTime(events),
    primaryWorkEntity: primary,
    screens,
    global,
    globalSkipped,
  };
}
