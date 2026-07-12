// Single source of truth for binding launch approval todos to their artifacts.
//
// Pure functions, no I/O. Imported by:
//   - launchPmoDailyUpdate.js  (readiness gate: hold approvals that have no
//     artifact out of the human action queue + escalations)
//   - auditApprovalQueue.js    (read-only enumeration of the Approval Queue
//     with per-task artifact-link status)
//
// Background: the PMO task generator emits approval todos from the launch
// briefs with a free-text "deliverable" + "dependencies", but no structured
// link to the artifact under review. So approvals were surfaced to the human
// queue by due-date alone, even when nothing existed to approve (see the
// 2026-06-10 audit). This module defines the binding contract.
//
// Readiness contract: an approval todo is "ready to review" only once a
// recognizable artifact-ready marker is present in its description. The PMO
// deliverable back-fill (plan Phase 4) writes that marker onto the approval
// todo when the producing task posts its deliverable. Until the marker is
// present the approval is "awaiting" and is held out of the actionable /
// escalation paths (plan Phase 1). Held items are never dropped: the daily
// update surfaces them in a dedicated "awaiting deliverable" bucket + log.

const APPROVAL_LIST_NAME = 'Approval Queues';

// Hidden marker the back-fill writes into the approval todo description.
// Two accepted forms (either makes the approval "ready"):
//   <!-- artifact:ready url=https://... -->     (machine, preferred, carries the link)
//   the human-readable phrase "Artifact ready for review"
const ARTIFACT_READY_MARKER = /<!--\s*artifact:ready\b[^>]*-->|artifact ready for review/i;

// Machine marker with a captured deliverable URL.
const ARTIFACT_READY_URL = /<!--\s*artifact:ready\b[^>]*\burl=([^\s>]+)[^>]*-->/i;

// Titles that denote an approval/sign-off gate, used as a fallback when a todo
// lives outside the Approval Queues list but is still an approval.
const APPROVAL_TITLE_RE = /\b(approve|approval|sign[\s-]?off)\b/i;

/**
 * Is this todo an approval gate?
 * True when it lives in the Approval Queues list OR its title reads like an
 * approval. When a tier is present (daily-update decorated todos) it must be a
 * human/either gate; the audit script passes raw todos with no tier, so an
 * absent tier does not disqualify.
 */
function isApprovalTodo(todo, listName) {
  const inList = (listName || '') === APPROVAL_LIST_NAME;
  const titleMatch = APPROVAL_TITLE_RE.test((todo && todo.content) || '');
  const tier = (todo && todo.tier) || '';
  const humanish = tier === '' || tier === 'HUMAN' || tier === 'EITHER';
  return (inList || titleMatch) && humanish;
}

/** Returns the deliverable URL embedded in the ready-marker, or null. */
function extractArtifactUrl(description) {
  const m = ARTIFACT_READY_URL.exec(description || '');
  return m ? m[1] : null;
}

/** 'ready' once the artifact-ready marker is present, else 'awaiting'. */
function approvalArtifactStatus(todo) {
  const desc = (todo && todo.description) || '';
  return ARTIFACT_READY_MARKER.test(desc) ? 'ready' : 'awaiting';
}

/**
 * True when a todo is an approval gate that has no artifact wired yet — i.e.
 * the case the readiness gate holds back. Non-approval todos always return
 * false (they are never held by this gate).
 */
function approvalAwaitingDeliverable(todo, listName) {
  return isApprovalTodo(todo, listName) && approvalArtifactStatus(todo) === 'awaiting';
}

module.exports = {
  APPROVAL_LIST_NAME,
  ARTIFACT_READY_MARKER,
  isApprovalTodo,
  extractArtifactUrl,
  approvalArtifactStatus,
  approvalAwaitingDeliverable,
};
