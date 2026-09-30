import {
  SECTION_HEADINGS, isSectionSupported, visibleSections,
} from '../publicV2/storyDetailV2Model';
import { BUILT_BY_LABELS, ROADMAP_STATUS_LABELS, VERIFICATION_METHOD_LABELS } from '../../config/caseStudySurfaces';
import type {
  CaseStudyDetail, CaseStudySurfacePreview, CaseStudySurfaceKey,
} from '../../services/caseStudyAdminTypes';
import type {
  CaseStudySectionKey, PublicCaseStudyDetail, PublicSurfaceView,
} from '../../services/caseStudyPublicTypes';

/**
 * caseStudySurfaceLabModel — every decision the four-lens surface lab makes that
 * is not markup.
 *
 * WHY A SEPARATE MODULE. The lab's whole claim is that four audiences meet the
 * same verified record in a different order, and that no lens can change a fact
 * or hide who built the work. Those are rules, and a rule inside a component can
 * only be tested by rendering the component — which is how "the canonical facts
 * are identical across all four tabs" quietly becomes "identical for this
 * fixture". Everything here is a pure function over a preview payload.
 *
 * WHAT THIS MODULE MAY NOT DO, and it is the shorter and more important list.
 *
 * 1. IT MAY NOT INVENT A NUMBER. There is no draft change count in this system
 *    and this module does not manufacture one — see `draftState`.
 * 2. IT MAY NOT WRITE. Nothing here calls an API. Switching a lens is a read.
 * 3. IT MAY NOT RE-IMPLEMENT THE PAGE. Band visibility comes from
 *    `visibleSections`/`isSectionSupported` in `storyDetailV2Model`, the same
 *    functions `/stories/:slug` uses. A lab with its own idea of which bands
 *    render is a lab that agrees with itself and not with production.
 */

/* ------------------------------------------------------------------ tabs --- */

export interface SurfaceLensTab {
  readonly key: CaseStudySurfaceKey;
  readonly label: string;
  /**
   * The question this lens's reader arrived with. It is the whole justification
   * for the band order below it, and putting it on screen is what stops the tabs
   * reading as four skins.
   */
  readonly readerQuestion: string;
}

/**
 * The four lenses, in the order the product owner named them. `enterprise` is
 * first and is the live surface; the other three are previews of surfaces that
 * are not publishable.
 */
export const SURFACE_LENS_TABS: readonly SurfaceLensTab[] = Object.freeze([
  {
    key: 'enterprise',
    label: 'Enterprise',
    readerQuestion: 'Can you help my organization respond to this change?',
  },
  {
    key: 'training',
    label: 'Training',
    readerQuestion: 'Will this prepare me for the work AI is creating?',
  },
  {
    key: 'ai-flotation',
    label: 'AI Flotation',
    readerQuestion: 'Can you actually design and deliver sophisticated AI-native systems?',
  },
  {
    key: 'refactored',
    label: 'Refactored',
    readerQuestion: 'How was this build architected, governed and verified?',
  },
] as SurfaceLensTab[]);

/** The one surface that is live, and the only one an admin may publish to here. */
export const LIVE_SURFACE_KEY: CaseStudySurfaceKey = 'enterprise';

/* -------------------------------------------------------- canonical truth --- */

export interface CanonicalFact {
  readonly term: string;
  readonly value: string;
}

/**
 * The five values that must be IDENTICAL on all four tabs.
 *
 * They are read off the projection, which is built from the snapshot, and the
 * snapshot does not know which surface it is being read for. So if switching a
 * lens changes any of these, the lens model has been violated — a lens has
 * reached past framing and into fact. Rendering them first, above the band list,
 * is what makes that visible to an operator in the second it takes to click a
 * tab, rather than after a publish.
 *
 * `null` fields are omitted rather than printed as a placeholder, for the same
 * reason `heroFacts` omits them: an "Undisclosed" row is something a reader can
 * mistake for a fact about the record.
 */
export function canonicalFacts(projection: PublicCaseStudyDetail | null): readonly CanonicalFact[] {
  if (!projection) return [];
  const candidates: readonly (readonly [string, string | null])[] = [
    ['Built by', projection.builtBy ? BUILT_BY_LABELS[projection.builtBy] : null],
    ['Organization', projection.organizationLabel],
    ['Verification', projection.verificationClass],
    [
      'Method',
      projection.verificationMethod
        ? VERIFICATION_METHOD_LABELS[projection.verificationMethod] : null,
    ],
    [
      'Production status',
      projection.productionStatus ? ROADMAP_STATUS_LABELS[projection.productionStatus] : null,
    ],
  ];
  return candidates
    .filter((pair): pair is readonly [string, string] => !!pair[1])
    .map(([term, value]) => ({ term, value }));
}

/* ------------------------------------------------------------ draft state --- */

export type DraftStateKind =
  | 'no-snapshot' | 'not-published' | 'live-matches-draft' | 'draft-ahead';

export interface DraftState {
  readonly kind: DraftStateKind;
  readonly label: string;
}

/**
 * Draft-versus-live as a STATE, never a count.
 *
 * A "3 unpublished changes" badge would imply a field-level diff, and nothing in
 * this system computes one: snapshots are content-hashed wholes, not tracked
 * field edits, and no code anywhere compares two snapshots' contents. A number
 * here would be a number a reader trusts and nobody can derive — which is
 * precisely the failure mode the whole Case Study module exists to prevent. If a
 * true count is ever wanted it has to be a counted diff of snapshot content
 * paths, and it has to be computed, not guessed.
 *
 * What IS derivable, from operands already on this payload, is whether the live
 * snapshot is the latest one. That is what this returns.
 */
export function draftState(
  detail: CaseStudyDetail | null,
  surfaceKey: CaseStudySurfaceKey,
): DraftState {
  const latest = detail?.latestSnapshot ?? null;
  if (!latest) return { kind: 'no-snapshot', label: 'nothing to publish — no snapshot exists yet' };

  const publication = detail?.publications.find((p) => p.surfaceKey === surfaceKey) ?? null;
  const publishedId = publication?.publishedSnapshotId ?? null;
  if (!publishedId) {
    return { kind: 'not-published', label: `not published — draft is v${latest.version}` };
  }
  if (publishedId === latest.id) {
    return { kind: 'live-matches-draft', label: `live matches draft — v${latest.version}` };
  }
  return {
    kind: 'draft-ahead',
    // No count. "Ahead" is the honest claim: the live snapshot is not the latest
    // one. How MUCH it differs is not knowable from a content hash.
    label: `draft is ahead — draft v${latest.version} is not the published version`,
  };
}

/* ------------------------------------------------------ publication state --- */

export interface PublicationState {
  readonly label: string;
  readonly live: boolean;
  /** The gate's own verdict, verbatim from `preview.decision`. Never softened. */
  readonly gateLabel: string;
  readonly gateAllows: boolean;
  readonly blockerCodes: readonly string[];
}

/**
 * Whether this surface is live, and what the REAL gate would do about it.
 *
 * A refusing gate deliberately does not block the preview — an operator has to
 * be able to see what a lens looks like before deciding whether to make it
 * publishable at all. So the two facts are reported side by side and neither is
 * allowed to stand in for the other: "not published" is a state, "would refuse"
 * is a decision, and a surface can be either without being the other.
 */
export function publicationState(
  detail: CaseStudyDetail | null,
  preview: CaseStudySurfacePreview | null,
  surfaceKey: CaseStudySurfaceKey,
): PublicationState {
  const publication = detail?.publications.find((p) => p.surfaceKey === surfaceKey) ?? null;
  const live = publication?.status === 'published' && !!publication.publishedSnapshotId;
  const decision = preview?.decision ?? null;
  return {
    label: live ? 'published — live on this surface' : 'not published on this surface',
    live,
    gateLabel: !decision
      ? 'gate: not evaluated yet'
      : decision.allowed ? 'gate: would publish' : 'gate: would refuse',
    gateAllows: !!decision?.allowed,
    blockerCodes: decision?.codes ?? [],
  };
}

/* ------------------------------------------------------ lens composition --- */

export interface LensBand {
  readonly key: CaseStudySectionKey;
  /** 1-based position in this lens's reading order. */
  readonly position: number;
  readonly heading: string;
  /** On the attribution floor: this lens could not hide it even if it tried. */
  readonly required: boolean;
}

export interface LensComposition {
  readonly bands: readonly LensBand[];
  /**
   * Bands the surface asked for that this RECORD cannot support. Reported so an
   * operator can tell "this lens suppressed it" from "the record has nothing to
   * say", which look identical on a rendered page and are completely different
   * problems.
   */
  readonly unsupported: readonly CaseStudySectionKey[];
  /**
   * Bands the surface asked to hide and could not, because they are on the
   * floor. Empty on all four shipped profiles — every one of them hides nothing
   * — and non-empty the moment somebody tries.
   */
  readonly floorOverrides: readonly CaseStudySectionKey[];
}

/**
 * What this lens would actually render, in its order.
 *
 * `visibleSections` is imported rather than reimplemented on purpose: it is the
 * function `/stories/:slug` calls, so the lab cannot disagree with the page. The
 * two extra lists exist because the page has no reason to distinguish "hidden by
 * the lens" from "the record is silent", and a review tool has every reason to.
 */
export function lensComposition(
  projection: PublicCaseStudyDetail | null,
  surface: PublicSurfaceView | null,
): LensComposition {
  if (!projection || !surface) return { bands: [], unsupported: [], floorOverrides: [] };

  const floor = new Set<CaseStudySectionKey>(surface.requiredSections ?? []);
  const visible = visibleSections(projection, surface);
  const bands = visible.map((key, index) => ({
    key,
    position: index + 1,
    heading: SECTION_HEADINGS[key] || key,
    required: floor.has(key),
  }));

  const order = surface.sectionOrder.length > 0 ? surface.sectionOrder : [];
  const shown = new Set<CaseStudySectionKey>(visible);
  const unsupported = order.filter(
    (key) => !shown.has(key) && !isSectionSupported(projection, key),
  );
  const floorOverrides = surface.hiddenSections.filter((key) => floor.has(key));

  return { bands, unsupported, floorOverrides };
}

/**
 * A short, factual line about what a band carries on THIS record — counts and
 * labels read straight off the projection.
 *
 * Every branch reports something the record states. None of them describes,
 * summarises or characterises: a review tool that paraphrases the content is a
 * second narrator, and the entire point of this module is that there is one
 * narrative and four orders over it.
 */
export function bandSummary(
  projection: PublicCaseStudyDetail | null,
  key: CaseStudySectionKey,
): string {
  if (!projection) return '';
  switch (key) {
    case 'hero':
      return `${projection.heroMetrics.length} hero figure(s)`;
    case 'situation':
      return projection.situation ? `${projection.situation.body.length} paragraph(s)` : '';
    case 'build':
      return `${projection.timeline.length} timeline entr(ies)`;
    case 'architecture': {
      const a = projection.architecture;
      if (!a) return '';
      return `${a.stack.length} stack, ${a.capabilities.length} capabilities, `
        + `${a.integrations.length} integrations`;
    }
    case 'measurement':
      return `${projection.measurement?.metrics.length ?? 0} metric(s) with evidence`;
    case 'roadmap':
      return `${projection.roadmap.length} entr(ies)`;
    case 'contributors':
      return `${projection.contributors.length} named, `
        + `${projection.anonymousContributorCount} not named`;
    case 'artifacts':
      return `${projection.artifacts.length} artifact(s)`;
    case 'repositories':
      return `${projection.repositories.length} linked, `
        + `${projection.privateRepositoryCount} withheld`;
    case 'cta':
      return '';
    default:
      return '';
  }
}
