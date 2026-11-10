/**
 * artifacts - PURE. For one intern: what they have actually published (with links that open it),
 * and which project artifacts to ASK them for, each with a paste-ready Claude Code prompt and the
 * nudge that asks for it.
 *
 * Ali, 9 Nov 2026: "suggest the prompt that would help them build an artifact you know they could
 * produce easily based on where they are that would help me understand the project better... and
 * matching nudges." Then: "only artifacts that have actually been produced", so nothing in the
 * Artifacts list is a curriculum placeholder. Then, reading a generated case study: "I want things
 * that come directly from the repo... The data should come from the user ONLY" - see
 * `artifactSource` for what that rules out and why.
 *
 * The asks are chosen by rules from where the intern is (stuck, no published Command Center, a gov
 * build nearly done, an agent with many verified stories, no project), so the same facts always
 * produce the same asks, and each prompt is filled with their project, repo and stories.
 */
import type { ArtifactAsk, ArtifactSource, ArtifactsView, InternCard, PublishedArtifact } from './types';

export const ADMIN_BASE = 'https://enterprise.colaberry.ai';
const MAX_ASKS = 3;

/** Where a published artifact opens: its own claude.ai page when it has one, else the admin viewer. */
export function artifactUrl(a: Pick<PublishedArtifact, 'id' | 'external_url'>): string {
  return a.external_url && /^https:\/\//.test(a.external_url) ? a.external_url : `${ADMIN_BASE}/admin/internship/artifact/${a.id}`;
}

type Provenanced = Pick<PublishedArtifact, 'external_url' | 'repo_path' | 'commit_sha' | 'upload_name'>;

/**
 * Where this artifact came from, or null when it is not the intern's own work.
 *
 * Ali, 9 Nov 2026, opening a "Week 2 Evaluation Case Study" that read "The student successfully
 * completed the Week 2 evaluation with a score of 100%, indicating a comprehensive grasp of the
 * material": "This looks too structured to be an artifact. I want things that come directly from
 * the repo. Not things that have been created or made up by this process. The data should come
 * from the user ONLY."
 *
 * That is a property of the table, not of that one row. `runtime_portfolio_artifacts` is an
 * AUTO-GENERATION store by design: `runtime/portfolioService.generateArtifact` sends the student's
 * work to an LLM and keeps the model's prose, discarding the student's own text whenever the model
 * answers (`content = { sections, skills_demonstrated, kind }`; their words survive only in the
 * deterministic fallback, under `content.work`). Measured on production, 9 Nov 2026, 809 rows:
 *
 *   294  LLM prose about the student    (`sections` + `skills_demonstrated`)
 *   151  our own curriculum field guides, Colaberry-branded, week 1 deep dives
 *   164  scenario-engine ADRs           (`adr` + `receipt` + `scenario_version`)
 *    74  a file in their repository     (`repo_path` + `commit_sha`)
 *    63  a file they uploaded           (`stored_path`)
 *    62  an artifact they built elsewhere and submitted, with their own reflection
 *
 * Only the last three are theirs. The first 609 are things we wrote about them, and a report that
 * shows those is telling Ali about his own platform's output, not about the intern.
 */
export function artifactSource(a: Provenanced): ArtifactSource | null {
  if (a.repo_path && a.commit_sha) return 'repo';
  if (a.upload_name) return 'upload';
  if (a.external_url && /^https:\/\//.test(a.external_url)) return 'link';
  return null;
}

/** One short phrase naming where it came from, so the claim is checkable at a glance. */
export function artifactProvenance(a: Provenanced): string {
  switch (artifactSource(a)) {
    case 'repo': return `${a.repo_path} @ ${String(a.commit_sha).slice(0, 7)}`;
    case 'upload': return `${a.upload_name}, uploaded`;
    case 'link': return (/^https:\/\/([^/]+)/.exec(String(a.external_url))?.[1]) ?? 'external link';
    default: return '';
  }
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
export function chooseAsks(c: Ctx): ArtifactAsk[] {
  const p = c.project;
  const out: ArtifactAsk[] = [];
  if (p && isStuck(c)) {
    out.push(ask(c, 'blocker_brief', 'Blocker Brief',
      'Shows exactly what is blocking the build, what they already tried, and the one thing they need from you, so one reply can unblock them.',
      'It lets me unblock you in one reply instead of a back-and-forth.',
      `Create docs/BLOCKER_BRIEF.md. Use git log, the open stories in the build plan, and any error you can reproduce now. Sections:\n1. What I am trying to finish${p.next ? ` (the story "${p.next.title}")` : ''}.\n2. Exactly where it fails: the command, file and error text.\n3. What I already tried and what happened.\n4. The one decision, access or answer I need from Ali.\n5. What I will do the moment it is unblocked.`));
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

/** Repo first, because that is the evidence Ali asked for; newest first inside each class. */
const SOURCE_ORDER: Record<ArtifactSource, number> = { repo: 0, upload: 1, link: 2 };

/**
 * What this intern actually MADE, newest first within each provenance class. Nothing here is
 * inferred from the curriculum and nothing here was written by the platform: a row the intern did
 * not produce has no source (see `artifactSource`) and is dropped, here as well as in SQL. The
 * filter lives in both places on purpose - the SQL keeps the rows out of the report, and this keeps
 * the rule testable without a database, which is how the generated rows got in the first time.
 */
export function publishedArtifacts(enrollmentId: string, published: PublishedArtifact[]): ArtifactsView['published'] {
  return published
    .filter((a) => a.enrollment_id === enrollmentId && artifactSource(a) !== null)
    .map((a) => ({
      id: a.id, kind: a.kind, title: a.title, at: new Date(a.created_at).toISOString(), url: artifactUrl(a),
      source: artifactSource(a) as ArtifactSource, provenance: artifactProvenance(a),
    }))
    .sort((a, b) => SOURCE_ORDER[a.source] - SOURCE_ORDER[b.source] || new Date(b.at).getTime() - new Date(a.at).getTime());
}
