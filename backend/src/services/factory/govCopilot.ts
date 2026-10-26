/**
 * govCopilot — the Build Cockpit's project copilot, DETERMINISTIC by design.
 *
 * CLAUDE.md's core principle: production systems must be deterministic. So the copilot does NOT ask an LLM; it
 * answers from the project's CURRENT state — the SAME student-safe projection the page already renders. Given a
 * question it classifies the intent (what to do next / review the matched commits / what's at risk / draft a
 * proposal answer / anything else) and composes a grounded answer from the task stages, the matched commits and the
 * open proposal gaps. (An LLM enrichment can layer on later; the deterministic grounding is the floor, not a stopgap.)
 *
 * TRUST BOUNDARY: this module is PURE over the StudentGovProjectView — the projection is already the trust boundary
 * (no assignee identities, no pricing, no admin fields), so the copilot can only ever repeat what the student can
 * already see. It references task keys, titles, stages and public commit facts; never an identity. Pure + total.
 */
import type { StudentGovProjectView, StudentGovBuildStory, StudentSubmissionChecklistItem } from './govProjectProjection';

export type CopilotIntent = 'next' | 'review' | 'risk' | 'proposal' | 'other';

export interface CopilotAnswer {
  intent: CopilotIntent;
  /** A grounded, plain-text answer (newline-separated lines; the frontend renders them). */
  answer: string;
}

/** Classify a free-text question into an intent by keyword, mirroring the cockpit's quick actions. Pure + total;
 *  an unrecognised question is `other` (answered with a grounded status summary, never a refusal). */
export function classifyCopilotQuestion(question: string): CopilotIntent {
  const q = String(question ?? '').toLowerCase();
  if (!q.trim()) return 'other';
  if (/\b(proposal|draft|answer|respond|narrative|gap)\b/.test(q)) return 'proposal';
  if (/\b(review|approve|verify|matched|commit)\b/.test(q)) return 'review';
  if (/\b(risk|deadline|late|behind|due|closes?|on\s*time|time\s*left)\b/.test(q)) return 'risk';
  if (/\b(next|today|start|begin|do\s+first|priorit)\b/.test(q)) return 'next';
  return 'other';
}

// ── grounding helpers (pure) ──────────────────────────────────────────────────────────────────────────────────
const stories = (v: StudentGovProjectView): StudentGovBuildStory[] => (v && v.build && Array.isArray(v.build.stories) ? v.build.stories : []);
const proposalItems = (v: StudentGovProjectView): StudentSubmissionChecklistItem[] => (v && v.submissionChecklist && Array.isArray(v.submissionChecklist.items) ? v.submissionChecklist.items : []);
const matchedStories = (v: StudentGovProjectView) => stories(v).filter((s) => s.stage === 'matched');
const myOpenTodos = (v: StudentGovProjectView) => {
  const todos = stories(v).filter((s) => s.stage === 'todo');
  const mine = todos.filter((s) => s.mine);
  return (mine.length ? mine : todos);
};
const openProposals = (v: StudentGovProjectView) => proposalItems(v).filter((i) => i.stage !== 'done');
/** The first detected key-date line's raw text — stated verbatim, never a computed countdown (that is the
 *  frontend's govDeadline job); the copilot stays honest about the precision it actually has. */
const deadlineText = (v: StudentGovProjectView): string | null => {
  const k = (v && Array.isArray(v.keyDates) ? v.keyDates : []).find((d) => d && d.date);
  return k ? `${k.text ? k.text + ' — ' : ''}${k.date}` : null;
};

/** "What should I do next?" — reviews first (a matched commit counts only once verified), then the next task to
 *  start, then the open proposal gaps. Honest when there is nothing outstanding. */
function answerNext(v: StudentGovProjectView): string {
  const lines: string[] = [];
  const matched = matchedStories(v);
  const todos = myOpenTodos(v);
  const openProp = openProposals(v);
  if (matched.length) {
    const verifier = v.viewerCanVerify ? 'Approve' : 'A reviewer needs to verify';
    lines.push(`${verifier} ${matched.map((s) => s.requirementId).join(', ')} — the commits are in, and a matched commit counts only once it is verified.`);
  }
  if (todos.length) {
    const t = todos[0];
    lines.push(`Start ${t.requirementId} (${t.title}). Its Claude Code prompt is on the task — commit with ${t.requirementId} in the message and the cockpit files it as evidence.`);
  }
  if (openProp.length) {
    const withGaps = openProp.filter((i) => i.openGapCount > 0);
    const target = withGaps.length ? withGaps : openProp;
    lines.push(`Answer the proposal ${target.length === 1 ? 'response' : 'responses'} for ${target.map((i) => i.requirementId).join(', ')} so ${target.length === 1 ? 'it' : 'they'} can be approved.`);
  }
  if (!lines.length) return 'Everything assigned to you is verified or waiting on a reviewer. Nothing is queued for you right now.';
  return lines.map((l, i) => `${i + 1}. ${l}`).join('\n');
}

/** "Review the matched commits" — each matched story with its commit and the acceptance to check it against. */
function answerReview(v: StudentGovProjectView): string {
  const matched = matchedStories(v);
  if (!matched.length) return 'Nothing is waiting for review right now. When a build-repo push cites a task key, the task moves to Commit matched and shows up here.';
  const blocks = matched.map((s) => {
    const commit = s.commit ? `commit ${s.commit.sha} (${s.commit.message})` : 'a filed hand-in';
    const checks = s.acceptance.length ? s.acceptance.map((a) => `   - ${a}`).join('\n') : '   - Confirm it meets the requirement.';
    return `${s.requirementId} · ${commit}\n   Check it against:\n${checks}`;
  });
  const closer = v.viewerCanVerify ? 'Open a task to approve it or send it back with a note.' : 'A reviewer has to verify each of these before it counts.';
  return `${blocks.join('\n')}\n${closer}`;
}

/** "What's at risk?" — how much is unverified, which items are unstarted, and the deadline text we actually have. */
function answerRisk(v: StudentGovProjectView): string {
  const allStories = stories(v);
  const allProps = proposalItems(v);
  const total = allStories.length + allProps.length;
  const notDone = allStories.filter((s) => s.stage !== 'done').length + allProps.filter((i) => i.stage !== 'done').length;
  const notStarted = allStories.filter((s) => s.stage === 'todo').map((s) => s.requirementId);
  const openProp = openProposals(v).map((i) => i.requirementId);
  const lines = [`${notDone} of ${total} task${total === 1 ? '' : 's'} ${notDone === 1 ? 'is' : 'are'} not verified yet.`];
  const dl = deadlineText(v);
  if (dl) lines.push(`Submission date on file: ${dl}.`);
  if (notStarted.length) lines.push(`Not started: ${notStarted.join(', ')} — these have no commit yet, so they are the schedule risk.`);
  if (openProp.length) lines.push(`Proposal still open: ${openProp.join(', ')}.`);
  if (!notStarted.length && !openProp.length && notDone === 0) return `All ${total} tasks are verified. Nothing outstanding${dl ? ` before ${dl}` : ''}.`;
  return lines.join('\n');
}

/** "Draft a proposal answer" — points at the proposal responses that still need work and their open gaps. The
 *  copilot does not invent an answer (that is the authoring surface's job); it names what is owed. */
function answerProposal(v: StudentGovProjectView): string {
  const open = openProposals(v);
  if (!open.length) return 'Every proposal response is approved with no open gaps. There is nothing to draft.';
  const lines = open.map((i) => {
    const gaps = i.openGapCount > 0 ? ` — ${i.openGapCount} open gap${i.openGapCount === 1 ? '' : 's'} to resolve` : '';
    return `${i.requirementId}: ${i.statement}${gaps}`;
  });
  return `These proposal responses still need work before they can be approved:\n${lines.map((l) => `- ${l}`).join('\n')}\nOpen one on the Proposal tab to draft or edit it; pricing is never shown here.`;
}

/** A grounded status summary for an unrecognised question — where the project stands, and what to ask next. */
function answerOther(v: StudentGovProjectView): string {
  const allStories = stories(v);
  const done = allStories.filter((s) => s.stage === 'done').length;
  const matched = allStories.filter((s) => s.stage === 'matched').length;
  const inBuild = allStories.filter((s) => s.stage === 'build').length;
  const head = `${v.name || 'This project'}${v.agency ? ` for ${v.agency}` : ''}: ${done}/${allStories.length} build task${allStories.length === 1 ? '' : 's'} verified, ${matched} awaiting review, ${inBuild} in build.`;
  return `${head}\nI answer from this project's requirements, tasks and synced commits. Ask me what to do next, to review the matched commits, what's at risk, or about a proposal answer.`;
}

/** Answer a copilot question from the project's current state. DETERMINISTIC + total. */
export function answerCopilot(view: StudentGovProjectView, question: string): CopilotAnswer {
  const intent = classifyCopilotQuestion(question);
  switch (intent) {
    case 'next': return { intent, answer: answerNext(view) };
    case 'review': return { intent, answer: answerReview(view) };
    case 'risk': return { intent, answer: answerRisk(view) };
    case 'proposal': return { intent, answer: answerProposal(view) };
    default: return { intent: 'other', answer: answerOther(view) };
  }
}
