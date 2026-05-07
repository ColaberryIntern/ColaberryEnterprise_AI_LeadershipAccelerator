/**
 * issueClusterEngine — group raw UIElementFeedback rows into UX issue
 * clusters so remediation can be sequenced + scored at the cluster level
 * instead of one-issue-at-a-time.
 *
 * Two entry points:
 *   classifyRow(row)        — pure classifier. Called by uiFeedbackStore at
 *                             createFeedback time so cluster_signature +
 *                             cluster_type get persisted on the row. Stable
 *                             across heuristic upgrades because the
 *                             classification is frozen at write time.
 *   clusterOpenFeedback()   — DB-backed read. Reads open rows for a BP and
 *                             groups them by their persisted cluster_signature.
 *
 * Cluster identity is a readable string: "{cluster_type}:{capability_id}:{page_route}".
 * NOT sha256 — readability matters when debugging "why did this cluster
 * appear in the regression-prone report."
 *
 * Phase 10.5 §A.1.
 */

export type ClusterType =
  | 'hierarchy'
  | 'cta'
  | 'spacing'
  | 'accessibility'
  | 'workflow'
  | 'navigation'
  | 'cognition_overload';

export interface FeedbackRowForClassification {
  readonly issue_type: string | null;
  readonly title: string | null;
  readonly description: string | null;
  readonly suggestion: string | null;
  readonly source_step: string | null;
  readonly element_type: string | null;
  readonly element_text: string | null;
}

export interface ClusterClassification {
  readonly cluster_type: ClusterType;
  readonly cluster_signature: string;
}

export interface IssueCluster {
  readonly cluster_signature: string;
  readonly cluster_type: ClusterType;
  readonly capability_id: string;
  readonly page_route: string;
  readonly affected_regions: ReadonlyArray<string>;
  readonly issue_count: number;
  /** Worst severity in the cluster. */
  readonly severity: 'low' | 'medium' | 'high';
  /** 1-7 (lower = more urgent). Driven by cluster_type via TYPE_PRIORITY. */
  readonly remediation_priority: number;
  readonly likely_root_cause: string;
}

const TYPE_PRIORITY: Record<ClusterType, number> = {
  accessibility: 1,
  hierarchy: 2,
  navigation: 3,
  cta: 4,
  spacing: 5,
  workflow: 6,
  cognition_overload: 7,
};

const SEVERITY_RANK: Record<string, number> = { low: 0, medium: 1, high: 2 };
const RANK_TO_SEVERITY: Array<'low' | 'medium' | 'high'> = ['low', 'medium', 'high'];

const ROOT_CAUSE: Record<ClusterType, string> = {
  accessibility: 'Missing semantic markup, contrast, or keyboard affordances on this page.',
  hierarchy: 'Visual weight + heading order do not match the information hierarchy users expect.',
  navigation: 'Primary navigation surfaces are unclear, mislabeled, or buried.',
  cta: 'Call-to-action elements are not the visually dominant interaction on the page.',
  spacing: 'Whitespace + density do not separate distinct UI groupings cleanly.',
  workflow: 'A multi-step interaction has missing feedback, dead ends, or excess steps.',
  cognition_overload: 'Too much information competing for the user\'s attention at once.',
};

/**
 * Pure classifier. Returns null if the row has no source_step/issue_type
 * AND no recognizable signal — caller should leave cluster_signature null.
 */
export function classifyRow(
  row: FeedbackRowForClassification,
  capabilityId: string,
  pageRoute: string,
): ClusterClassification | null {
  const cluster_type = inferClusterType(row);
  if (!cluster_type) return null;
  const route = (pageRoute || '/').trim() || '/';
  const cluster_signature = `${cluster_type}:${capabilityId}:${route}`;
  return { cluster_type, cluster_signature };
}

function inferClusterType(row: FeedbackRowForClassification): ClusterType | null {
  const text = `${row.title || ''} ${row.description || ''} ${row.suggestion || ''} ${row.issue_type || ''}`.toLowerCase();

  // Source-step priors are the strongest signal. The UI Advisor steps map
  // closely to cluster types; only override on strong text signals.
  if (row.source_step === 'mobile_responsiveness') {
    if (/contrast|aria|sr-only|screen reader|keyboard|focus/i.test(text)) return 'accessibility';
    return 'workflow';
  }

  if (/(aria|wcag|alt text|sr-only|screen reader|contrast|keyboard|focus|tab order|role=|landmark)/i.test(text)) {
    return 'accessibility';
  }
  if (/(heading|h1|h2|h3|hierarchy|visual weight|emphasis|font size|font-weight|primary action overshadow)/i.test(text)) {
    return 'hierarchy';
  }
  if (/(nav|navigation|menu|breadcrumb|link label|sidebar|sitemap|wayfind)/i.test(text)) {
    return 'navigation';
  }
  if (/(cta|call to action|button prominen|primary button|secondary button|conversion|sign up|get started)/i.test(text)) {
    return 'cta';
  }
  if (/(spacing|margin|padding|whitespace|gap|crowd|density)/i.test(text)) {
    return 'spacing';
  }
  if (/(workflow|multi-step|wizard|stepper|dead end|loop|backtrack|missing feedback|no confirmation|orphan)/i.test(text)) {
    return 'workflow';
  }
  if (/(overload|too much|cognitive load|chartjunk|noise|busy|cluttered)/i.test(text)) {
    return 'cognition_overload';
  }

  // Fallbacks by source_step.
  if (row.source_step === 'layout_hierarchy') return 'hierarchy';
  if (row.source_step === 'usability') return 'workflow';

  // Last-resort fallback by issue_type.
  if (row.issue_type === 'accessibility') return 'accessibility';
  if (row.issue_type === 'hierarchy') return 'hierarchy';
  if (row.issue_type === 'navigation') return 'navigation';

  return null;
}

/**
 * Build IssueCluster[] from a list of OPEN UIElementFeedback-shaped rows.
 *
 * Pure function — caller does the DB read so this engine stays testable
 * without a database. Rows missing cluster_signature are classified
 * lazily here; the persisted version is preferred when present.
 */
export function clusterOpenFeedback(
  rows: ReadonlyArray<{
    cluster_signature: string | null;
    cluster_type: string | null;
    issue_type: string | null;
    title: string | null;
    description: string | null;
    suggestion: string | null;
    source_step: string | null;
    element_type: string | null;
    element_selector: string | null;
    element_text: string | null;
    severity: string | null;
    capability_id: string;
    page_route: string | null;
  }>,
): IssueCluster[] {
  const groups = new Map<string, {
    cluster_signature: string;
    cluster_type: ClusterType;
    capability_id: string;
    page_route: string;
    rows: typeof rows[number][];
    severityRank: number;
  }>();

  for (const row of rows) {
    let signature = row.cluster_signature;
    let type = (row.cluster_type as ClusterType | null) || null;

    if (!signature || !type) {
      const cls = classifyRow(row, row.capability_id, row.page_route || '/');
      if (!cls) continue;
      signature = cls.cluster_signature;
      type = cls.cluster_type;
    }

    const existing = groups.get(signature);
    const sevRank = SEVERITY_RANK[row.severity || 'medium'] ?? 1;
    if (existing) {
      existing.rows.push(row);
      if (sevRank > existing.severityRank) existing.severityRank = sevRank;
    } else {
      groups.set(signature, {
        cluster_signature: signature,
        cluster_type: type as ClusterType,
        capability_id: row.capability_id,
        page_route: row.page_route || '/',
        rows: [row],
        severityRank: sevRank,
      });
    }
  }

  return Array.from(groups.values())
    .map(g => ({
      cluster_signature: g.cluster_signature,
      cluster_type: g.cluster_type,
      capability_id: g.capability_id,
      page_route: g.page_route,
      affected_regions: collectRegions(g.rows),
      issue_count: g.rows.length,
      severity: RANK_TO_SEVERITY[g.severityRank] ?? 'medium',
      remediation_priority: TYPE_PRIORITY[g.cluster_type],
      likely_root_cause: ROOT_CAUSE[g.cluster_type],
    }))
    .sort((a, b) => a.remediation_priority - b.remediation_priority);
}

function collectRegions(rows: ReadonlyArray<{ element_selector: string | null; element_text: string | null }>): string[] {
  const seen = new Set<string>();
  for (const r of rows) {
    const key = (r.element_selector || r.element_text || '').slice(0, 80).trim();
    if (key) seen.add(key);
    if (seen.size >= 6) break;
  }
  return Array.from(seen);
}
