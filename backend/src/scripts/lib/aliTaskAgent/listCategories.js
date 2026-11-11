/**
 * listCategories - sort lists into the parts of the business they belong to.
 *
 * WHY THIS IS KEYWORD RULES AND NOT A MODEL CALL
 *
 * The categories have to be stable between runs. If a list moves from "Government" to "Revenue"
 * because a model felt differently on Tuesday, the navigation stops being navigation - you cannot
 * learn where things are if they move. Rules are boring, reproducible, and auditable, and every
 * match carries the keyword that produced it so a wrong category is a visible wrong rule rather
 * than an unexplained verdict.
 *
 * NOTHING IS GUESSED. A list that matches no rule is `unsorted`, shown as such, and never quietly
 * filed under the nearest plausible heading. An unsorted pile is a prompt to add a rule; a
 * mis-filed list is a thing you look for and cannot find.
 *
 * Order matters: the first match wins, so the more specific patterns come first. Government work
 * is tested before Revenue because "Gov contracts" tickets often talk about winning work.
 */


/**
 * Category colours, in fixed order and validated with the dataviz palette checker.
 *
 * Light passes every check. Dark passes every check. The worst adjacent pair sits at tritan
 * deltaE 5.1-6.3, inside the 6-8 floor band, which is legal ONLY with secondary encoding - and
 * every category here always ships with its icon AND its word, never colour alone. That is the
 * condition, so it is written down rather than assumed.
 *
 * Colour follows the CATEGORY, never its rank, so filtering the page cannot repaint anything.
 */
const CATEGORY_COLORS = {
  light: { government: '#c2410c', learning: '#1d4ed8', revenue: '#15803d', decisions: '#7e22ce',
    platform: '#b45309', delivery: '#0891b2', growth: '#be123c', unsorted: '#64748b' },
  dark: { government: '#d4652f', learning: '#5a86e8', revenue: '#45975c', decisions: '#9c74d8',
    platform: '#b5842c', delivery: '#2f9ec0', growth: '#d4566e', unsorted: '#94a3b8' },
};

const CATEGORIES = [
  {
    key: 'government',
    label: 'Government contracting',
    icon: '\u{1F3DB}\u{FE0F}',
    blurb: 'Set-aside entity, certifications, bids and the ladder that unlocks them',
    patterns: [/\bgov(ernment)?\b/i, /\bRFP\b/i, /\bRFQ\b/i, /set[- ]aside/i, /\bSOC 2\b/i,
      /\bNewCo\b/i, /veteran\/minority/i, /\bR[1-4] -/i, /credential/i, /certification/i,
      /\bDBE\b/i, /\bMBE\b/i, /\bTX-?RAMP\b/i, /bonfire/i, /\bSAM\b/i],
  },
  {
    key: 'learning',
    label: 'Students and curriculum',
    icon: '\u{1F393}',
    blurb: 'The programme, the content engine and everything learners touch',
    // `intern` was removed after it claimed "Agent Factory - Ten AI Employees, Interns Building
    // Them", which is platform work that happens to be staffed by interns. A word that names the
    // PEOPLE doing the work is a poor signal for what the work IS.
    patterns: [/\btraining\b/i, /curriculum/i, /\bstudent/i, /\bcohort\b/i, /\blaunch\b/i,
      /\bcontent engine\b/i, /self-paced/i, /\blearning\b/i, /\bcourse\b/i],
  },
  {
    key: 'revenue',
    label: 'Revenue and profitability',
    icon: '\u{1F4B0}',
    // Tested AFTER learning, deliberately. '10 - Individual Training, Content Engine &
    // Self-Paced Revenue' is a training list that happens to mention revenue, and the earlier
    // ordering filed it under Revenue. The more specific subject wins over the incidental word.
    blurb: 'What the business earns, what it costs, and the decisions behind both',
    patterns: [/profitab/i, /\brevenue\b/i, /\bpricing\b/i, /\bbilling\b/i, /\bconversion\b/i,
      /\bMRR\b/i, /commission/i, /\bspend\b/i, /\bcommercial/i, /\bpayment/i],
  },
  {
    key: 'decisions',
    label: 'Decisions and approvals',
    icon: '\u{2705}',
    blurb: 'Gates that are yours alone, and the blockers waiting behind them',
    patterns: [/approval/i, /\bdecisions?\b/i, /\bblockers?\b/i, /phase gates?/i, /\bowner\b/i,
      /\bgo or no-go\b/i, /milestone/i],
  },
  {
    key: 'platform',
    label: 'Agents and platform',
    icon: '\u{1F916}',
    blurb: 'The agent factory, the build pipeline and the systems underneath',
    // `intelligence` was removed after it claimed "11 - Revenue Room: live revenue intelligence
    // for Ram", which is a revenue surface. Both removals follow the same rule: narrow the
    // pattern rather than re-order the categories. Re-ordering fixes one collision and trades it
    // for the next, and the order stops being explainable.
    patterns: [/\bagent/i, /\bAF\d/i, /platform/i, /\bsense layer\b/i, /adapters?/i,
      /\bpipeline\b/i, /\borchestrat/i],
  },
  {
    key: 'delivery',
    label: 'Client delivery',
    icon: '\u{1F4E6}',
    blurb: 'Work for named clients, and the systems that run it',
    patterns: [/\bRMS\b/i, /\bAIA\b/i, /\bintake\b/i, /\bclient\b/i, /middlesex/i, /\bglass\b/i,
      /progress billing/i, /\bdiscovery\b/i],
  },
  {
    key: 'growth',
    label: 'Marketing and growth',
    icon: '\u{1F4E3}',
    blurb: 'How people find the business and what they see when they do',
    patterns: [/\bmarketing\b/i, /\bcampaign/i, /\bbrand\b/i, /\boutreach\b/i, /\bsocial\b/i,
      /\bSEO\b/i, /\bfunnel\b/i, /\blead\b/i, /\bwebsite\b/i],
  },
];

const UNSORTED = {
  key: 'unsorted',
  label: 'Unsorted',
  icon: '\u{2753}',
  blurb: 'Matched no rule. Not a category, a prompt to add one',
  patterns: [],
};

/**
 * @param {string} name a list name
 * @returns {{key:string,label:string,icon:string,matched:?string}}
 */
function categoryOf(name) {
  const s = String(name || '');
  for (const c of CATEGORIES) {
    const hit = c.patterns.find((p) => p.test(s));
    if (hit) return { key: c.key, label: c.label, icon: c.icon, matched: String(hit) };
  }
  return { key: UNSORTED.key, label: UNSORTED.label, icon: UNSORTED.icon, matched: null };
}

/** Roll list summaries up into categories, biggest first, with unsorted always last. */
function groupByCategory(summaries) {
  const byKey = new Map();
  for (const s of Array.isArray(summaries) ? summaries : []) {
    const c = categoryOf(s.key);
    if (!byKey.has(c.key)) {
      const def = CATEGORIES.find((x) => x.key === c.key) || UNSORTED;
      byKey.set(c.key, { ...c, blurb: def.blurb, lists: [], total: 0, dormant: 0, live: 0 });
    }
    const g = byKey.get(c.key);
    g.lists.push({ ...s, matched: c.matched });
    g.total += s.total;
    g.dormant += s.dormant;
    g.live += s.live;
  }

  const out = [...byKey.values()].sort((a, b) => {
    if (a.key === 'unsorted') return 1;
    if (b.key === 'unsorted') return -1;
    return b.total - a.total;
  });
  out.forEach((g) => g.lists.sort((a, b) => b.total - a.total));
  return out;
}

module.exports = { CATEGORIES, UNSORTED, CATEGORY_COLORS, categoryOf, groupByCategory };
