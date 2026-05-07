/**
 * incidentClassifier — heuristic classifier that scores how likely a
 * candidate incident is to escalate, given accumulated history.
 *
 * V1 is rule-based (pattern-matching against historical incident
 * signatures). The interface accepts pluggable scorers so a real ML
 * classifier can be slotted in without breaking callers.
 *
 * Pure logic where possible; DB-backed `predictIncidentForRecord` reads
 * historical patterns.
 *
 * Phase 9 §4.
 */

export interface IncidentRecord {
  readonly type: string;
  readonly severity: 'info' | 'warning' | 'error';
  readonly affected_routes: ReadonlyArray<string>;
  readonly cognition_impact: number | null;
  readonly occurrence_count: number;
  readonly opened_at: Date;
}

export interface SimilarPattern {
  readonly signature: string;
  readonly description: string;
  readonly occurrence_count: number;
  readonly project_count: number;
  readonly successful_remediations: number;
  readonly attempted_remediations: number;
  readonly successful_actions: ReadonlyArray<string>;
}

export interface IncidentPrediction {
  readonly likely_to_escalate: number;        // 0-100
  readonly likely_recurrence_count: number;
  readonly predicted_severity: 'info' | 'warning' | 'error';
  readonly affected_systems: ReadonlyArray<string>;
  readonly reasoning: ReadonlyArray<string>;
  readonly remediation_suggestions: ReadonlyArray<string>;
  readonly confidence: number;                 // 0-100
  readonly matched_patterns: ReadonlyArray<{ signature: string; description: string }>;
}

/**
 * Pure: predict from a record + a list of similar historical patterns.
 *
 * Heuristic:
 *   - same-signature occurrence_count ≥3 across multiple projects → high
 *     escalation likelihood
 *   - low successful-remediation rate → predict `error`
 *   - ≥1 successful_action collected → propose them as remediations
 *   - confidence proportional to pattern match strength
 */
export function predictFromPatterns(
  record: IncidentRecord,
  similar: ReadonlyArray<SimilarPattern>,
): IncidentPrediction {
  const reasoning: string[] = [];
  const remediation_suggestions: string[] = [];
  const affectedSet = new Set<string>(record.affected_routes);

  let escalateScore = 0;
  let predictedSeverity: 'info' | 'warning' | 'error' = record.severity;
  let confidence = 30;

  if (similar.length === 0) {
    reasoning.push('No similar historical patterns found.');
    return {
      likely_to_escalate: record.severity === 'error' ? 70 : record.severity === 'warning' ? 35 : 10,
      likely_recurrence_count: 1,
      predicted_severity: record.severity,
      affected_systems: Array.from(affectedSet),
      reasoning,
      remediation_suggestions: ['Run a visual review on the most-affected route.'],
      confidence,
      matched_patterns: [],
    };
  }

  // Aggregate across matched patterns
  let totalOccurrences = 0;
  let totalProjects = 0;
  let totalSuccess = 0;
  let totalAttempts = 0;
  const matched: Array<{ signature: string; description: string }> = [];

  for (const p of similar) {
    totalOccurrences += p.occurrence_count;
    totalProjects = Math.max(totalProjects, p.project_count);
    totalSuccess += p.successful_remediations;
    totalAttempts += p.attempted_remediations;
    matched.push({ signature: p.signature, description: p.description });
    for (const a of p.successful_actions) {
      if (!remediation_suggestions.includes(a)) remediation_suggestions.push(a);
    }
  }

  // Escalation likelihood: more historical occurrences + low success rate ⇒ higher
  const successRate = totalAttempts > 0 ? totalSuccess / totalAttempts : 0;
  escalateScore = Math.min(100,
    Math.round(
      (Math.min(50, totalOccurrences) * 1.5) +
      (totalProjects > 1 ? 25 : 0) +
      ((1 - successRate) * 25),
    ),
  );

  if (record.severity === 'warning' && escalateScore >= 60) {
    predictedSeverity = 'error';
    reasoning.push(`Historical pattern shows similar warnings escalate (${Math.round(successRate * 100)}% remediation success across ${totalAttempts} attempts).`);
  }
  if (record.severity === 'error') {
    predictedSeverity = 'error';
    reasoning.push('Already at error severity; predicting continued escalation.');
  }

  reasoning.push(`Matched ${similar.length} historical pattern${similar.length === 1 ? '' : 's'} with ${totalOccurrences} prior occurrences across ${totalProjects} project${totalProjects === 1 ? '' : 's'}.`);

  if (record.occurrence_count >= 3) {
    reasoning.push(`Already seen ${record.occurrence_count}× — recurrence likely.`);
    escalateScore = Math.min(100, escalateScore + 15);
  }

  if (remediation_suggestions.length === 0) {
    remediation_suggestions.push('No prior successful remediation recorded — recommend a visual review session as a starting point.');
  }

  // Confidence: more patterns + more attempts ⇒ higher confidence
  confidence = Math.min(95, 40 + Math.min(30, totalOccurrences) + Math.min(25, totalAttempts));

  return {
    likely_to_escalate: escalateScore,
    likely_recurrence_count: Math.max(1, Math.round(totalOccurrences / Math.max(1, totalProjects))),
    predicted_severity: predictedSeverity,
    affected_systems: Array.from(affectedSet),
    reasoning,
    remediation_suggestions,
    confidence,
    matched_patterns: matched,
  };
}

/**
 * DB-backed: pull similar patterns, run prediction. Best-effort.
 */
export async function predictForIncident(record: IncidentRecord): Promise<IncidentPrediction> {
  try {
    const { default: CognitivePattern } = await import('../../../models/CognitivePattern');
    const rows = await CognitivePattern.findAll({
      where: { pattern_kind: record.type },
      order: [['occurrence_count', 'DESC']],
      limit: 5,
    });
    const similar: SimilarPattern[] = rows.map((r: any) => ({
      signature: r.signature,
      description: r.description,
      occurrence_count: r.occurrence_count,
      project_count: r.project_count,
      successful_remediations: r.successful_remediations,
      attempted_remediations: r.attempted_remediations,
      successful_actions: r.successful_actions || [],
    }));
    return predictFromPatterns(record, similar);
  } catch (err: any) {
    console.warn('[incidentClassifier] DB read failed:', err?.message);
    return predictFromPatterns(record, []);
  }
}
