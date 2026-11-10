/**
 * artifacts - PURE. For one intern: what they have published (with links that open it), which
 * artifacts should exist by now and do not, and which project artifacts to ASK them for, each with
 * a paste-ready Claude Code prompt and the nudge that asks for it.
 *
 * Ali, 9 Nov 2026: "assess when artifacts should have been created and suggest the prompt that
 * would help them build an artifact you know they could produce easily based on where they are
 * that would help me understand the project better... and matching nudges."
 *
 * "Should have been created" is measured against the curriculum, not guessed: every training week
 * has cards that produce an artifact (ADR, field guide, case study, prompt library, build artifact,
 * Claude Studio). A card in a week BEFORE the intern's current training week with nothing published
 * from it is overdue; one in the current week is due now.
 *
 * The asks are chosen by rules from where the intern is (stuck, no published Command Center, a gov
 * build nearly done, an agent with many verified stories, no project), so the same facts always
 * produce the same asks, and each prompt is filled with their project, repo and stories.
 */
import type { ArtifactAsk, ArtifactCard, ArtifactsView, InternCard, PublishedArtifact } from './types';

const MAX_ASKS = 3;

/**
 * Where a published artifact opens: its own page when it has one, and NOTHING when it does not.
 *
 * This used to fall back to `https://enterprise.colaberry.ai/admin/internship/artifact/<id>`, a
 * route the admin app does not register. It serves exactly three paths under /admin/internship --
 * the index, the gov-contract cockpit and the agent domain page -- so every badge built from that
 * fallback opened a blank page. In the 9 Nov report 58 of the 80 artifact badges were dead this
 * way. The only reason CI stayed green on a feature called "openable artifacts" is that two unit
 * tests asserted the dead URL verbatim, which made the defect look like the specification.
 *
 * Returning null is what makes the absence visible. `renderArtifacts` already falls back to a
 * non-link pill, so the artifact is still named and still counted; it is simply no longer dressed
 * up as a destination. An artifact becomes clickable by gaining a real `external_url`, or by
 * someone building the viewer route -- never by this function inventing one.
 */
export function artifactUrl(a: Pick<PublishedArtifact, 'external_url'>): string | null {
  return a.external_url && /^https:\/\//.test(a.external_url) ? a.external_url : null;
}

const KIND_LABEL: Record<string, string> = {
  architecture_decision: 'ADR', field_guide: 'Field Guide', case_study: 'Case Study', prompt_library: 'Prompt Library',
  build_artifact: 'Build Artifact', claude_studio: 'Claude Studio', architecture_doc: 'Architecture Doc', presentation: 'Presentation',
};
export const kindLabel = (k: string): string => KIND_LABEL[k] ?? k.replace(/_/g, ' ');

type Ctx = Pick<InternCard, 'firstName' | 'project' | 'gov' | 'track' | 'training' | 'timeline'>;

function lines(xs: Array<string | undefined | null>): string {
  return xs.filter((x): x is string => !!x && x.trim().length > 0).map((x) => `- ${x}`).join('\n');
}

function projectContext(c: Ctx): string {
  const p = c.project;
  if (!p) return '';
  return [
    `Project: ${p.name}${p.repoUrl ? ` (repo: ${p.repoUrl})` : ''}.`,
    p.verifiedRecent.length ? `Recently verified stories:\n${lines(p.verifiedRecent.slice(0, 5).map((v) => v.title))}` : null,
    p.commitsRecent.length ? `Recent commits:\n${lines(p.commitsRecent.slice(0, 5).map((x) => x.message))}` : null,
    p.next ? `Next story in the plan: ${p.next.title}.` : null,
  ].filter(Boolean).join('\n');
}

const FINISH = 'Write it for Ali, the program lead: plain English, no filler, under one page. Commit it to the repo and push, then reply to Ali with the GitHub link.';

function ask(c: Ctx, key: string, name: string, why: string, forThem: string, body: string): ArtifactAsk {
  const prompt = `${projectContext(c)}\n\n${body}\n\n${FINISH}`.trim();
  const project = c.project ? ` for ${c.project.name}` : '';
  return {
    key, name, why, prompt,
    nudge: `Hi ${c.firstName}, could you put together a ${name}${project} in the next two days? ${forThem} Open Claude Code in your repo, paste the prompt below, and send me the link when it is pushed.`,
  };
}

/**
 * Stuck = no build work for 4+ days (or none in the window), or a reported blocker with NO build
 * work since. Without the second condition a builder who emails about issues they FOUND (and kept
 * committing) read as blocked (prod, 9 Nov: Quincy, commit 2 days earlier).
 */
function isStuck(c: Ctx): boolean {
  if (!c.project) return false;
  const q = c.timeline.quietNow;
  if (q === null || q >= 4) return true;
  const events = c.timeline.rows.flatMap((r) => r.events);
  const lastBlocker = events.filter((e) => e.kind === 'stuck').map((e) => e.day).sort().pop();
  const lastBuild = events.filter((e) => e.kind === 'commit' || e.kind === 'verified').map((e) => e.day).sort().pop();
  // A blocker Ali already answered is a conversation under way, not something to brief him on
  // (prod, 9 Nov: Quincy's "decisions that would let it move further", answered the same day).
  const lastReply = events.filter((e) => e.kind === 'reply').map((e) => e.day).sort().pop();
  if (lastBlocker && lastReply && lastReply >= lastBlocker) return false;
  return !!lastBlocker && (!lastBuild || lastBuild < lastBlocker);
}

/** The project artifacts worth asking for right now, most useful first. */
export function chooseAsks(c: Ctx, overdue: ArtifactsView['overdue']): ArtifactAsk[] {
  const p = c.project;
  const out: ArtifactAsk[] = [];
  if (p && isStuck(c)) {
    out.push(ask(c, 'blocker_brief', 'Blocker Brief',
      'Shows exactly what is blocking the build, what they already tried, and the one thing they need from you, so one reply can unblock them.',
      'It lets me unblock you in one reply instead of a back-and-forth.',
      `Create docs/BLOCKER_BRIEF.md. Use git log, the open stories in the build plan, and any error you can reproduce now. Sections:\n1. What I am trying to finish${p.next ? ` (the story "${p.next.title}")` : ''}.\n2. Exactly where it fails: the command, file and error text.\n3. What I already tried and what happened.\n4. The one decision, access or answer I need from Ali.\n5. What I will do the moment it is unblocked.`));
  }
  if (overdue.length) {
    const list = overdue.slice(0, 4).map((o) => `Week ${o.week} ${kindLabel(o.kind)}: ${o.title}`);
    out.push({
      key: 'overdue_training',
      name: 'Overdue training artifacts',
      why: `${overdue.length} training ${overdue.length === 1 ? 'artifact is' : 'artifacts are'} missing from weeks already behind them; each one is evidence of how they think, and certification and case studies draw on them.`,
      prompt: `These cards are already in your portal. Open each one, complete it, and submit the artifact it asks for:\n${lines(list)}`,
      nudge: `Hi ${c.firstName}, your portfolio is missing ${overdue.length === 1 ? 'one artifact' : `${overdue.length} artifacts`} from weeks you have already moved past (${list.slice(0, 2).join('; ')}${overdue.length > 2 ? '; ...' : ''}). Please finish ${overdue.length === 1 ? 'it' : 'them'} in the portal this week.`,
    });
  }
  if (p && !p.commandCenterUrl) {
    const started = p.verifiedRecent.some((v) => /command center|story-000/i.test(v.title)) || p.commitsRecent.some((x) => /command center|story-000/i.test(x.message));
    out.push(ask(c, 'command_center', started ? 'published Command Center' : 'Command Center',
      'Gives you a live page for this project you can open any time, instead of reading the repo.',
      started ? 'You have built it; publishing it means I can open it from my report any time.' : 'It is the page I open first to see where your build is.',
      `${started ? 'My Command Center (STORY-000) is built in this repo.' : 'Build my Command Center (STORY-000): one static page showing the project, the stories verified so far, what is in progress, and what is next.'}\nPublish it on GitHub Pages: put the static files under docs/command-center/, enable Pages from the /docs folder on the main branch, and confirm the URL loads in a private browser window. Add that URL to the README under "Command Center".`));
  }
  if (c.gov && c.gov.total > 0 && c.gov.pct >= 75) {
    out.push(ask(c, 'demo_walkthrough', 'Demo Walkthrough',
      'Shows the working system story by story against the RFP, which is what the proposal and the demo call will need.',
      'We are close enough that the proposal needs to show what works.',
      `Create docs/DEMO_WALKTHROUGH.html for the pursuit "${c.gov.title}". For each verified story: one screenshot or short code excerpt, what an evaluator would see, and which RFP requirement it satisfies. End with an honest list of what is not built yet.`));
  } else if (c.track === 'agent' && p && (p.tasksDone ?? 0) >= 10) {
    out.push(ask(c, 'capability_map', 'Capability Map',
      'Turns the verified stories into a list of what the agent can actually do today, with evidence, so you can judge it without reading code.',
      'You have verified enough stories that I want to see what the agent can do today.',
      'Create docs/CAPABILITY_MAP.html. For every verified story: the capability it gives the agent in one sentence, the evidence (file, commit or screenshot), and whether it runs autonomously or needs a human. Group by capability area and finish with the three capabilities that are next.'));
  }
  if (p && (p.verifiedRecent.length || p.commitsRecent.length)) {
    out.push(ask(c, 'project_one_pager', 'Project One-Pager',
      'One page in their own words: the problem, what is built, how it fits together, and what is next, which is the fastest way to understand the project.',
      'It is the fastest way for me to understand where the whole project stands.',
      'Create docs/PROJECT_ONE_PAGER.html from what is actually in this repo:\n1. The problem and who it is for.\n2. What is built: link each verified story to the file or commit that proves it.\n3. How it fits together: components, data and outside services, as a simple diagram.\n4. What is next and the biggest open question.'));
  }
  if (!p) {
    out.push(ask(c, 'project_proposal', 'Project Proposal',
      'Three concrete project ideas from them, so you can pick one and start their build this week.',
      'It lets us pick your project this week.',
      `Create PROJECT_PROPOSAL.md in your training repo with three project ideas you could build in the internship. For each: the problem, who has it, what you would build in four weeks, and what it would prove about you. Mark the one you want most and why. You are ${c.training.weeksCompleted} weeks into training; pick ideas that use what you have learned so far.`));
  }
  return out.slice(0, MAX_ASKS);
}

/**
 * Step 1 (needs only training): what they published, and which artifact cards are overdue or due.
 * The timeline needs this before it is built, and the asks need the timeline, hence two steps.
 */
export function artifactProgress(
  training: InternCard['training'], enrollmentId: string, published: PublishedArtifact[], cards: ArtifactCard[],
  completed: Array<{ enrollment_id: string; card_id: string }> = [],
): Omit<ArtifactsView, 'asks'> {
  const mine = published.filter((a) => a.enrollment_id === enrollmentId)
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  // A card counts as handled if it produced an artifact OR they completed it: a completed card
  // with no artifact did not require one (measured 9 Nov: setup labs and some prompt labs), so
  // calling it overdue would ask an intern for something that does not exist.
  const made = new Set([
    ...mine.map((a) => a.card_id).filter(Boolean),
    ...completed.filter((x) => x.enrollment_id === enrollmentId).map((x) => x.card_id),
  ]);
  const currentWeek = training.nextWeek ? training.nextWeek.week : (training.weeksTotal ? training.weeksTotal + 1 : null);
  const open = cards.filter((k) => k.week >= 1 && !made.has(k.card_id));
  const shape = (k: ArtifactCard): { week: number; kind: string; title: string } => ({ week: k.week, kind: k.kind, title: k.title });
  return {
    published: mine.map((a) => ({ id: a.id, kind: a.kind, title: a.title, at: new Date(a.created_at).toISOString(), url: artifactUrl(a) })),
    overdue: currentWeek === null ? [] : open.filter((k) => k.week < currentWeek).map(shape),
    dueNow: currentWeek === null ? [] : open.filter((k) => k.week === currentWeek).map(shape),
    currentWeek,
  };
}
