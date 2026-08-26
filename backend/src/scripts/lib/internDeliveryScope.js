// internDeliveryScope.js
//
// Which Basecamp todolists count as intern PROJECT work, and which people count
// as interns. This is the answer to a single instruction from Ali (2026-08-25):
//
//   "There are 4 interns working in Gov Contract project. Anything outside
//    their project work should not be on the internship command center."
//
// Before this module the report harvested two whole Basecamp buckets and showed
// everything in them. That pulled in three kinds of noise that made the page
// read as a roster rather than a delivery report:
//
//   1. Onboarding checklists. "Colaberry Internship Build System" is 31 todos,
//      one per person, and "New Internship Onboarding" is 16 more. They put ~25
//      people on the People table whose entire "delivery" was one orientation
//      checkbox, and they dominated the portfolio task counts.
//   2. Staff work sitting in the Gov Contracts bucket. Gov Contracting
//      Eligibility and the Data Flotation set-aside push are Ram, Srinivas,
//      Vinay and Dheeraj. Real work, not intern work.
//   3. Legacy one-todo stubs (Cora, AZURE VM, Author AI, Cline Projects) left
//      over from earlier programmes.
//
// The four Gov Contracts interns Ali refers to are Obi (Selective Service),
// Omolola (Detroit Voter Education), Akiwam (VA ERP) and Samrawit (Fairfax),
// each holding a BUILD list and a PROPOSAL list.
//
// Deliberately rule-based with a small explicit deny list rather than an
// allow list of IDs: a new intern project must appear on this report the day it
// is created, without a code change. The explicit denies are only for lists
// that no rule can distinguish from real project work.

// People who are never "interns" for the purposes of this report. Ali and Ram
// are the audience; CB System and the "+ai" twin accounts are bots. These are
// dropped from the harvest entirely, so they never reach the roster at all.
const AUDIENCE_AND_BOT_BC_IDS = new Set([
  17454835, // Ali Muwwakkil (the audience)
  17346350, // Ram Katamaraja (the audience)
  37708014, // CB System (bot)
  37184021, // Jackie Chalk (staff, work account)
  37179680, // Jackie Chalk (staff, personal account)
  52530300, // Ram AI
  52530301, // Samrawit Mekonen AI
  52530305, // Akiwam AI
  52530307, // Omolola Makinde AI
]);
// The "<Name> AI" twin accounts are all "<handle>+ai@". CB System is "+999@".
const EXCLUDED_EMAIL_PATTERNS = [/\+ai@/i, /\+999@/i];
// Known staff without a reliable ID on file. Kept deliberately short: the Gov
// Contracts crew are @colaberry.com but ARE in scope, so we cannot filter by
// email domain the way lib/internActivityTracker.js does.
const EXCLUDED_NAMES_LOWER = new Set(['milad', 'milad rezvani', 'milad r']);

// Colaberry staff who work alongside the interns. Unlike the set above, these
// are NOT dropped from the harvest: their names must still render on the tasks
// they hold. They simply do not count as interns, so they never appear on the
// People table, never own a project, and their presence alone never puts a list
// in scope.
const STAFF_BC_IDS = new Set([
  50705726, // Srinivas Balla   <srinivas@colaberry.com>
  45809041, // Vinay Shankar    <vinay@colaberry.com>
  34920126, // Dheeraj Garg     <dhee@colaberry.com>
  47335940, // Sohail Syed      <sohail@colaberry.com>
  18637225, // Mika Hopson      <mika@colaberry.com>
  40450955, // Robelyn Florague <robelyn@colaberry.com>
]);

// Lists that are real, active, and still not intern project work. Each entry
// carries the reason so a future reader can tell a deliberate exclusion from an
// oversight, and so the dashboard can show Ali exactly what was withheld.
const EXCLUDED_LISTS = new Map([
  [9538503852, { category: 'program_admin', reason: 'Onboarding checklist: 31 todos, one per person, not delivery work' }],
  [9506875341, { category: 'program_admin', reason: 'Onboarding checklist for new interns' }],
  [9126568445, { category: 'legacy', reason: 'Small Win AI Team, a completed programme from a previous cohort' }],
  [10072806331, { category: 'staff', reason: 'Gov Contracting eligibility push owned by Ram, Srinivas and Vinay' }],
  [10081765998, { category: 'staff', reason: 'Data Flotation set-aside entity work, owned by Dheeraj with Ali and Ram' }],
]);

// Safety net so next year's onboarding list does not have to be denied by hand.
const ADMIN_NAME_PATTERNS = [
  /\bonboarding\b/i,
  /\borientation\b/i,
  /internship\s+build\s+system/i,
  /\bhousekeeping\b/i,
];

// A list needs either release structure (the story-build R0..R14 convention) or
// a few real tasks before it is a project. This is what retires the one-todo
// stubs without naming each of them.
const MIN_TASKS_WITHOUT_RELEASES = 3;

function isStaffPerson(personId) {
  return STAFF_BC_IDS.has(personId);
}

// Dropped from the harvest entirely.
function isExcludedPerson(person) {
  if (!person) return true;
  if (AUDIENCE_AND_BOT_BC_IDS.has(person.id)) return true;
  const email = String(person.email_address || '');
  if (EXCLUDED_EMAIL_PATTERNS.some((re) => re.test(email))) return true;
  const name = String(person.name || '').trim().toLowerCase();
  if (EXCLUDED_NAMES_LOWER.has(name)) return true;
  // Twin bot accounts sometimes arrive with a null email; catch the naming form.
  if (/\sAI$/.test(String(person.name || '')) && !email) return true;
  return false;
}

// The question classifyList actually needs to ask. Ali holding tasks on a list
// does not make it an intern project: "Intelligence Generators (9) - BUILD" is
// 30 todos, all his, and it has no business on an intern report.
function isInternPerson(personId) {
  return !AUDIENCE_AND_BOT_BC_IDS.has(personId) && !STAFF_BC_IDS.has(personId);
}

/**
 * Decide whether one todolist is intern project work.
 *
 * @param {object} list
 * @param {number} list.projectId
 * @param {string} list.name
 * @param {number[]} list.assigneeIds   distinct people holding delivery tasks
 * @param {number} list.deliveryTaskCount  tasks excluding approval gates
 * @param {number} list.releaseCount    number of R#/P# groups
 * @returns {{inScope: boolean, category: string, reason: string|null}}
 */
function classifyList({ projectId, name, assigneeIds = [], deliveryTaskCount = 0, releaseCount = 0 }) {
  const explicit = EXCLUDED_LISTS.get(projectId);
  if (explicit) return { inScope: false, category: explicit.category, reason: explicit.reason };

  if (ADMIN_NAME_PATTERNS.some((re) => re.test(String(name || '')))) {
    return { inScope: false, category: 'program_admin', reason: 'List name marks it as programme administration, not delivery' };
  }

  const internAssignees = assigneeIds.filter(isInternPerson);
  if (internAssignees.length === 0) {
    return { inScope: false, category: 'no_intern', reason: 'No intern holds a task on this list' };
  }

  if (releaseCount === 0 && deliveryTaskCount < MIN_TASKS_WITHOUT_RELEASES) {
    return {
      inScope: false,
      category: 'stub',
      reason: `Only ${deliveryTaskCount} task${deliveryTaskCount === 1 ? '' : 's'} and no release structure, too thin to be a project`,
    };
  }

  return { inScope: true, category: 'intern_project', reason: null };
}

module.exports = {
  classifyList,
  isStaffPerson,
  isInternPerson,
  isExcludedPerson,
  STAFF_BC_IDS,
  AUDIENCE_AND_BOT_BC_IDS,
  EXCLUDED_LISTS,
  MIN_TASKS_WITHOUT_RELEASES,
};
