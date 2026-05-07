/**
 * queueOptimizationLearner — correlates queue task ordering with downstream
 * pressure / cognition outcomes to identify which orderings work.
 *
 * Pure: takes a list of (task_id, position, post_outcome) triples, scores
 * the sequence, returns insights about which orderings reduced pressure
 * fastest.
 *
 * Phase 10 §3.
 */

export interface SequenceObservation {
  readonly task_id: string;
  readonly task_type: string;
  readonly position: number;             // 0-based
  readonly observed_pressure_at_completion: number | null;
}

export interface SequenceOutcome {
  /** Lower = pressure dropped faster after this sequence. */
  readonly avg_pressure_after_completion: number;
  /** Number of completions in this sequence. */
  readonly sample_count: number;
  /** Specific orderings that performed best vs baseline. */
  readonly top_orderings: ReadonlyArray<{ task_types: string[]; avg_pressure_drop: number; samples: number }>;
}

export interface QueueOptimizationInsights {
  readonly best_first_task_type: string | null;
  readonly worst_first_task_type: string | null;
  readonly avg_pressure_drop_per_position: ReadonlyArray<number>;
  readonly notes: ReadonlyArray<string>;
}

/**
 * Pure: identify which task types, when placed first, correlate with the
 * fastest pressure drop. Naive but interpretable.
 */
export function deriveQueueOptimizationInsights(
  observations: ReadonlyArray<SequenceObservation>,
): QueueOptimizationInsights {
  if (observations.length === 0) {
    return {
      best_first_task_type: null,
      worst_first_task_type: null,
      avg_pressure_drop_per_position: [],
      notes: ['No observations yet — orchestration learning requires accumulated history.'],
    };
  }

  // Group by inferred sequence (task_type at position 0). For each first-type,
  // compute the average pressure observed at later positions.
  const byFirstType = new Map<string, { firstPressure: number[]; laterPressure: number[] }>();
  // First, group observations by sequence id — V1 assumption: contiguous
  // observations whose positions form a 0,1,2,... ramp belong to the same
  // sequence. In practice the caller should annotate sequences; this is a
  // safe heuristic for clean-room testing.
  const sequences: SequenceObservation[][] = [];
  let current: SequenceObservation[] = [];
  let lastPos = -1;
  for (const o of observations) {
    if (o.position === 0 && current.length > 0) {
      sequences.push(current);
      current = [];
    }
    current.push(o);
    lastPos = o.position;
  }
  if (current.length > 0) sequences.push(current);

  for (const seq of sequences) {
    if (seq.length === 0) continue;
    const first = seq[0];
    if (typeof first.observed_pressure_at_completion !== 'number') continue;
    const arr = byFirstType.get(first.task_type) || { firstPressure: [], laterPressure: [] };
    arr.firstPressure.push(first.observed_pressure_at_completion);
    for (let i = 1; i < seq.length; i++) {
      const p = seq[i].observed_pressure_at_completion;
      if (typeof p === 'number') arr.laterPressure.push(p);
    }
    byFirstType.set(first.task_type, arr);
  }

  // Compute average pressure DROP per first-task-type (firstPressure − later)
  const dropByType: Array<{ type: string; drop: number; samples: number }> = [];
  for (const [type, data] of byFirstType) {
    if (data.firstPressure.length === 0 || data.laterPressure.length === 0) continue;
    const firstAvg = data.firstPressure.reduce((s, v) => s + v, 0) / data.firstPressure.length;
    const laterAvg = data.laterPressure.reduce((s, v) => s + v, 0) / data.laterPressure.length;
    dropByType.push({ type, drop: firstAvg - laterAvg, samples: data.firstPressure.length });
  }
  dropByType.sort((a, b) => b.drop - a.drop);

  // Average pressure drop per position (across all sequences)
  const positionPressures = new Map<number, number[]>();
  for (const seq of sequences) {
    for (const o of seq) {
      if (typeof o.observed_pressure_at_completion !== 'number') continue;
      const arr = positionPressures.get(o.position) || [];
      arr.push(o.observed_pressure_at_completion);
      positionPressures.set(o.position, arr);
    }
  }
  const positions = Array.from(positionPressures.keys()).sort((a, b) => a - b);
  const avgPerPos = positions.map(p => {
    const arr = positionPressures.get(p)!;
    return Math.round((arr.reduce((s, v) => s + v, 0) / arr.length) * 10) / 10;
  });

  const notes: string[] = [];
  notes.push(`Analyzed ${sequences.length} sequence${sequences.length === 1 ? '' : 's'} (${observations.length} observations).`);
  if (dropByType.length === 0) {
    notes.push('Insufficient data for first-type recommendations (need ≥1 multi-task sequence per type).');
  } else {
    notes.push(`Best first-type: ${dropByType[0].type} (drop ${dropByType[0].drop.toFixed(1)} over ${dropByType[0].samples} sequences).`);
    if (dropByType.length > 1) {
      const worst = dropByType[dropByType.length - 1];
      notes.push(`Worst first-type: ${worst.type} (drop ${worst.drop.toFixed(1)}).`);
    }
  }

  return {
    best_first_task_type: dropByType[0]?.type ?? null,
    worst_first_task_type: dropByType.length > 1 ? dropByType[dropByType.length - 1].type : null,
    avg_pressure_drop_per_position: avgPerPos,
    notes,
  };
}
