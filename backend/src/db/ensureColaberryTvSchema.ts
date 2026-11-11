import { sequelize } from '../config/database';

/**
 * Colaberry TV (Campus v20 N3, Basecamp C134): the staff-managed playlist of shorts that plays on Colaberry Now, and an audit row
 * for every change to it. Two additive tables, created lazily and memoized like community_board_seen (server.ts is over the
 * 500-line ceiling). IF NOT EXISTS throughout.
 *
 * THE SEED. The nine shorts are the real ones from Piyush P.'s thread (the v20 design prototype lists their IDs). They are
 * inserted only when BOTH tables are empty, so a short staff deleted never comes back on the next boot (its delete left an audit
 * row). Titles start NULL and are filled from YouTube's oEmbed (tvService), never invented; lengths start NULL and are shown only
 * once the player reports one.
 *
 * FAILURE: the seed runs in one transaction, so it lands whole or not at all; a failed first run clears the memo and the next call
 * retries. Rolling the feature back leaves these two tables unused and harmless.
 */
export const COLABERRY_TV_SEED_IDS: readonly string[] = [
  'Pa5J5T6MZok', 'o0Pd4j4Temc', '0vGEO9Vziw8', 'YmreEFAD2_Q', 'UfDOP1j8n8Q', 'sBfP9CyNe9Y', 'oyBEKJn_bpM', 'qKvnQkahU-U', 'DS47jZuWF0g',
];

export const COLABERRY_TV_STATEMENTS: string[] = [
  `CREATE TABLE IF NOT EXISTS colaberry_tv_videos (
     id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
     youtube_id TEXT NOT NULL UNIQUE,
     title TEXT,
     duration_s INTEGER,
     audience TEXT NOT NULL DEFAULT 'all' CHECK (audience IN ('all', 'explorers', 'members')),
     on_air BOOLEAN NOT NULL DEFAULT TRUE,
     position INTEGER NOT NULL DEFAULT 0,
     created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
     updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
   )`,
  `CREATE TABLE IF NOT EXISTS colaberry_tv_audit (
     id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
     video_id UUID,
     youtube_id TEXT,
     action TEXT NOT NULL,
     actor TEXT NOT NULL,
     detail JSONB NOT NULL DEFAULT '{}'::jsonb,
     at TIMESTAMPTZ NOT NULL DEFAULT NOW()
   )`,
  'CREATE INDEX IF NOT EXISTS colaberry_tv_videos_position_idx ON colaberry_tv_videos (position)',
];

/** Seed only into a playlist that has never been used: no videos AND no audit history. One statement, so it is atomic. */
export const COLABERRY_TV_SEED_SQL = `
  INSERT INTO colaberry_tv_videos (youtube_id, position)
  SELECT v.id, v.pos FROM unnest(ARRAY[:ids]::text[]) WITH ORDINALITY AS v(id, pos)
  WHERE NOT EXISTS (SELECT 1 FROM colaberry_tv_videos) AND NOT EXISTS (SELECT 1 FROM colaberry_tv_audit)
  ON CONFLICT (youtube_id) DO NOTHING`;

type Runner = (sql: string, replacements?: Record<string, unknown>) => Promise<unknown>;
const defaultRunner: Runner = (sql, replacements) => sequelize.query(sql, replacements ? { replacements } : undefined);

let inflight: Promise<void> | null = null;

export function ensureColaberryTvSchema(run: Runner = defaultRunner): Promise<void> {
  if (!inflight) {
    inflight = (async () => {
      for (const s of COLABERRY_TV_STATEMENTS) await run(s);
      await run(COLABERRY_TV_SEED_SQL, { ids: [...COLABERRY_TV_SEED_IDS] });
    })().catch((err) => { inflight = null; throw err; });
  }
  return inflight;
}

/** Test seam: forget the memo. */
export function __resetColaberryTvSchemaForTests(): void { inflight = null; }
