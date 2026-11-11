/**
 * hireTalentProjection - the allow-list a stranger receives for one listed person.
 *
 * NAMED FIELDS ONLY, built from TWO things that are already public: the person's public
 * portfolio projection (`projectPublicPortfolio`, the same allow-list /portfolio/:slug
 * serves) and the public projection of each of their Hire case studies
 * (`projectPublicDetail`). This file never reads a database row and never sees an email:
 * if the portfolio projection did not send a field, this file cannot send it either.
 *
 * PURE. No I/O, no clock beyond what the caller passes.
 */
import type { PublicPortfolio } from '../career/careerPortfolioPublicProjection';
import type { PublicCaseStudyDetail } from '../../types/caseStudyPublic';
import { trackFor, type HireTrack } from './hireTalentQuery';

export type AvailabilityKind = 'open' | 'interviewing' | 'placed';
export const AVAILABILITY_KINDS: readonly AvailabilityKind[] = ['open', 'interviewing', 'placed'];

/** One Hire case study as the directory and the portfolio show it. */
export interface HireCaseStudyCard {
  readonly slug: string;
  readonly title: string;
  readonly summary: string | null;
  readonly industry: string | null;
  readonly featured: boolean;
  readonly publishedAt: string;
  readonly heroMetric: { readonly value: string; readonly label: string } | null;
  readonly outcomes: readonly { readonly value: string; readonly label: string }[];
  readonly look: HireCaseStudyLook;
}

/**
 * What makes one case study look like itself on a card (Ali, 2026-11-11: Kes's nine "on the
 * surface they all look the same - we need to use our differentiators"). Every field is one
 * the record's public projection already serves on its own page; nothing new is exposed.
 * `coverImageUrl` may be origin-relative (`/site-v2/...`): the site resolves it against the
 * platform API origin.
 */
export interface HireCaseStudyLook {
  readonly coverImageUrl: string | null;
  readonly walkthroughSeconds: number | null;
  readonly capability: string | null;
  readonly verified: boolean;
  readonly workflowDiagram: boolean;
  readonly decisions: number;
  readonly repositories: number;
}

const count = (v: unknown): number => (Array.isArray(v) ? v.length : 0);

/** The card's look, from the public projection only. Exported for its tests. */
export function lookOf(detail: PublicCaseStudyDetail): HireCaseStudyLook {
  const video = detail.walkthroughVideo;
  const secs = video && typeof video.durationSeconds === 'number' && video.durationSeconds > 0
    ? Math.round(video.durationSeconds) : null;
  const priv = typeof detail.privateRepositoryCount === 'number' && detail.privateRepositoryCount > 0
    ? detail.privateRepositoryCount : 0;
  return {
    coverImageUrl: text(detail.heroImageUrl) ?? text(video?.posterUrl),
    walkthroughSeconds: secs,
    capability: text(detail.primaryCapability),
    verified: detail.verificationClass === 'verified',
    workflowDiagram: detail.visualStory != null,
    decisions: count(detail.decisions),
    repositories: count(detail.repositories) + priv,
  };
}

export interface HireTalentCard {
  readonly slug: string;
  readonly name: string;
  readonly avatarUrl: string | null;
  readonly role: string | null;
  readonly track: HireTrack | null;
  readonly headline: string | null;
  readonly location: string | null;
  readonly cohort: string | null;
  readonly availability: { readonly label: string; readonly kind: AvailabilityKind } | null;
  readonly caseStudyCount: number;
  readonly verifiedCommitCount: number;
  readonly capabilities: readonly { readonly name: string; readonly proven: boolean }[];
  readonly signature: Pick<HireCaseStudyCard, 'slug' | 'title' | 'industry' | 'heroMetric'> | null;
  readonly spotlight: boolean;
}

/** The page-row facts the card needs beyond the portfolio projection. */
export interface HirePageFacts {
  readonly slug: string;
  readonly availabilityStatus: string | null;
  readonly availabilityLabel: string | null;
  readonly hireSpotlight: boolean;
}

const text = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v.trim() : null);

function metricOf(m: PublicCaseStudyDetail['heroMetrics'][number]): { value: string; label: string } | null {
  const value = text(m?.valueDisplay);
  const label = text(m?.label);
  if (!value || !label) return null;
  return { value: m.unit ? `${value} ${m.unit}` : value, label };
}

/** A Hire case study from its public projection: only what that projection already shows. */
export function toHireCaseStudyCard(
  detail: PublicCaseStudyDetail,
  facts: { featured: boolean; publishedAt: string },
): HireCaseStudyCard {
  const outcomes = (Array.isArray(detail.heroMetrics) ? detail.heroMetrics : [])
    .map(metricOf).filter((m): m is { value: string; label: string } => m !== null);
  return {
    slug: detail.slug,
    title: detail.title,
    summary: text(detail.standfirst),
    industry: text(detail.industry),
    featured: facts.featured,
    publishedAt: facts.publishedAt,
    heroMetric: outcomes[0] ?? null,
    outcomes: outcomes.slice(0, 4),
    look: lookOf(detail),
  };
}

/** Signature = a featured publication first, then the most recently published (SPEC §1). */
export function pickSignature(cards: readonly HireCaseStudyCard[]): HireCaseStudyCard | null {
  const ordered = [...cards].sort((a, b) => {
    if (a.featured !== b.featured) return a.featured ? -1 : 1;
    if (a.publishedAt !== b.publishedAt) return a.publishedAt < b.publishedAt ? 1 : -1;
    return a.slug.localeCompare(b.slug);
  });
  return ordered[0] ?? null;
}

/** Self-reported availability: rendered only when BOTH a known kind and a label are set. */
export function availabilityOf(facts: HirePageFacts): HireTalentCard['availability'] {
  const kind = AVAILABILITY_KINDS.find((k) => k === facts.availabilityStatus);
  const label = text(facts.availabilityLabel);
  return kind && label ? { kind, label: label.slice(0, 80) } : null;
}

export function toTalentCard(
  portfolio: PublicPortfolio,
  facts: HirePageFacts,
  cases: readonly HireCaseStudyCard[],
): HireTalentCard {
  const id = portfolio.identity;
  const role = text(id.headline);
  const signature = pickSignature(cases);
  const caps = (Array.isArray(portfolio.capabilities) ? portfolio.capabilities : [])
    .map((c) => ({ name: String(c.name), proven: c.proven === true }))
    .sort((a, b) => Number(b.proven) - Number(a.proven))
    .slice(0, 3);
  return {
    slug: facts.slug,
    name: id.full_name,
    avatarUrl: text(id.avatar_data_url),
    role,
    track: trackFor(role),
    headline: null, // no projected field carries a one-line pitch distinct from the role; never composed here
    location: text(id.location),
    cohort: text(id.cohort_name),
    availability: availabilityOf(facts),
    caseStudyCount: cases.length,
    verifiedCommitCount: Array.isArray(portfolio.verified_commits) ? portfolio.verified_commits.length : 0,
    capabilities: caps,
    signature: signature
      ? { slug: signature.slug, title: signature.title, industry: signature.industry, heroMetric: signature.heroMetric }
      : null,
    spotlight: facts.hireSpotlight,
  };
}

/** Free-text match over the card's own public words. Nothing outside the card is searched. */
export function matchesQuery(card: HireTalentCard, cases: readonly HireCaseStudyCard[], q: string): boolean {
  const needle = q.trim().toLowerCase();
  if (!needle) return true;
  const hay = [
    card.name, card.role, card.location, card.cohort,
    ...card.capabilities.map((c) => c.name),
    ...cases.flatMap((c) => [c.title, c.summary, c.industry]),
  ].filter(Boolean).join(' ').toLowerCase();
  return hay.includes(needle);
}
