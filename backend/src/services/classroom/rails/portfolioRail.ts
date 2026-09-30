import PortfolioArtifact from '../../../models/PortfolioArtifact';
import { Rail, RailContext, RailTile, omitIfEmpty } from './types';
import { ART, PORTFOLIO_ART } from './railArt';

/**
 * Portfolio pieces, newest first.
 *
 * A HONEST LIMIT, STATED RATHER THAN FAKED. The brief asked for "newly
 * published portfolios" from across the cohort. `portfolio_artifacts` has no
 * publication or visibility concept at all — no `published_at`, no `visibility`,
 * no share scope. There is therefore no such thing as a published portfolio
 * piece in this system yet, and no way to know which of a peer's artifacts they
 * would be willing to show.
 *
 * Showing every peer's artifacts because the column that would have stopped us
 * does not exist would be a privacy decision made by omission. So this rail
 * shows THE VIEWER'S OWN recent pieces, which is defensible today, and the
 * cohort version waits for a publication concept somebody designs on purpose.
 * The gap is recorded here rather than in a backlog nobody reads.
 *
 * What it is still good for: a student who has finished six artifacts and never
 * looked at them since is the common case, and the rail puts their own evidence
 * back in front of them in the week they are being asked to build more.
 */

const TILE_LIMIT = 6;

/** `architecture_doc` reads like a database column; students should not see it. */
const KIND_LABEL: Record<string, string> = {
  architecture_doc: 'Architecture doc',
  prompt_library: 'Prompt library',
  case_study: 'Case study',
  reflection: 'Reflection',
  implementation_notes: 'Implementation notes',
  presentation: 'Presentation',
};

const KIND_GLYPH: Record<string, string> = {
  architecture_doc: '\u{1F3D7}',
  prompt_library: '\u{1F9EA}',
  case_study: '\u{1F4D6}',
  reflection: '\u{1F4AD}',
  implementation_notes: '\u{1F527}',
  presentation: '\u{1F4CA}',
};

function labelFor(kind: string): string {
  return KIND_LABEL[kind] ?? kind.replace(/_/g, ' ');
}

export async function resolvePortfolioRail(ctx: RailContext): Promise<Rail | null> {
  const rows = await PortfolioArtifact.findAll({
    where: { enrollment_id: ctx.enrollmentId },
    order: [['created_at', 'DESC']],
    limit: TILE_LIMIT,
  });

  const tiles: RailTile[] = rows.map((a) => ({
    id: a.id,
    title: a.title,
    detail: a.summary ?? null,
    meta: labelFor(String(a.kind)),
    image_url: PORTFOLIO_ART[String(a.kind)] ?? ART.portfolioDefault,
    glyph: KIND_GLYPH[String(a.kind)] ?? '\u{1F4C1}',
    stamp: labelFor(String(a.kind)).toUpperCase(),
    action: {
      label: 'Open piece',
      href: `/portal/portfolio?artifact=${encodeURIComponent(a.id)}`,
      kind: 'primary',
    },
  }));

  return omitIfEmpty({
    surface: 'portfolio',
    label: 'Your portfolio',
    count_label: tiles.length > 0 ? `${tiles.length} piece${tiles.length === 1 ? '' : 's'}` : null,
    href: '/portal/portfolio',
    tiles,
  });
}
