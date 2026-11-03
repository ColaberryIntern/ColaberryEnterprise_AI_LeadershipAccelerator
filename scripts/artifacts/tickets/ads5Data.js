/**
 * ADS-5's facts, in one place, so the one-page visual and the verification document cannot
 * disagree.
 *
 * Every number here was read from `accelerator_prod` on 2026-11-03 in session
 * CC-20261102-k9r4 by three read-only scripts run inside the running backend container, over a
 * rolling 30-day window. Nothing is estimated. Where the method cannot answer a question it is
 * listed under NOT_ESTABLISHED rather than softened.
 *
 * The ticket as filed assumed the ads were untagged and asked Ali to go and tag them in Ads
 * Manager. The measurement says they already are. These numbers are the evidence for that
 * reversal, which is why they are committed rather than left in a scratchpad.
 */

const TICKET = 'ADS-5';
const TICKET_ID = 10467338811;
const TICKET_URL = `https://app.basecamp.com/3945211/buckets/7463955/todos/${TICKET_ID}`;
const LIST_URL = 'https://app.basecamp.com/3945211/buckets/7463955/todolists/10467338643';

const SESSION = 'CC-20261102-k9r4';
const MEASURED_ON = '2026-11-03';
const WINDOW_DAYS = 30;
const DB = 'accelerator_prod';

/**
 * Ad clicks, identified by `fbclid`. Meta appends fbclid itself, independently of our own
 * tagging, so this finds ad traffic even when every UTM tag is missing — which is the case the
 * ticket was written for. Keying off utm_source instead would have hidden exactly that case.
 */
const SESSIONS = {
  total: 1480,
  withCampaign: 1464,
  metaIdShaped: 1464,
  withSource: 1464,
  withMedium: 1464,
  withContent: 1464,
  withTerm: 1464,
  untagged: 16,
  firstTaggedClick: '2026-10-21',
  latestTaggedClick: '2026-11-03',
};

/**
 * The ids actually observed, per parameter. This table is the whole argument that Meta's
 * dynamic substitution is live rather than a literal typed once into the URL field: a literal
 * cannot produce three different utm_content values, and it cannot produce values that differ
 * by level.
 */
const OBSERVED = [
  { param: 'utm_campaign', distinct: 1, values: [['52708443249234', 1464]] },
  { param: 'utm_term', distinct: 1, values: [['52708443249434', 1464]] },
  {
    param: 'utm_content',
    distinct: 3,
    values: [['52708445138434', 1446], ['52708443249634', 16], ['52710275348234', 2]],
  },
  { param: 'utm_source', distinct: 2, values: [['fb', 930], ['ig', 534]] },
  { param: 'utm_medium', distinct: 1, values: [['paid', 1464]] },
];

const CAMPAIGN_ID = '52708443249234';
const CAMPAIGN_CONTENT_PAIRS = 3;
const UNEXPANDED_MACROS = 0;

/**
 * Landing-page signups, filtered on the same `source IN (...)` list the report itself uses
 * (LANDING_SOURCES in services/marketing/acquisitionFunnel.ts). The report joins
 * `leads.utm_campaign`, not the session's, so this is measured separately rather than inferred
 * from the session numbers.
 */
const LEADS = {
  total: 450,
  withCampaign: 410,
  withContent: 0,
  withTerm: 0,
  newestSignup: '2026-11-03T02:14:22Z',
  newestTagged: '2026-11-03T02:14:22Z',
  sourceShapes: [['fb', 296], ['ig', 114], ['(empty)', 40]],
  pipedShapes: 0,
};

/**
 * Leads joined to their sessions. This is the number that decides whether ADS-3 is hardening a
 * theoretical fragility or fixing a live loss, because it separates "organic signup, correctly
 * untagged" from "ad signup whose tag was lost".
 */
const JOIN = {
  landingSignups: 450,
  fromAd: 411,
  adAndTagged: 410,
  adButUntagged: 1,
  notFromAd: 39,
  taggedWithoutAdSession: 0,
};

/** Each conclusion with the single measurement that carries it. */
const FINDINGS = [
  {
    verdict: 'ok',
    claim: 'Every ad that delivered a click is fully tagged.',
    evidence: `${SESSIONS.withCampaign} of ${SESSIONS.total} ad clicks (98.9%) carry utm_source, `
      + 'utm_medium, utm_campaign, utm_content and utm_term. All five, not some.',
  },
  {
    verdict: 'ok',
    claim: "Meta's dynamic substitution is live — the ids are not a literal typed once.",
    evidence: `${CAMPAIGN_CONTENT_PAIRS} distinct (campaign, content) pairs, three different `
      + `utm_content ids, and ${UNEXPANDED_MACROS} clicks carrying an unexpanded {{macro}}. `
      + 'A hardcoded URL cannot produce three content values.',
  },
  {
    verdict: 'ok',
    claim: 'The join the profitability report performs already works.',
    evidence: `${JOIN.adAndTagged} of ${JOIN.fromAd} signups with a provable ad click carry the `
      + `campaign id (99.8%). The ${JOIN.notFromAd} without one had no ad click on record and `
      + 'correctly carry no campaign — zero false attributions.',
  },
  {
    verdict: 'bad',
    claim: 'Creative-level attribution is dead at the lead, so you cannot tell the three ads apart.',
    evidence: `${SESSIONS.withContent} sessions carry utm_content and utm_term; ${LEADS.withContent} `
      + `of ${LEADS.total} leads do. The identify backfill copies only utm_source, utm_campaign `
      + 'and utm_medium (trackingController.ts:604-610), and C104 — which would make the signup '
      + 'send them itself — is merged but not in the deployed build.',
  },
  {
    verdict: 'watch',
    claim: "Deploying C104's frontend will split every campaign into two report rows.",
    evidence: `The report groups by (utm_source, utm_campaign). C104 sends the "fb|paid" `
      + `convention; all ${LEADS.withCampaign} existing tagged leads carry bare "fb" or "ig". `
      + `Today ${LEADS.pipedShapes} leads carry a piped shape, so the split has not started — it `
      + 'starts the day that frontend ships.',
  },
  {
    verdict: 'ok',
    claim: "ADS-3's three named fragilities are not materially firing.",
    evidence: `${JOIN.adButUntagged} of ${JOIN.fromAd} provable ad signups lost the tag — 0.2% `
      + 'over 30 days. The race and the newest-session rule are real in the code and are costing '
      + 'almost nothing in practice.',
  },
];

/** What this method cannot tell you, stated so nobody treats the above as more than it is. */
const NOT_ESTABLISHED = [
  'A campaign that produced NO clicks in the window is invisible here. "Every active campaign is '
    + 'tagged" is verified only for campaigns that actually delivered traffic; a paused campaign, '
    + 'or one spending with zero clicks, can still only be seen in Ads Manager.',
  'Which Meta macro sits in which parameter is inferred from the id hierarchy — one campaign id, '
    + 'one term id, three content ids — not read from the ad configuration. The hierarchy is '
    + 'consistent with {{campaign.id}} / {{adset.id}} / {{ad.id}} but the mapping is not confirmed.',
  'The hostname the ads point at is still unestablished, and not by this route: visitor_sessions '
    + 'records entry_page as a PATH, with no host, on all 1480 ad clicks. It is also moot — '
    + 'www.refactored.ai and enterprise.colaberry.ai were shown to be the same deployment.',
  'The 16 untagged ad clicks (1.1%) are unexplained. Most predate 21 Oct, when tagging starts in '
    + 'the data, which is consistent with a query string stripped in transit rather than an '
    + 'untagged ad.',
  'Nothing here is a profitability number. The ledger is still empty, so there is no cost per '
    + 'signup yet; this establishes that attribution is ready to receive spend, not that the ads '
    + 'pay for themselves.',
  'Whether the 39 non-ad landing signups arrived from search, email or direct is not determined.',
];

/** The three scripts behind the numbers, so the measurement can be re-run rather than believed. */
const METHOD = [
  ['measureAdTagsProd.js', 'ad sessions and their tags; landing leads and theirs; entry_page hosts'],
  ['measureAdTagShape.js', 'distinct values per parameter, the (campaign, content) pair count, '
    + 'unexpanded macros, untagged clicks by day'],
  ['measureBackfillLoss.js', 'leads left-joined to fbclid sessions, to separate organic signups '
    + 'from lost tags; utm_source shapes present today'],
];

module.exports = {
  TICKET, TICKET_ID, TICKET_URL, LIST_URL, SESSION, MEASURED_ON, WINDOW_DAYS, DB,
  SESSIONS, OBSERVED, CAMPAIGN_ID, CAMPAIGN_CONTENT_PAIRS, UNEXPANDED_MACROS,
  LEADS, JOIN, FINDINGS, NOT_ESTABLISHED, METHOD,
};
