import type {
  CaseStudyArtifactAccess,
  CaseStudyArtifactType,
  CaseStudyBuiltByType,
  CaseStudyRepoRole,
  CaseStudyRoadmapStatus,
  CaseStudyTimelineSourceKind,
  CaseStudyVerificationMethod,
} from '../services/caseStudyPublicTypes';

/**
 * caseStudySurfaces - the ONLY file in the case-study module that knows a
 * surface by name, and the only one that knows how a closed vocabulary is
 * spelled for a reader.
 *
 * WHY THAT MATTERS. Spec section 21 promises the same components can render a
 * second surface later. A promise like that is worth nothing while a component
 * contains the word for a surface, because "add another surface" then means
 * "audit every component for the places one is assumed". So the components in
 * `components/caseStudy/` contain no surface name at all: they receive a profile
 * or the fields off a payload, and `caseStudySurfaceNeutrality.test.ts` reads
 * their source and fails if any of the four keys ever appears there.
 *
 * WHY THE LABEL MAPS LIVE HERE TOO. Same rule, one step down. A component that
 * writes "Repository" inline has hardcoded a rendering decision that a second
 * surface may want to make differently, and it has done it somewhere nobody will
 * look. Every closed vocabulary the API can send is therefore spelled exactly
 * once, here, and a component reads it through a map. `Record<Union, string>`
 * means adding a member to a vocabulary stops this file compiling until its
 * label is written.
 *
 * WHAT THIS FILE IS NOT. It is not a second copy of the surface profile the API
 * already returns. `GET /api/public/case-studies` carries `surface` - the hero,
 * the CTA, the section order, the emphasis - and that server-side profile is
 * the authority on all of it. What lives here is the part the server has no
 * business knowing: which client route a surface occupies, and how a closed
 * enum reads in this language.
 */

/* --------------------------------------------------------- surface keys --- */

/**
 * Every surface the contract admits, mirroring `CaseStudySurfaceKey` in
 * `backend/src/types/caseStudy.ts`. Three of them have no page yet; they are
 * representable so that adding one is a routing change rather than a type
 * change.
 */
export type CaseStudySurfaceKey = 'enterprise' | 'training' | 'ai-flotation' | 'refactored';

export const CASE_STUDY_SURFACE_KEYS: readonly CaseStudySurfaceKey[] = Object.freeze([
  'enterprise',
  'training',
  'ai-flotation',
  'refactored',
] as CaseStudySurfaceKey[]);

/** The one surface with a public page in phase 1. */
export const DEFAULT_CASE_STUDY_SURFACE_KEY: CaseStudySurfaceKey = 'enterprise';

/* ------------------------------------------------------ surface profile --- */

export interface CaseStudyLedgerLabels {
  readonly projects: string;
  readonly verifiedOutcomes: string;
  readonly publicRepositories: string;
  readonly shipped: string;
}

export interface CaseStudySurfaceProfile {
  readonly key: CaseStudySurfaceKey;
  /** How this surface names itself in a page title or a breadcrumb. */
  readonly label: string;
  /**
   * `false` means the surface has a contract but no page. Its paths are `null`,
   * so a link to an unbuilt surface has no string to be built from - the reason
   * these are nullable rather than a plausible-looking guess.
   */
  readonly routed: boolean;
  readonly indexPath: string | null;
  readonly detailPathPrefix: string | null;
  readonly ledgerLabels: CaseStudyLedgerLabels;
  /** Spec section 22: shown when filters exclude everything. */
  readonly emptyFiltered: string;
  /** Spec section 22: shown when nothing is published at all. Never an excuse. */
  readonly emptyLibrary: string;
}

const LEDGER_LABELS: CaseStudyLedgerLabels = Object.freeze({
  projects: 'Projects',
  verifiedOutcomes: 'Verified outcomes',
  publicRepositories: 'Public repos',
  shipped: 'Shipped / production',
});

/**
 * The unrouted surfaces share this shape deliberately: an empty profile is more
 * honest than a placeholder page name, and it keeps the record total rather
 * than partial, so `resolveCaseStudySurfaceProfile` never returns `undefined`.
 */
const unrouted = (key: CaseStudySurfaceKey, label: string): CaseStudySurfaceProfile =>
  Object.freeze({
    key,
    label,
    routed: false,
    indexPath: null,
    detailPathPrefix: null,
    ledgerLabels: LEDGER_LABELS,
    emptyFiltered: 'No published projects match these filters.',
    emptyLibrary: "We're verifying the first project records for this proof library.",
  });

export const CASE_STUDY_SURFACES: Readonly<Record<CaseStudySurfaceKey, CaseStudySurfaceProfile>> =
  Object.freeze({
    enterprise: Object.freeze({
      key: 'enterprise' as CaseStudySurfaceKey,
      label: 'Shipped work',
      routed: true,
      indexPath: '/stories',
      detailPathPrefix: '/stories',
      ledgerLabels: LEDGER_LABELS,
      emptyFiltered: 'No published projects match these filters.',
      emptyLibrary: "We're verifying the first project records for this proof library.",
    }),
    training: unrouted('training', 'Training'),
    'ai-flotation': unrouted('ai-flotation', 'AI Flotation'),
    refactored: unrouted('refactored', 'Refactored'),
  });

/** Unknown keys resolve to the default surface rather than crashing a render. */
export function resolveCaseStudySurfaceProfile(
  key: string | null | undefined,
): CaseStudySurfaceProfile {
  const known = CASE_STUDY_SURFACE_KEYS.find((candidate) => candidate === key);
  return CASE_STUDY_SURFACES[known ?? DEFAULT_CASE_STUDY_SURFACE_KEY];
}

/**
 * The href for one record, or `null` when the surface has no page. Returning
 * `null` rather than a string is what stops an unrouted surface producing a link
 * to a 404: there is no value for an anchor to use.
 */
export function caseStudyDetailPath(
  profile: CaseStudySurfaceProfile,
  slug: string,
): string | null {
  if (!profile.routed || !profile.detailPathPrefix || !slug) return null;
  return `${profile.detailPathPrefix}/${slug}`;
}

/* ------------------------------------------------------------ vocabulary --- */

/**
 * WHO verified, which is a different question from HOW MUCH may be shown.
 * `Verified` alone flattens "the client signed a letter" and "the test suite
 * passes" into one word; the surface therefore always renders the method beside
 * the class (spec section 14, PROOF_INTEGRATION section 4).
 */
export const VERIFICATION_METHOD_LABELS: Readonly<
  Record<CaseStudyVerificationMethod, string>
> = Object.freeze({
  client: 'Client',
  repo: 'Repository',
  platform: 'Platform',
  internal: 'Internal',
  self: 'Self-reported',
  manual: 'Reviewed',
});

export const BUILT_BY_LABELS: Readonly<Record<CaseStudyBuiltByType, string>> = Object.freeze({
  learner: 'Learner',
  intern: 'Intern',
  client_team: 'Client team',
  colaberry_team: 'Colaberry team',
  ai_flotation_team: 'AI Flotation team',
  joint_team: 'Joint team',
});

export const ROADMAP_STATUS_LABELS: Readonly<Record<CaseStudyRoadmapStatus, string>> =
  Object.freeze({
    shipped: 'Shipped',
    in_progress: 'In progress',
    paused: 'Paused',
    not_pursued: 'Not pursued',
    unknown: 'Unknown',
  });

/**
 * Text carries the status; the glyph is decoration that survives greyscale. The
 * pairing is the same one `Claim.tsx` uses for evidence, and exists for the same
 * reason: no status in this module may be readable by colour alone.
 */
export const ROADMAP_STATUS_GLYPHS: Readonly<Record<CaseStudyRoadmapStatus, string>> =
  Object.freeze({
    shipped: '✔',
    in_progress: '▸',
    paused: '‖',
    not_pursued: '✕',
    unknown: '·',
  });

export const ARTIFACT_TYPE_LABELS: Readonly<Record<CaseStudyArtifactType, string>> = Object.freeze({
  screenshot: 'Screenshot',
  architecture: 'Architecture',
  // Named for what it IS, not for what it shows. "Photograph" makes no claim
  // about the delivered system; "Product photo" would make one this artifact
  // type exists precisely to prevent.
  photo: 'Photograph',
  demo: 'Demo',
  deck: 'Deck',
  roadmap: 'Roadmap',
  report: 'Report',
  evaluation: 'Evaluation',
  code: 'Code',
  document: 'Document',
  other: 'Artifact',
});

/**
 * `request` is a STATE, never a control. Spec section 23 forbids a fake request
 * or download button, so the label reads as a fact about the artifact rather
 * than as something to press.
 */
export const ARTIFACT_ACCESS_LABELS: Readonly<Record<CaseStudyArtifactAccess, string>> =
  Object.freeze({
    open: 'Open',
    request: 'Available on request',
  });

/**
 * What a control over one artifact says, DERIVED from the type label rather than
 * written out a second time.
 *
 * A second table would drift: somebody adds an artifact type, fills in
 * `ARTIFACT_TYPE_LABELS`, and the button silently keeps saying "Open artifact"
 * with nothing failing. Deriving it means the two can never disagree, and the
 * `Record<CaseStudyArtifactType, string>` above is what makes the derivation
 * total.
 *
 * IT NAMES THE KIND OF THING, NEVER THE OUTCOME. "Open screenshot" is a promise
 * this code can keep - the href is an approved public URL and pressing it opens
 * it. "See the results" would be a promise about what the reader will find,
 * which nothing here has looked at.
 */
export function openArtifactLabel(artifactType: CaseStudyArtifactType): string {
  return `Open ${ARTIFACT_TYPE_LABELS[artifactType].toLowerCase()}`;
}

/**
 * The label on the request control, which is a LINK TO A CONTACT ROUTE and not a
 * fulfilment endpoint - none exists. "Request access" names the errand the
 * reader is starting, and the accessible name says which artifact it is about;
 * neither promises that the artifact will arrive. The control renders at all
 * only when a caller supplies a real destination.
 */
export const ARTIFACT_REQUEST_LABEL = 'Request access';

export const TIMELINE_SOURCE_LABELS: Readonly<Record<CaseStudyTimelineSourceKind, string>> =
  Object.freeze({
    repository: 'Repository evidence',
    delivery: 'Delivery record',
    artifact: 'Artifact',
    milestone: 'Milestone',
  });

export const REPO_ROLE_LABELS: Readonly<Record<CaseStudyRepoRole, string>> = Object.freeze({
  primary: 'Primary',
  frontend: 'Frontend',
  backend: 'Backend',
  agents: 'Agents',
  data: 'Data',
  infra: 'Infrastructure',
  docs: 'Docs',
  evals: 'Evaluations',
  demo: 'Demo',
  other: 'Repository',
});
