/**
 * caseStudySnapshotView — read one snapshot's `content` blob into shapes the
 * review panels can render.
 *
 * WHY IT IS DEFENSIVE. `CaseStudySnapshotSummary.content` arrives as
 * `Record<string, unknown>`: it is a JSONB column written by the sync, and a
 * snapshot built by an older version of the builder is a normal thing to find in
 * the table. Every reader below coerces rather than asserts, so an unexpected
 * shape renders as an empty section instead of throwing a blank page at the
 * person whose job is to review it.
 *
 * WHAT IT NEVER PRODUCES. There is no reader here for an enrollment id, a
 * student email or a card id, because the snapshot contract has no such field.
 * Repository owner/name ARE read — this is the admin side, where the reviewer
 * must see what they attached — and nothing in this module may be reused on a
 * public surface, which reads the projection instead.
 */

const asRecord = (value: unknown): Record<string, unknown> =>
  (value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown> : {});

const asArray = (value: unknown): unknown[] => (Array.isArray(value) ? value : []);
const str = (value: unknown): string => (typeof value === 'string' ? value : '');
const bool = (value: unknown): boolean => value === true;
const strList = (value: unknown): string[] => asArray(value).filter(
  (v): v is string => typeof v === 'string',
);

export interface MetricView {
  /** Dotted path of this metric within the snapshot, for a human override. */
  readonly path: string;
  readonly key: string;
  readonly label: string;
  readonly valueDisplay: string;
  readonly unit: string;
  readonly metricType: string;
  readonly isHeadline: boolean;
  readonly publishable: boolean;
  readonly verificationClass: string;
  readonly verificationMethod: string;
  readonly verifiedAt: string;
  readonly hasEvidenceRecord: boolean;
  readonly baseline: string;
  readonly sample: string;
  readonly measured: string;
  readonly methodology: string;
  readonly limitations: string[];
}

function metricAt(value: unknown, path: string): MetricView {
  const row = asRecord(value);
  const verification = asRecord(row.verification);
  const measurement = asRecord(row.measurement);
  return {
    path,
    key: str(row.key),
    label: str(row.label),
    valueDisplay: str(row.valueDisplay),
    unit: str(row.unit),
    metricType: str(row.metricType),
    isHeadline: bool(row.isHeadline),
    publishable: bool(row.publishable),
    verificationClass: str(verification.class) || 'pending',
    verificationMethod: str(verification.method),
    verifiedAt: str(verification.verifiedAt),
    // The evidence ROW ID is internal and never rendered; that one exists is
    // exactly what a reviewer needs to know, and all they are shown.
    hasEvidenceRecord: str(verification.evidenceId).length > 0,
    baseline: str(measurement.baseline),
    sample: str(measurement.sample),
    measured: str(measurement.measured),
    methodology: str(measurement.methodology),
    limitations: strList(measurement.limitations),
  };
}

export interface ContributorView {
  readonly path: string;
  readonly displayMode: string;
  readonly displayName: string;
  readonly role: string;
  readonly kind: string;
  readonly consentRecordedAt: string;
}

export interface ArtifactView {
  readonly path: string;
  readonly artifactType: string;
  readonly title: string;
  readonly description: string;
  readonly sourceType: string;
  readonly visibility: string;
  readonly status: string;
  readonly publicUrl: string;
}

export interface TimelineView {
  readonly date: string;
  readonly label: string;
  readonly detail: string;
  readonly sourceKind: string;
}

export interface SnapshotView {
  readonly title: string;
  readonly slug: string;
  readonly standfirst: string;
  readonly summary: string;
  readonly organizationDisplayName: string;
  readonly organizationIdentityMode: string;
  readonly organizationNamingConsent: boolean;
  readonly builderIdentityMode: string;
  readonly builderNamingConsent: boolean;
  readonly situationHeading: string;
  readonly situationBody: string[];
  readonly heroMetrics: MetricView[];
  readonly measurementMetrics: MetricView[];
  readonly timeline: TimelineView[];
  readonly stack: string[];
  readonly capabilities: string[];
  readonly integrations: string[];
  readonly architectureNarrative: string[];
  readonly roadmap: { readonly label: string; readonly status: string }[];
  readonly contributors: ContributorView[];
  readonly artifacts: ArtifactView[];
  readonly repositories: { readonly label: string; readonly role: string; readonly visibility: string }[];
  readonly industry: string;
  readonly primaryCapability: string;
}

export const EMPTY_SNAPSHOT_VIEW: SnapshotView = {
  title: '', slug: '', standfirst: '', summary: '', organizationDisplayName: '',
  organizationIdentityMode: '', organizationNamingConsent: false, builderIdentityMode: '',
  builderNamingConsent: false, situationHeading: '', situationBody: [], heroMetrics: [],
  measurementMetrics: [], timeline: [], stack: [], capabilities: [], integrations: [],
  architectureNarrative: [], roadmap: [], contributors: [], artifacts: [], repositories: [],
  industry: '', primaryCapability: '',
};

export function readSnapshot(content: Record<string, unknown> | null | undefined): SnapshotView {
  if (!content) return EMPTY_SNAPSHOT_VIEW;
  const identity = asRecord(content.identity);
  const situation = asRecord(content.situation);
  const architecture = asRecord(content.architecture);
  const measurement = asRecord(content.measurement);
  const taxonomy = asRecord(content.taxonomy);

  return {
    title: str(identity.title),
    slug: str(identity.slug),
    standfirst: str(identity.standfirst),
    summary: str(identity.summary),
    organizationDisplayName: str(identity.organizationDisplayName),
    organizationIdentityMode: str(identity.organizationIdentityMode),
    organizationNamingConsent: bool(identity.organizationNamingConsent),
    builderIdentityMode: str(identity.builderIdentityMode),
    builderNamingConsent: bool(identity.builderNamingConsent),
    situationHeading: str(situation.heading),
    situationBody: strList(situation.body),
    heroMetrics: asArray(content.heroMetrics).map((m, i) => metricAt(m, `heroMetrics.${i}`)),
    measurementMetrics: asArray(measurement.metrics)
      .map((m, i) => metricAt(m, `measurement.metrics.${i}`)),
    timeline: asArray(content.buildTimeline).map((entry) => {
      const row = asRecord(entry);
      return {
        date: str(row.date), label: str(row.label), detail: str(row.detail),
        sourceKind: str(row.sourceKind),
      };
    }),
    stack: strList(architecture.stack),
    capabilities: strList(architecture.capabilities),
    integrations: strList(architecture.integrations),
    architectureNarrative: strList(architecture.narrative),
    roadmap: asArray(content.roadmap).map((entry) => {
      const row = asRecord(entry);
      return { label: str(row.label), status: str(row.status) };
    }),
    contributors: asArray(content.contributors).map((entry, i) => {
      const row = asRecord(entry);
      return {
        path: `contributors.${i}`,
        displayMode: str(row.displayMode),
        displayName: str(row.displayName),
        role: str(row.role),
        kind: str(row.kind),
        consentRecordedAt: str(row.consentRecordedAt),
      };
    }),
    artifacts: asArray(content.artifacts).map((entry, i) => {
      const row = asRecord(entry);
      return {
        path: `artifacts.${i}`,
        artifactType: str(row.artifactType),
        title: str(row.title),
        description: str(row.description),
        sourceType: str(row.sourceType),
        visibility: str(row.visibility),
        status: str(row.status),
        publicUrl: str(row.publicUrl),
      };
    }),
    repositories: asArray(content.repositories).map((entry, i) => {
      const row = asRecord(entry);
      const visibility = str(row.visibility);
      return {
        // Only a PUBLIC repository is named. `private` and `unknown` both fail
        // closed to a positional handle, so a private repository's identity
        // never reaches a screen (see `repoLabel` for the full reasoning).
        label: visibility === 'public'
          ? `${str(row.repoOwner)}/${str(row.repoName)}`
          : `Private repository #${i + 1}`,
        role: str(row.role),
        visibility,
      };
    }),
    industry: str(taxonomy.industry),
    primaryCapability: str(taxonomy.primaryCapability),
  };
}

/**
 * The snapshot's provenance map, flattened to `field -> source` rows. Spec §18
 * asks for provenance "where practical"; the map is keyed by dotted field path
 * and each entry is an object naming the source, so this renders whatever the
 * builder recorded rather than assuming a fixed set of fields.
 */
export interface ProvenanceRow {
  readonly field: string;
  readonly source: string;
  readonly detail: string;
}

export function readProvenance(
  provenance: Record<string, unknown> | null | undefined,
): ProvenanceRow[] {
  if (!provenance) return [];
  return Object.keys(provenance).sort().map((field) => {
    const entry = provenance[field];
    if (typeof entry === 'string') return { field, source: entry, detail: '' };
    const row = asRecord(entry);
    const source = str(row.source) || str(row.sourceType) || 'unknown';
    const detail = [str(row.sourceRef), str(row.note), str(row.generatedBy)]
      .filter((v) => v.length > 0).join(' · ');
    return { field, source, detail };
  });
}
