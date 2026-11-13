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
    label: 'School and curriculum',
    icon: '\u{1F393}',
    blurb: 'The programme, the content engine, everything learners touch, and school compliance',
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
 * Every Basecamp project in Ali's queue: its category (TIER 2) and its short label (LEVEL 2).
 *
 * Measured on production 2026-11-11: 241 of 511 tasks matched no name rule, and the project was
 * the one signal that separated them ("TMS", "Cadence + Weekly Demo Prep" and "OMS" are all
 * ShipCES; every "FC" list is Colaberry Live). The mirror carries no project names, so the
 * labels are read once from the Basecamp API and kept here.
 *
 * `owns: true` marks a project that IS the business of every list in it (a client, the family,
 * TWC compliance, gov contracting): there the project outranks the list name. Internal team and
 * programme projects do not own their lists that way ("Billing issues" in the Accelerator project
 * is revenue), so for them the name decides and the project is only the fallback.
 *
 * `cat: null` marks a CATCH-ALL project (Ali Personal, Management Team, ...): a project that holds
 * everything says nothing about any one list, so it never decides a category. It still gets a
 * label, because "which project is this in" is worth seeing and filtering on regardless.
 *
 * Classifications from Ali, 2026-11-11: AI Pathway is the client NuOrg; TWC is the school's
 * compliance with the Texas Workforce Commission.
 * Keyed on project id (VARCHAR in the mirror, so string keys).
 */
const PROJECTS = {
  7463955: { cat: null, label: 'Ali Personal', name: 'Ali Personal' },
  12724441: { cat: null, label: 'Management Team', name: 'Management Team' },
  18619695: { cat: null, label: 'Data Project', name: 'Data Project' },
  16753550: { cat: null, label: 'New Leaders Group', name: 'New Leaders Group' },
  47126345: { cat: 'delivery', owns: true, label: 'ShipCES', name: 'ShipCES - Autonomous Brokerage' },
  49361096: { cat: 'delivery', owns: true, label: 'Middlesex', name: 'Middlesex Glass - AIA billing automation' },
  49506070: { cat: 'delivery', owns: true, label: 'MAPLOCA', name: 'MAPLOCA CRM AI - Strategic Partner RFP' },
  46699826: { cat: 'delivery', owns: true, label: 'LandJet', name: 'LandJet Growth Engine' },
  46697389: { cat: 'delivery', owns: true, label: 'NuOrg', name: 'AI Pathway' },
  49210714: { cat: 'learning', label: 'Colaberry Live', name: 'Colaberry Live' },
  47502609: { cat: 'learning', label: 'AI Systems Architect', name: 'AI Systems Architect Accelerator' },
  24865175: { cat: 'learning', label: 'Internships', name: 'Internship / Apprenticeship Projects' },
  17200971: { cat: 'learning', owns: true, label: 'TWC compliance', name: 'TWC' },
  47346103: { cat: 'government', owns: true, label: 'Gov Contracts', name: 'Gov Contracts' },
  33392153: { cat: 'personal', owns: true, label: 'Family', name: 'Family Goals & Life Planning' },
  7482752: { cat: 'growth', label: 'Marketing Team', name: 'Marketing Team' },
  19325887: { cat: 'growth', label: 'Partnerships', name: 'Partnerships' },
  47477101: { cat: 'growth', label: 'Anthropic', name: 'Anthropic Partner Network - 10-Person Onboarding' },
  17648766: { cat: 'growth', label: 'MIT Solve', name: 'MIT Solve' },
  6593808: { cat: 'platform', label: 'Dev Team', name: 'Dev Team' },
  7009750: { cat: 'platform', label: 'DA Sales Team', name: 'Data Analytics Sales Team' },
  15139308: { cat: 'platform', label: 'DA Management Team', name: 'Data Analytics Management Team' },
  12724483: { cat: 'platform', label: 'UX Design Team', name: 'UX Design Team' },
  47472041: { cat: 'platform', label: 'Operations Engine', name: 'Operations Engine' },
  49468897: { cat: 'platform', label: 'Systems & Data Inventory', name: 'Systems & Data Inventory' },
  8245527: { cat: 'platform', label: 'DS, AI & Refactored', name: 'DS, AI and Refactored Team' },
};

/** Level 2: the project, as {key,label}. An unknown project is named by id, never guessed. */
function projectOf(projectId) {
  if (projectId == null || projectId === '') return { key: 'none', label: 'No project' };
  const p = PROJECTS[String(projectId)];
  return { key: String(projectId), label: p ? p.label : `Project ${projectId}` };
}

/**
 * TIER 3: narrow name rules for lists in the catch-all projects. Applied last, after the project
 * and the general name rules, so they only ever decide a list nothing else could.
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

/** Tier 0: approval gates are cross-cutting, so no project can claim one. */
const GATE = /\bapprovals?\b/i;

const UNSORTED = {
  key: 'unsorted',
  label: 'Unsorted',
  icon: '\u{2753}',
  blurb: 'Matched no rule. Not a category, a prompt to add one',
  patterns: [],
};

/**
 * Level 1 is the category; level 2 is the project, attached to every answer including Unsorted.
 *
 * Level 1, first match wins (order set 2026-11-11, once two-level labels made mismatches visible):
 *   0. an approval gate is always Decisions: a gate is Ali's whatever project it sits in
 *   1. an OWNING project decides: Middlesex's "AIA progress billing" is Client delivery /
 *      Middlesex, not Revenue; ShipCES's "RMS - RFQ intake" is client work, not Government
 *   2. the name rules
 *   3. a non-owning project (internal teams and programmes) as the fallback
 *   4. the catch-all name rules (lists in Ali Personal and the other catch-alls)
 * @param {string} name a list name
 * @param {string|number} [projectId] the Basecamp project the list lives in
 * @returns {{key:string,label:string,icon:string,matched:?string,sub:{key:string,label:string}}}
 */
function categoryOf(name, projectId) {
  const s = String(name || '');
  const sub = projectOf(projectId);
  const hitFor = (key, matched) => {
    const c = CATEGORIES.find((x) => x.key === key);
    return { key: c.key, label: c.label, icon: c.icon, matched, sub };
  };
  if (GATE.test(s)) return hitFor('decisions', String(GATE));
  const proj = projectId == null ? null : PROJECTS[String(projectId)];
  const byProject = () => hitFor(proj.cat, `project ${projectId} (${proj.name})`);
  if (proj && proj.cat && proj.owns) return byProject();
  for (const c of CATEGORIES) {
    const hit = c.patterns.find((p) => p.test(s));
    if (hit) return hitFor(c.key, String(hit));
  }
  if (proj && proj.cat) return byProject();
  const rule = CATCHALL_RULES.find(([, p]) => p.test(s));
  if (rule) return hitFor(rule[0], String(rule[1]));
  return { key: UNSORTED.key, label: UNSORTED.label, icon: UNSORTED.icon, matched: null, sub };
}

/** Roll list summaries up into categories, biggest first, with unsorted always last. */
function groupByCategory(summaries) {
  const byKey = new Map();
  for (const s of Array.isArray(summaries) ? summaries : []) {
    const c = categoryOf(s.key, s.projectId);
    if (!byKey.has(c.key)) {
      const def = CATEGORIES.find((x) => x.key === c.key) || UNSORTED;
      const { sub: _sub, ...head } = c;
      byKey.set(c.key, { ...head, blurb: def.blurb, lists: [], subs: new Map(),
        total: 0, dormant: 0, live: 0 });
    }
    const g = byKey.get(c.key);
    g.lists.push({ ...s, matched: c.matched, sub: c.sub });
    g.total += s.total;
    g.dormant += s.dormant;
    g.live += s.live;
    if (!g.subs.has(c.sub.key)) g.subs.set(c.sub.key, { ...c.sub, total: 0, dormant: 0, live: 0 });
    const sg = g.subs.get(c.sub.key);
    sg.total += s.total;
    sg.dormant += s.dormant;
    sg.live += s.live;
  }
  for (const g of byKey.values()) {
    g.subs = [...g.subs.values()].sort((a, b) => b.total - a.total || a.label.localeCompare(b.label));
  }

  const out = [...byKey.values()].sort((a, b) => {
    if (a.key === 'unsorted') return 1;
    if (b.key === 'unsorted') return -1;
    return b.total - a.total;
  });
  out.forEach((g) => g.lists.sort((a, b) => b.total - a.total));
  return out;
}

module.exports = { CATEGORIES, UNSORTED, CATEGORY_COLORS, PROJECTS, CATCHALL_RULES, projectOf,
  categoryOf, groupByCategory };
