/**
 * classifyWorkable — deterministic triage of a Basecamp task into how the Task
 * Prompt Worker should treat it:
 *   'code'     -> an engineering task an agent can implement -> generate a run-prompt
 *   'decision' -> Ali must decide -> surface only, never auto-work
 *   'human'    -> approval / review / read / content draft -> surface only
 *
 * Pure + deterministic, never throws. Fails toward 'human' when ambiguous, so the
 * worker never hands an agent a "do the work" prompt for something that actually
 * needs Ali. This mirrors the fail-toward-human bias of the ATA outward classifier.
 */

// CB drafts tasks with an "AI TASK" / "HUMAN TASK" badge in the description.
const HUMAN_MARKER = /human task/i;

const DECISION_RE = /\b(decision|re-?confirm|finali[sz]e (the )?decision|decide|cadence and size)\b/i;
const APPROVAL_RE = /\b(approve|approval|sign[- ]?off|authorize|reject)\b/i;
const READREVIEW_RE = /\b(read\b|reply with feedback|review .*\bwith\b|walk through|critique)\b/i;
const DRAFT_RE = /^\s*draft\b|\bdraft (a |an |the )?(memo|proposal|spec|rubric|status|note|doc|architecture)\b/i;

const CODE_RE = new RegExp([
  '\\b(implement|integrate|set[- ]?up|develop|refactor|migrate|instrument)\\b',
  '\\bbuild\\b.*\\b(eval|set|model|service|endpoint|api|feature|component|pipeline|parser|dashboard|tracker|script|worker|scorer|guard|schema)\\b',
  '\\badd\\b.*\\b(check|score|scoring|confidence|field|route|endpoint|test|column|model|service|validation|metric)\\b',
  '\\bcreate\\b.*\\b(model|service|route|script|endpoint|component|page|table)\\b',
  '\\bfix\\b',
  '\\bwire (up )?\\b',
].join('|'), 'i');

function textOf(task) {
  const title = String((task && (task.title || task.content)) || '');
  const desc = String((task && task.description) || '');
  return { title, blob: `${title} ${desc}` };
}

/**
 * @param {{title?:string, content?:string, description?:string}} task
 * @returns {'code'|'decision'|'human'}
 */
function classifyWorkable(task) {
  const { title, blob } = textOf(task);
  if (HUMAN_MARKER.test(blob)) return 'human';
  if (/^\s*decision\s*:/i.test(title) || DECISION_RE.test(title)) return 'decision';
  if (APPROVAL_RE.test(title)) return 'human';
  if (DRAFT_RE.test(title)) return 'human';
  if (READREVIEW_RE.test(title)) return 'human';
  if (CODE_RE.test(title)) return 'code';
  return 'human'; // fail toward human
}

module.exports = { classifyWorkable };
