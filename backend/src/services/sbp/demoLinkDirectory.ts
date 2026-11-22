/**
 * demoLinkDirectory - every project's Connected Demo, and the one link that actually opens.
 *
 * The admin Factory Command Center shows this so staff can open any student's demo without
 * asking them for a URL. Three states, and the distinction between the middle two is the whole
 * point:
 *
 *   published - a demo exists AND the share flag is on. There is a working public link.
 *   generated - a demo exists and has NOT been published. There is deliberately NO link.
 *   none      - no demo yet.
 *
 * ## Why an unpublished token never leaves Postgres
 *
 * `demo_share_token` is minted when the demo is GENERATED and survives revocation, so an
 * unpublished project usually has one. Returning it and then dropping it in TypeScript would put
 * a live-looking token into a response, a browser's memory and anybody's network tab, for a link
 * that answers 404. The `CASE WHEN demo_share_enabled` in the query means the database decides,
 * so the token is not in the result set at all. The requirement was "a project with no demo
 * renders no demo yet, never a broken link", and the cheapest way to honor it is to make a broken
 * link unavailable rather than filtered.
 *
 * ## Why raw SQL rather than the model
 *
 * `event_count` is `jsonb_array_length(demo_spec->'events')`, which no Sequelize attribute
 * expresses. Reading it in the database instead of hauling every `demo_spec` into Node matters at
 * both ends: a spec is tens of kilobytes, there are hundreds of projects, and every value inside
 * one is content a student wrote. Counting in Postgres keeps all of it there. `jsonb_typeof` is
 * checked first because `jsonb_array_length` ERRORS rather than returning null when the value is
 * not an array, and a hand-written spec from a student's repository is exactly where that happens.
 */
import { QueryTypes } from 'sequelize';
import { sequelize } from '../../config/database';
import { publicDemoUrl } from '../../routes/demoRoutes';

export type DemoLinkState = 'published' | 'generated' | 'none';

export interface DemoLinkRow {
  project_id: string;
  name: string | null;
  enrollment_id: string | null;
  state: DemoLinkState;
  /** Non-null ONLY for `published`. See the header: an unpublished token is a link that 404s. */
  url: string | null;
  event_count: number;
}

export interface DemoLinkDirectory {
  rows: DemoLinkRow[];
  counts: Record<DemoLinkState, number>;
  /** True when the cap cut the list off, so the panel can say so rather than imply completeness. */
  truncated: boolean;
}

/** The hard cap. A panel is for scanning; a thousand rows is a report, and a different request. */
export const DEMO_DIRECTORY_MAX = 500;

const SQL = `
  SELECT id,
         name,
         enrollment_id,
         (demo_spec IS NOT NULL) AS has_spec,
         (demo_share_enabled IS TRUE) AS enabled,
         CASE WHEN demo_share_enabled IS TRUE THEN demo_share_token ELSE NULL END AS share_token,
         CASE WHEN jsonb_typeof(demo_spec -> 'events') = 'array'
              THEN jsonb_array_length(demo_spec -> 'events')
              ELSE 0 END AS event_count
    FROM projects
   WHERE archived_at IS NULL
   ORDER BY created_at DESC
   LIMIT :limit
`;

interface RawRow {
  id: string;
  name: string | null;
  enrollment_id: string | null;
  has_spec: boolean;
  enabled: boolean;
  share_token: string | null;
  event_count: number | string;
}

/**
 * Typed at the call site, as CLAUDE.md requires of raw SQL.
 *
 * `event_count` is declared `number | string` on purpose rather than optimistically: `pg` returns
 * `bigint` and `numeric` as strings, and while `jsonb_array_length` is an `int4` today, a reader
 * should not have to know that to trust the number. `Number()` once, here, so no consumer repeats
 * the question.
 */
function shape(raw: RawRow): DemoLinkRow {
  const state: DemoLinkState = !raw.has_spec ? 'none' : raw.enabled ? 'published' : 'generated';
  return {
    project_id: raw.id,
    name: raw.name ?? null,
    enrollment_id: raw.enrollment_id ?? null,
    state,
    // Belt and braces: the query already withholds the token unless enabled, and this refuses to
    // build a url without one. Two independent reasons a broken link cannot be produced.
    url: state === 'published' && raw.share_token ? publicDemoUrl(raw.share_token) : null,
    event_count: Number(raw.event_count) || 0,
  };
}

export async function listDemoLinks(limit = 200): Promise<DemoLinkDirectory> {
  const capped = Math.max(1, Math.min(Math.floor(limit) || 1, DEMO_DIRECTORY_MAX));
  const raw = (await sequelize.query(SQL, {
    replacements: { limit: capped + 1 },
    type: QueryTypes.SELECT,
  })) as unknown as RawRow[];

  // `capped + 1` above, so "there are more" is a fact rather than a guess from a full page.
  const truncated = raw.length > capped;
  const rows = (truncated ? raw.slice(0, capped) : raw).map(shape);

  const counts: Record<DemoLinkState, number> = { published: 0, generated: 0, none: 0 };
  for (const row of rows) counts[row.state] += 1;

  return { rows, counts, truncated };
}
