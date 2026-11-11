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
// `personal` (8th slot) was added 2026-11-11 and re-validated with the dataviz validator in both
// modes: light worst adjacent CVD dE 17.1, normal 19.1; dark CVD 12.7, normal 15.1. Olive, teal
// and stone candidates all FAILED (CVD 2.6 / chroma floor / chroma floor) and were rejected.
const CATEGORY_COLORS = {
  light: { government: '#c2410c', learning: '#1d4ed8', revenue: '#15803d', decisions: '#7e22ce',
    platform: '#b45309', delivery: '#0891b2', growth: '#be123c', personal: '#a21caf',
    unsorted: '#64748b' },
  dark: { government: '#d4652f', learning: '#5a86e8', revenue: '#45975c', decisions: '#9c74d8',
    platform: '#b5842c', delivery: '#2f9ec0', growth: '#d4566e', personal: '#c25ad0',
    unsorted: '#94a3b8' },
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
  {
    key: 'personal',
    label: 'Personal and household',
    icon: '\u{1F3E0}',
    blurb: 'Family, home, personal finances and taxes',
    // No name patterns: filed by project only (Family Goals & Life Planning). Words like
    // "insurance" or "tax" also appear in business lists, so a name rule here would mis-file.
    patterns: [],
  },
];

/**
 * TIER 2: the Basecamp project a list lives in. Measured on production 2026-11-11: 241 of 511
 * tasks matched no name rule, and the project was the one signal that separated them ("TMS",
 * "Cadence + Weekly Demo Prep" and "OMS" are all ShipCES; every "FC" list is Colaberry Live).
 * Keyed on project id (VARCHAR in the mirror, so string keys), name kept alongside for audit.
 * Catch-all projects (Ali Personal 7463955, Management Team 12724441) are deliberately ABSENT:
 * a project that holds everything says nothing about any one list.
 */
const PROJECT_CATEGORIES = {
  47126345: ['delivery', 'ShipCES - Autonomous Brokerage'],
  49361096: ['delivery', 'Middlesex Glass - AIA billing automation'],
  49506070: ['delivery', 'MAPLOCA CRM AI - Strategic Partner RFP'],
  46699826: ['delivery', 'LandJet Growth Engine'],
  49210714: ['learning', 'Colaberry Live'],
  47502609: ['learning', 'AI Systems Architect Accelerator'],
  24865175: ['learning', 'Internship / Apprenticeship Projects'],
  46697389: ['learning', 'AI Pathway'],
  47346103: ['government', 'Gov Contracts'],
  17200971: ['government', 'TWC'],
  33392153: ['personal', 'Family Goals & Life Planning'],
  7482752: ['growth', 'Marketing Team'],
  19325887: ['growth', 'Partnerships'],
  47477101: ['growth', 'Anthropic Partner Network - 10-Person Onboarding'],
  17648766: ['growth', 'MIT Solve'],
  6593808: ['platform', 'Dev Team'],
  7009750: ['platform', 'Data Analytics Sales Team'],
  15139308: ['platform', 'Data Analytics Management Team'],
  12724483: ['platform', 'UX Design Team'],
  47472041: ['platform', 'Operations Engine'],
  49468897: ['platform', 'Systems & Data Inventory'],
  8245527: ['platform', 'DS, AI and Refactored Team'],
};

/**
 * TIER 3: narrow name rules for lists in the catch-all projects. Applied only after the name
 * rules and the project map, so they can never re-file a list that was already sorted.
 */
const CATCHALL_RULES = [
  ['decisions', /\bOpen Risks\b|\bescalations?\b/i],
  ['decisions', /\bstrategy\b/i],
  ['revenue', /\bpaid lighthouse\b/i],
  ['growth', /\bpartnerships?\b|\bAnthropic\b|\bOpenAI\b/i],
  ['growth', /\bGrowth OS\b|\bad traffic\b/i],
  ['learning', /\bcampus\b/i],
  ['platform', /^S[0-9] - /],
  ['platform', /Source of Truth|Harden, Replay|Ship, Activate|Operator Review Surface/i],
  ['platform', /Allocation, Workspaces|Capability Validation|lifecycle backbone|UI\/UX/i],
  ['platform', /\brollout\b|\bintern readiness\b|\bIntern Repos\b|\bTool Requests\b|\bClaude Sessions\b/i],
];

const UNSORTED = {
  key: 'unsorted',
  label: 'Unsorted',
  icon: '\u{2753}',
  blurb: 'Matched no rule. Not a category, a prompt to add one',
  patterns: [],
};

const hitFor = (key, matched) => {
  const c = CATEGORIES.find((x) => x.key === key);
  return { key: c.key, label: c.label, icon: c.icon, matched };
};

/**
 * Three tiers, first match wins: name rules, then project, then catch-all name rules.
 * @param {string} name a list name
 * @param {string|number} [projectId] the Basecamp project the list lives in
 * @returns {{key:string,label:string,icon:string,matched:?string}}
 */
function categoryOf(name, projectId) {
  const s = String(name || '');
  for (const c of CATEGORIES) {
    const hit = c.patterns.find((p) => p.test(s));
    if (hit) return hitFor(c.key, String(hit));
  }
  const proj = projectId == null ? null : PROJECT_CATEGORIES[String(projectId)];
  if (proj) return hitFor(proj[0], `project ${projectId} (${proj[1]})`);
  const rule = CATCHALL_RULES.find(([, p]) => p.test(s));
  if (rule) return hitFor(rule[0], String(rule[1]));
  return { key: UNSORTED.key, label: UNSORTED.label, icon: UNSORTED.icon, matched: null };
}

/** Roll list summaries up into categories, biggest first, with unsorted always last. */
function groupByCategory(summaries) {
  const byKey = new Map();
  for (const s of Array.isArray(summaries) ? summaries : []) {
    const c = categoryOf(s.key, s.projectId);
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

module.exports = { CATEGORIES, UNSORTED, CATEGORY_COLORS, PROJECT_CATEGORIES, CATCHALL_RULES,
  categoryOf, groupByCategory };
