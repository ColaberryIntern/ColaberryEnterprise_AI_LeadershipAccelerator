import { QueryTypes } from 'sequelize';
import { sequelize } from '../../config/database';
import { landingPageTraffic, type LandingPageTrafficRow } from './landingPageTraffic';

/**
 * What actually happens to somebody who clicks an ad: the acquisition funnel.
 *
 * WHY THIS EXISTS. /admin/marketing/performance opened on "No marketing funnel data available
 * yet. Data will appear once campaigns have enrolled leads." That graph is driven by the CAMPAIGN
 * engine, which has been paused since August, so it will keep saying that however much traffic
 * arrives. Meanwhile the first paid ads produced 262 visitors and 109 signups in three days, all
 * of it recorded and none of it shown. Ali: "I'm expecting to see a dashboard about this new
 * landing page or more details about what has been clicked on and accounts being created."
 *
 * IT REUSES `landingPageTraffic` RATHER THAN RE-QUERYING. That function already computes
 * visitors, sessions, views, ad clicks, engagement and button presses per page, and page_events
 * is the largest table in the database. A second traffic query would be a second answer to the
 * same question, and the failure mode of two writers over one number is that neither can be
 * trusted afterwards. This adds only the stages traffic cannot see: signup, account, CRM, return.
 *
 * ── THE COUNTING RULES, BECAUSE THEY ARE THE WHOLE CREDIBILITY OF THE PAGE ──
 *
 * PEOPLE, NOT EVENTS. Every stage below counts distinct people except `ad_clicks`, which is
 * sessions and says so. The live page measured 38 pageviews from 16 visitors; a funnel that
 * mixed the two would report a conversion rate of nonsense.
 *
 * NO STAGE IS DERIVED FROM THE ONE ABOVE IT. Each is measured independently, so a later stage can
 * legitimately exceed an earlier one - somebody can sign up on a page visit we failed to track,
 * and an untracked page produces zero visitors and real signups. A funnel that silently clamped
 * each stage to its predecessor would hide exactly that measurement gap.
 *
 * ZERO IS NOT THE SAME AS UNMEASURABLE. A hosted page with no `site_slug` carries no tracker at
 * all, so its zeros mean "cannot be measured". Those pages are counted separately and named,
 * rather than being averaged into a conversion rate they cannot contribute to.
 */

export interface FunnelStage {
  key: string;
  label: string;
  /** Distinct people, except where `unit` says otherwise. */
  count: number;
  unit: 'people' | 'sessions';
  /** What this number does and does not mean, shown under it. */
  note: string;
}

export interface FunnelCampaignRow {
  utm_source: string | null;
  utm_campaign: string | null;
  signups: number;
  accounts: number;
  in_crm: number;
  /** Signups from this campaign who ticked consent. Zero here means a door earning no permission. */
  opted_in: number;
}

export interface AcquisitionFunnel {
  windowDays: number;
  stages: FunnelStage[];
  /** Per-page traffic, straight from `landingPageTraffic`. */
  pages: LandingPageTrafficRow[];
  /** Pages that cannot be measured at all, named rather than shown as zeros. */
  untrackedPages: string[];
  campaigns: FunnelCampaignRow[];
  /** True when nothing at all was recorded in the window, so the UI can say why. */
  empty: boolean;
}

/** The lead sources that come from a landing page or its signup form. */
const LANDING_SOURCES = ['free_signup', 'popup', 'training.colaberry.com', 'training.colaberry.com/thank-you'];

interface DownstreamRow {
  signups: string;
  accounts: string;
  in_crm: string;
  /** Signups who ticked the consent box. The ceiling on anything we can send. */
  opted_in: string;
  returned: string;
}

/**
 * Signup, account, CRM and return, for people who arrived through a landing page.
 *
 * One query rather than four: these all hang off the same set of leads, and splitting them would
 * let the four answers drift apart between round trips.
 */
async function downstream(days: number): Promise<DownstreamRow> {
  const rows = await sequelize.query<DownstreamRow>(
    `WITH landing_leads AS (
       SELECT l.id, lower(btrim(l.email)) AS email, l.ghl_contact_id, l.consent_contact
       FROM leads l
       -- IN (:list), NOT = ANY(:list). Sequelize expands a replacement array into a
       -- comma-separated list, so ANY(...) receives ANY('a','b','c') and Postgres rejects it
       -- with "syntax error at or near ,". This shipped to production and 500'd the endpoint:
       -- the tests mock sequelize.query, so no test could see the SQL, and the manual check
       -- against prod used a literal ARRAY[...] rather than the parameterised form the code
       -- actually sends - validating the shape of the query but not the thing being run.
       WHERE l.source IN (:sources)
         AND l.created_at >= now() - (:days || ' days')::interval
         -- Test fixtures are not people. The e2e suite writes these into production.
         AND lower(l.email) NOT LIKE 'e2e-%'
         AND lower(l.email) NOT LIKE '%@colaberry-test.local'
     )
     SELECT
       (SELECT count(*) FROM landing_leads)::text AS signups,
       (SELECT count(DISTINCT e.email) FROM enrollments e
          WHERE lower(btrim(e.email)) IN (SELECT email FROM landing_leads))::text AS accounts,
       (SELECT count(*) FROM landing_leads WHERE ghl_contact_id IS NOT NULL)::text AS in_crm,
       (SELECT count(*) FROM landing_leads WHERE consent_contact)::text AS opted_in,
       (SELECT count(DISTINCT vs.lead_id) FROM visitor_sessions vs
          JOIN leads l2 ON l2.id = vs.lead_id
          WHERE l2.id IN (SELECT id FROM landing_leads)
            AND vs.started_at::date > l2.created_at::date)::text AS returned`,
    { type: QueryTypes.SELECT, replacements: { days: String(days), sources: LANDING_SOURCES } },
  );
  return rows[0] ?? { signups: '0', accounts: '0', in_crm: '0', opted_in: '0', returned: '0' };
}

/** Signups, accounts and CRM coverage per campaign, so spend can be compared to outcome. */
async function byCampaign(days: number): Promise<FunnelCampaignRow[]> {
  return sequelize.query<FunnelCampaignRow>(
    `SELECT l.utm_source, l.utm_campaign,
            count(*)::int AS signups,
            count(DISTINCT e.email)::int AS accounts,
            count(*) FILTER (WHERE l.ghl_contact_id IS NOT NULL)::int AS in_crm,
            -- Per campaign, because an opt-in rate averaged over every door hides the
            -- door that earns none. apollo, popup and catalog_request were at zero.
            count(*) FILTER (WHERE l.consent_contact)::int AS opted_in
     FROM leads l
     LEFT JOIN enrollments e ON lower(btrim(e.email)) = lower(btrim(l.email))
     -- See the note above: IN, not ANY, because of how replacements expand.
     WHERE l.source IN (:sources)
       AND l.created_at >= now() - (:days || ' days')::interval
       AND lower(l.email) NOT LIKE 'e2e-%'
       AND lower(l.email) NOT LIKE '%@colaberry-test.local'
     GROUP BY l.utm_source, l.utm_campaign
     ORDER BY signups DESC
     LIMIT 20`,
    { type: QueryTypes.SELECT, replacements: { days: String(days), sources: LANDING_SOURCES } },
  );
}

const n = (value: string | number | null | undefined): number => Number(value ?? 0) || 0;

/** The funnel for the last `days` days. */
export async function acquisitionFunnel(days = 30): Promise<AcquisitionFunnel> {
  const [pages, down, campaigns] = await Promise.all([
    landingPageTraffic(days),
    downstream(days),
    byCampaign(days),
  ]);

  const sum = (pick: (p: LandingPageTrafficRow) => number) => pages.reduce((t, p) => t + pick(p), 0);

  const stages: FunnelStage[] = [
    {
      key: 'ad_clicks',
      label: 'Arrived from an ad',
      count: sum((p) => n(p.ad_clicks)),
      unit: 'sessions',
      note: 'Visits carrying a paid click id. Sessions, not people, because one person can click twice.',
    },
    {
      key: 'visitors',
      label: 'Visited a landing page',
      count: sum((p) => n(p.visitors)),
      unit: 'people',
      note: 'Distinct people. Page loads are higher and are shown per page below.',
    },
    {
      key: 'engaged',
      label: 'Read it',
      count: sum((p) => n(p.engaged_visitors)),
      unit: 'people',
      note: 'Scrolled, or stayed long enough to register time on the page. Somebody who presses '
        + 'the hero button straight away registers neither, so this can legitimately sit below '
        + 'the stage beneath it.',
    },
    {
      key: 'cta',
      label: 'Pressed a button',
      count: sum((p) => n(p.cta_clickers)),
      unit: 'people',
      note: 'People, not presses.',
    },
    {
      key: 'signups',
      label: 'Signed up',
      count: n(down.signups),
      unit: 'people',
      note: 'Created an account from a landing page form. Test fixtures excluded.',
    },
    {
      key: 'accounts',
      label: 'Account exists',
      count: n(down.accounts),
      unit: 'people',
      note: 'Signup produced a real enrollment they can log into.',
    },
    {
      key: 'in_crm',
      label: 'Reached the CRM',
      count: n(down.in_crm),
      unit: 'people',
      note: 'Synced to GoHighLevel, so admissions can contact them.',
    },
    {
      // Measured independently like every other stage, and placed here because this is
      // where the funnel actually narrows. "Reached the CRM" says admissions CAN see them;
      // this says whether we are ALLOWED to email them. Without it the page shows 313
      // collapsing to a handful and offers no reason, when most of the gap is simply
      // people nobody has permission to contact. `brandPreferenceGate` reads the per-brand
      // relationship rather than this column, so treat this as the ceiling rather than the
      // verdict: nobody above this line is reachable, and not everybody below it is.
      key: 'opted_in',
      label: 'Allowed us to email them',
      count: n(down.opted_in),
      unit: 'people',
      note: 'Ticked the consent box at signup. Everyone else can only be reached on the site itself.',
    },
    {
      key: 'returned',
      label: 'Came back later',
      count: n(down.returned),
      unit: 'people',
      note: 'Returned on a later day than they signed up. The number that says whether any of this stuck.',
    },
  ];

  const untrackedPages = pages
    .filter((p) => !p.site_slug)
    .map((p) => `${p.brand_slug ?? 'no brand'}/${p.slug}`);

  return {
    windowDays: days,
    stages,
    pages,
    untrackedPages,
    campaigns,
    empty: stages.every((s) => s.count === 0),
  };
}
