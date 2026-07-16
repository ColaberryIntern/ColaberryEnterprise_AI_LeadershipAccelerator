/*
 * ingestNetworkVideos.js
 * -----------------------
 * Ingest ColaberryTV / "network" videos from CCPP (SQL Server, dbo.ADF_ColaberryApp_Content)
 * into the Accelerator Postgres `network_videos` catalog, normalizing every link into a
 * durable {host, provider_video_id, embed_url, watch_url} form and deriving personalization tags.
 *
 * Idempotent: self-ensures the tables (CREATE TABLE IF NOT EXISTS) + UPSERT on
 * (source, external_source_id). Safe to re-run; re-running only updates changed rows.
 *
 * WHERE IT RUNS: inside a backend container that has BOTH the CCPP creds (MSSQL_*) and the
 * Postgres DATABASE_URL — i.e. the prod (or dev) backend container. It reads CCPP, writes PG.
 *   cat backend/src/scripts/ingestNetworkVideos.js | ssh root@<host> \
 *     "docker exec -i -e INGEST_CONFIRM=yes -w /app <backend-container> node -"
 *
 * ENV:
 *   INGEST_CONFIRM=yes            -> actually write (otherwise DRY RUN, no DB changes)
 *   NETWORK_VIDEO_CATEGORIES=...  -> comma list of CCPP ContentType values to ingest.
 *                                    Default: "Marketing,Motivational,Testimonial".
 *
 * See docs/NETWORK_VIDEO_LIBRARY.md for the full data contract + selector spec.
 */
const sql = require('mssql');
const { Client } = require('pg');

const CATEGORIES = (process.env.NETWORK_VIDEO_CATEGORIES || 'Marketing,Motivational,Testimonial')
  .split(',').map(s => s.trim()).filter(Boolean);

// ---- link normalizer (validated against real CCPP URL shapes) ----
function normalizeVideoUrl(raw) {
  const out = { host: 'unknown', providerId: null, embedUrl: null, watchUrl: null, playable: false, note: null };
  if (!raw || !String(raw).trim()) { out.host = 'none'; out.playable = false; out.note = 'no url in source'; return out; }
  let url = String(raw).trim();
  if (url.startsWith('//')) url = 'https:' + url;
  let m = url.match(/player\.vimeo\.com\/progressive_redirect\/playback\/(\d+)/i)
       || url.match(/player\.vimeo\.com\/video\/(\d+)/i)
       || url.match(/vimeo\.com\/(?:manage\/videos\/)?(\d+)/i);
  if (m) {
    const id = m[1];
    const hm = url.match(/vimeo\.com\/(?:manage\/videos\/)?\d+\/([a-z0-9]+)/i);
    const hash = hm ? hm[1] : null;
    out.host = 'vimeo'; out.providerId = hash ? `${id}:${hash}` : id;
    out.embedUrl = hash ? `https://player.vimeo.com/video/${id}?h=${hash}` : `https://player.vimeo.com/video/${id}`;
    out.watchUrl = hash ? `https://vimeo.com/${id}/${hash}` : `https://vimeo.com/${id}`;
    out.playable = true;
    out.note = 'durable embed; playback needs the portal domain on the Vimeo embed allowlist';
    return out;
  }
  m = url.match(/youtu\.be\/([A-Za-z0-9_-]{6,})/)
   || url.match(/youtube\.com\/watch\?[^#]*\bv=([A-Za-z0-9_-]{6,})/)
   || url.match(/youtube\.com\/embed\/([A-Za-z0-9_-]{6,})/)
   || url.match(/youtube\.com\/shorts\/([A-Za-z0-9_-]{6,})/);
  if (m) { out.host = 'youtube'; out.providerId = m[1]; out.embedUrl = `https://www.youtube.com/embed/${m[1]}`; out.watchUrl = `https://youtu.be/${m[1]}`; out.playable = true; return out; }
  const ch = url.match(/youtube\.com\/(@[A-Za-z0-9_.-]+)/);
  if (ch) { out.host = 'youtube_channel'; out.providerId = ch[1]; out.watchUrl = url; out.playable = false; out.note = 'channel link, not a single video'; return out; }
  m = url.match(/cameratag\.com\/assets\/(v-[a-f0-9-]+)\//i);
  if (m) { out.host = 'cameratag'; out.providerId = m[1]; out.embedUrl = url; out.watchUrl = url; out.playable = true; return out; }
  m = url.match(/loom\.com\/(?:share|embed)\/([a-f0-9]{20,})/i);
  if (m) { out.host = 'loom'; out.providerId = m[1]; out.embedUrl = `https://www.loom.com/embed/${m[1]}`; out.watchUrl = `https://www.loom.com/share/${m[1]}`; out.playable = true; return out; }
  if (/1drv\.ms|onedrive/i.test(url)) { out.host = 'onedrive'; out.watchUrl = url; out.note = 'onedrive share link'; return out; }
  out.host = 'other'; out.watchUrl = url; out.note = 'unrecognized host'; return out;
}

// ---- personalization tagger: title/desc -> tags the selector matches on ----
// Includes OCCUPATION terms so a nurse's profile can match a nurse's testimonial.
const TAG_RULES = [
  // tools / skills
  [/\bsql\b/i, 'sql'], [/power\s?bi/i, 'powerbi'], [/tableau/i, 'tableau'], [/\betl\b/i, 'etl'],
  [/ssrs/i, 'ssrs'], [/ssis/i, 'ssis'], [/python/i, 'python'], [/data\s?warehous/i, 'data-warehouse'],
  [/azure/i, 'azure'], [/\baws\b/i, 'aws'], [/machine\s?learning|\bml\b/i, 'ml'], [/data\s?analy/i, 'data-analytics'],
  // industries
  [/health|hospital|clinic|patient/i, 'healthcare'], [/financ|bank|accounting/i, 'finance'],
  [/\bsales\b/i, 'sales'], [/insurance/i, 'insurance'], [/logistic|supply\s?chain|warehouse/i, 'logistics'],
  [/manufactur|factory/i, 'manufacturing'], [/educat|school|university/i, 'education'], [/retail|store/i, 'retail'],
  [/real\s?estate/i, 'real-estate'], [/utilit|energy|power/i, 'energy'], [/govern|public sector|military|federal/i, 'government'],
  [/hospitality|restaurant|hotel/i, 'hospitality'], [/transport|trucking|driver/i, 'transportation'],
  // occupations (drive the nurse<->nurse style match)
  [/nurse|nursing|\brn\b|cna\b/i, 'nurse'], [/teacher|educator|professor|instructor/i, 'teacher'],
  [/accountant|bookkeep|cpa\b/i, 'accountant'], [/engineer/i, 'engineer'], [/analyst/i, 'analyst'],
  [/manager|supervisor|director/i, 'manager'], [/pharmac/i, 'pharmacist'], [/lawyer|attorney|legal/i, 'legal'],
  [/marketer|marketing/i, 'marketing-pro'], [/recruiter|hr\b|human resources/i, 'hr'],
  [/military|veteran|army|navy|air force|marine/i, 'veteran'], [/customer service|call center|support rep/i, 'customer-service'],
  [/waiter|waitress|server|barista|cashier/i, 'service-worker'], [/mechanic|technician/i, 'technician'],
  // themes / life-stage
  [/career\s?(switch|change|transition|pivot)/i, 'career-switch'], [/no\s?(it|tech|coding)|non[-\s]?tech|zero\s?it|no experience/i, 'non-technical'],
  [/mother|mom|dad|father|parent|family/i, 'parent'], [/immigra|visa|h1b|h-1b|refugee/i, 'immigrant'],
  [/interview/i, 'interview'], [/salary|money|financial literacy|income|raise/i, 'financial-literacy'],
  [/success|hired|got a job|landed|new job|offer/i, 'success-story'], [/motivat|inspir|amazing|hungry|never give up|dont quit|don't quit/i, 'motivation'],
];
function deriveTags(category, title, desc) {
  const hay = `${title || ''} ${desc || ''}`;
  const tags = new Set([String(category).toLowerCase()]);
  for (const [re, tag] of TAG_RULES) if (re.test(hay)) tags.add(tag);
  return Array.from(tags);
}

// Derive a durable thumbnail from the provider id when the source has none, so
// every row has a poster we can "just grab" (YouTube has no thumbnail in CCPP).
function deriveThumb(host, id) {
  if (!id) return null;
  if (host === 'youtube') return `https://img.youtube.com/vi/${id}/hqdefault.jpg`;
  if (host === 'cameratag') return `https://www.cameratag.com/assets/${id}/qvga_thumb.jpg`;
  return null;
}

const DDL = `
CREATE TABLE IF NOT EXISTS network_videos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source varchar(64) NOT NULL DEFAULT 'colaberrytv',
  external_source_id integer,
  category varchar(64) NOT NULL,
  title text, description text, host varchar(32), provider_video_id varchar(160),
  embed_url text, watch_url text, original_url text, thumbnail_url text, duration_seconds integer,
  tags jsonb NOT NULL DEFAULT '[]'::jsonb, playable boolean NOT NULL DEFAULT true,
  needs_attention text, is_active boolean NOT NULL DEFAULT true,
  ingested_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (source, external_source_id)
);
CREATE INDEX IF NOT EXISTS idx_network_videos_active_cat ON network_videos(category) WHERE is_active;
CREATE INDEX IF NOT EXISTS idx_network_videos_tags ON network_videos USING gin(tags);
CREATE TABLE IF NOT EXISTS network_video_views (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  enrollment_id uuid NOT NULL, video_id uuid NOT NULL REFERENCES network_videos(id) ON DELETE CASCADE,
  category varchar(64), first_seen_at timestamptz NOT NULL DEFAULT now(), last_seen_at timestamptz NOT NULL DEFAULT now(),
  seen_count integer NOT NULL DEFAULT 1, last_timeline_card_id uuid, context jsonb NOT NULL DEFAULT '{}'::jsonb,
  UNIQUE (enrollment_id, video_id)
);
CREATE INDEX IF NOT EXISTS idx_nvv_enrollment_cat ON network_video_views(enrollment_id, category);
CREATE INDEX IF NOT EXISTS idx_nvv_enrollment_card ON network_video_views(enrollment_id, last_timeline_card_id);
`;

(async () => {
  const dry = process.env.INGEST_CONFIRM !== 'yes';
  const mcfg = {
    server: process.env.MSSQL_HOST, port: parseInt(process.env.MSSQL_PORT || '1433', 10),
    user: process.env.MSSQL_USER, password: process.env.MSSQL_PASS, database: process.env.MSSQL_DATABASE || 'CCPP',
    options: { encrypt: false, trustServerCertificate: true, enableArithAbort: true }, requestTimeout: 90000, connectionTimeout: 30000,
  };
  const inList = CATEGORIES.map(c => `'${c.replace(/'/g, "''")}'`).join(',');
  const mssqlPool = await new sql.ConnectionPool(mcfg).connect();
  const rs = await mssqlPool.request().query(`
    SELECT ID, ContentType, IsActive, ContentName, ContentDesc,
      CASE WHEN ContentLink IS NULL OR ContentLink='' THEN ContentOriginalLink ELSE ContentLink END AS Url,
      ContentThumbnail
    FROM ADF_ColaberryApp_Content
    WHERE ContentType IN (${inList})
    ORDER BY ContentType, ID DESC`);
  await mssqlPool.close();

  const rows = rs.recordset.map(r => {
    const n = normalizeVideoUrl(r.Url);
    const needs = n.host === 'vimeo' ? 'vimeo-domain-allowlist'
      : n.host === 'youtube_channel' ? 'channel-link-no-video-id'
      : n.host === 'none' ? 'no-url-in-source'
      : (!n.playable ? n.note : null);
    return {
      external_source_id: r.ID, category: String(r.ContentType).toLowerCase(),
      title: r.ContentName, description: r.ContentDesc,
      host: n.host, provider_video_id: n.providerId, embed_url: n.embedUrl, watch_url: n.watchUrl,
      original_url: r.Url,
      thumbnail_url: (r.ContentThumbnail && String(r.ContentThumbnail).trim()) ? r.ContentThumbnail : deriveThumb(n.host, n.providerId),
      tags: deriveTags(r.ContentType, r.ContentName, r.ContentDesc),
      playable: n.playable, needs_attention: needs, is_active: r.IsActive === 1 || r.IsActive === true,
    };
  });

  const by = (k) => rows.reduce((a, r) => (a[r[k]] = (a[r[k]] || 0) + 1, a), {});
  console.log('categories:', CATEGORIES.join(','), '| source rows:', rows.length);
  console.log('by category:', JSON.stringify(by('category')), '| by host:', JSON.stringify(by('host')));

  if (dry) { console.log('\n[DRY RUN] set INGEST_CONFIRM=yes to write. No DB changes made.'); return; }

  const pg = new Client({ connectionString: process.env.DATABASE_URL });
  await pg.connect();
  await pg.query(DDL);
  let ins = 0, upd = 0;
  for (const r of rows) {
    const res = await pg.query(`
      INSERT INTO network_videos
        (source, external_source_id, category, title, description, host, provider_video_id,
         embed_url, watch_url, original_url, thumbnail_url, tags, playable, needs_attention, is_active)
      VALUES ('colaberrytv',$1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11::jsonb,$12,$13,$14)
      ON CONFLICT (source, external_source_id) DO UPDATE SET
        category=EXCLUDED.category, title=EXCLUDED.title, description=EXCLUDED.description,
        host=EXCLUDED.host, provider_video_id=EXCLUDED.provider_video_id, embed_url=EXCLUDED.embed_url,
        watch_url=EXCLUDED.watch_url, original_url=EXCLUDED.original_url, thumbnail_url=EXCLUDED.thumbnail_url,
        tags=EXCLUDED.tags, playable=EXCLUDED.playable, needs_attention=EXCLUDED.needs_attention,
        is_active=EXCLUDED.is_active, updated_at=now()
      RETURNING (xmax = 0) AS inserted`,
      [r.external_source_id, r.category, r.title, r.description, r.host, r.provider_video_id,
       r.embed_url, r.watch_url, r.original_url, r.thumbnail_url, JSON.stringify(r.tags),
       r.playable, r.needs_attention, r.is_active]);
    res.rows[0].inserted ? ins++ : upd++;
  }
  const tot = await pg.query(`SELECT category, count(*) n, sum(case when playable then 1 else 0 end) playable FROM network_videos GROUP BY category ORDER BY category`);
  await pg.end();
  console.log(`\n[WRITE DONE] inserted=${ins} updated=${upd}`);
  tot.rows.forEach(x => console.log('  ' + JSON.stringify(x)));
})().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
