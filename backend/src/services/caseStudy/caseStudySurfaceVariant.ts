import type {
  CaseStudyBuilderProfile,
  CaseStudyDecision,
  CaseStudyMetricEntry,
  CaseStudySnapshotContent,
  CaseStudySurfaceKey,
  CaseStudySurfaceVariant,
} from '../../types/caseStudy';
import type {
  PublicCaseStudyBuilder,
  PublicCaseStudyContributor,
  PublicCaseStudyDecision,
} from '../../types/caseStudyPublic';
import { PUBLISHABLE_SURFACE_KEYS } from '../../types/caseStudy';
import { arr, safeHttpUrl, text } from './caseStudyPublicSections';

/**
 * caseStudySurfaceVariant — one record, one audience at a time.
 *
 * WHY THIS EXISTS. Ali, 2026-09-16, on the CORA story: write the learner's
 * story for training.colaberry.com first and stop for review, without letting
 * that change touch the Enterprise or AI Flotation page. Until now every
 * surface read the same prose; the only per-surface words were the
 * publication row's title and summary overrides. A variant is the narrative
 * equivalent: words one surface says differently, kept inside the snapshot so
 * they are versioned, gated and carried across resync like every other edit.
 *
 * WHAT A VARIANT MAY CHANGE, AND WHAT IT MAY NOT. Words: the standfirst, the
 * situation, the measurement narrative, a metric's notes, the contributor
 * list, the builder profile, the decision cards and the closing paragraph.
 * Never a figure: a metric's
 * `valueDisplay` and `payload` are not in the variant type, so the numbers a
 * reader sees are the same on every surface and the publish gate's rules on
 * them still hold. The claim scan reads every variant string.
 *
 * PURE. `resolveSurfaceContent` returns the canonical content when the surface
 * has no variant, and the SAME object, so a record written before variants
 * existed projects byte-identically.
 *
 * CONSENT TRAVELS WITH THE CONTENT. A variant's contributors go through the
 * same `projectContributors` gate as the canonical list, and the builder's
 * biography is released only when the profile's name is one the gate let
 * through for that same content. A variant cannot name somebody the record
 * would not.
 */

export interface ResolvedSurfaceContent {
  readonly content: CaseStudySnapshotContent;
  /** The variant's own standfirst, which outranks the publication row's summary override. */
  readonly standfirst: string | null;
  readonly builder: CaseStudyBuilderProfile | null;
  readonly decisions: readonly CaseStudyDecision[];
  /** The closing paragraph, the variant's or the canonical one. */
  readonly closing: string | null;
}

function variantFor(content: CaseStudySnapshotContent, surfaceKey: CaseStudySurfaceKey): CaseStudySurfaceVariant | null {
  const variants = content?.surfaceVariants;
  if (!variants || typeof variants !== 'object') return null;
  if (!(PUBLISHABLE_SURFACE_KEYS as readonly string[]).includes(surfaceKey)) return null;
  const v = variants[surfaceKey];
  return v && typeof v === 'object' ? v : null;
}

function overlayNotes(
  metrics: readonly CaseStudyMetricEntry[] | undefined,
  notes: CaseStudySurfaceVariant['metricNotes'],
): readonly CaseStudyMetricEntry[] | undefined {
  if (!metrics || !notes) return metrics;
  return metrics.map((m) => {
    const note = m && notes[m.key];
    if (!note) return m;
    const measurement = { ...(m.measurement ?? { limitations: [] }) };
    if (text(note.baseline)) (measurement as { baseline?: string }).baseline = text(note.baseline);
    if (text(note.sample)) (measurement as { sample?: string }).sample = text(note.sample);
    return { ...m, measurement };
  });
}

/** The content this surface reads: canonical, with the variant's words laid over it. */
export function resolveSurfaceContent(
  content: CaseStudySnapshotContent, surfaceKey: CaseStudySurfaceKey,
): ResolvedSurfaceContent {
  const v = variantFor(content, surfaceKey);
  const canonicalBuilder = content?.builder ?? null;
  const canonicalDecisions = arr<CaseStudyDecision>(content?.decisions);
  const canonicalClosing = text(content?.closing) || null;
  if (!v) return { content, standfirst: null, builder: canonicalBuilder, decisions: canonicalDecisions, closing: canonicalClosing };
  const measurement = content.measurement
    ? {
      ...content.measurement,
      narrative: v.measurementNarrative ?? content.measurement.narrative,
      metrics: overlayNotes(content.measurement.metrics, v.metricNotes) ?? content.measurement.metrics,
    }
    : content.measurement;
  const merged: CaseStudySnapshotContent = {
    ...content,
    situation: v.situation ?? content.situation,
    measurement,
    heroMetrics: overlayNotes(content.heroMetrics, v.metricNotes) ?? content.heroMetrics,
    contributors: v.contributors ?? content.contributors,
  };
  return {
    content: merged,
    standfirst: text(v.standfirst) || null,
    builder: v.builder ?? canonicalBuilder,
    decisions: v.decisions ? arr<CaseStudyDecision>(v.decisions) : canonicalDecisions,
    closing: text(v.closing) || canonicalClosing,
  };
}

/**
 * The builder card for the wire. The biography (name, intro, progression,
 * links) crosses only when `displayName` is one of the contributors the
 * consent gate projected as named for this content; the role title, the
 * contribution and the skills are project facts and always cross. `provenance`
 * loses its note, which may name the person who confirmed the facts.
 */
export function projectBuilder(
  profile: CaseStudyBuilderProfile | null,
  contributors: readonly PublicCaseStudyContributor[],
): PublicCaseStudyBuilder | null {
  if (!profile || typeof profile !== 'object') return null;
  const roleTitle = text(profile.roleTitle);
  const contribution = text(profile.contribution);
  if (!roleTitle || !contribution) return null;
  const name = text(profile.displayName);
  const named = name.length > 0
    && contributors.some((c) => c.displayMode === 'named' && c.displayName === name);
  const source = profile.provenance?.source;
  return {
    name: named ? name : null,
    roleTitle,
    organization: text(profile.organization) || null,
    initials: text(profile.initials) || null,
    intro: named ? arr(profile.intro).map(text).filter(Boolean) : [],
    progression: named ? arr(profile.progression).map(text).filter(Boolean) : [],
    contribution,
    skills: arr(profile.skills)
      .map((s) => ({ label: text(s?.label), evidence: text(s?.evidence) }))
      .filter((s) => s.label && s.evidence),
    profileUrl: named ? safeHttpUrl(profile.profileUrl) : null,
    photoUrl: named ? safeHttpUrl(profile.photoUrl) : null,
    provenance: {
      source: source === 'approved_profile' || source === 'repository' ? source : 'user_confirmed',
      confirmedAt: text(profile.provenance?.confirmedAt),
    },
  };
}

/**
 * Decision cards for the wire; a card missing any of its four parts is not
 * drawn. The stage pin and the closing figure are optional and cross as null
 * when absent.
 */
export function projectDecisions(decisions: readonly CaseStudyDecision[]): PublicCaseStudyDecision[] {
  const out: PublicCaseStudyDecision[] = [];
  for (const d of decisions) {
    if (!d || typeof d !== 'object') continue;
    const card = {
      key: text(d.key), title: text(d.title), problem: text(d.problem),
      decision: text(d.decision), evidence: text(d.evidence), consequence: text(d.consequence),
    };
    if (Object.values(card).every(Boolean)) {
      out.push({ ...card, stage: text(d.stage) || null, figure: text(d.figure) || null });
    }
  }
  return out;
}
