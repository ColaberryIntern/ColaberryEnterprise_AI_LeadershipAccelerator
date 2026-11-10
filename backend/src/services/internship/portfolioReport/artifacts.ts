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
import type { ArtifactAsk, ArtifactFileType, ArtifactSource, ArtifactsView, InternCard, PublishedArtifact } from './types';
import { presentationAsk, type PresentationDue } from './presentations';

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

const EXT_TYPE: Record<string, ArtifactFileType> = {
  pdf: 'pdf', csv: 'spreadsheet', xlsx: 'spreadsheet', xls: 'spreadsheet', tsv: 'spreadsheet',
  docx: 'word', doc: 'word', pptx: 'slides', ppt: 'slides', html: 'html', htm: 'html',
  png: 'image', jpg: 'image', jpeg: 'image', gif: 'image', svg: 'image', webp: 'image',
  md: 'markdown', markdown: 'markdown', txt: 'text',
};

/** What the artifact is, from its file name (a repo file or an upload) or its link. */
export function artifactFileType(a: Provenanced): ArtifactFileType {
  const name = a.upload_name && a.upload_name !== 'uploaded file' ? a.upload_name : (a.repo_path ?? '');
  const ext = /\.([a-z0-9]+)$/i.exec(name)?.[1]?.toLowerCase();
  if (ext && EXT_TYPE[ext]) return EXT_TYPE[ext];
  if (!name && a.external_url) return /^https:\/\/claude\.ai\//.test(a.external_url) ? 'claude' : 'link';
  return 'file';
}

/**
 * Ali, 10 Nov 2026: "Artifacts should not be .md files. They should be pdfs ... that use
 * conditional formatting, charts, graphs, icons, pictures ... to help communicate the story".
 * Then, on whether to hide them: "show them but course correct". So Markdown and plain text ARE
 * listed (they are real work), flagged as the wrong format, and drive the `format_correction` ask
 * (measured on prod: 87 of 137 uploaded files were .md and 8 were .txt).
 */
export const WRONG_FORMAT: ReadonlySet<ArtifactFileType> = new Set<ArtifactFileType>(['markdown', 'text']);

/** Only CURRENT habits get corrected: a Markdown file from months ago is not worth a nudge today. */
export const FORMAT_CORRECTION_DAYS = 30;

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

/**
 * Every artifact we ask for is a VISUAL PDF made from HTML (Ali, 10 Nov 2026: "Artifacts should
 * not be .md files. They should be pdfs and specifically those that use conditional formatting,
 * charts, graphs, icons, pictures etc... They should be created in html and exported to pdf's.").
 */
export const FINISH = [
  'Build it as ONE self-contained HTML page (inline CSS, no external files) written for Ali, the program lead. Tell the story in visuals, not paragraphs:',
  '- Lead with the takeaway in one sentence at the top.',
  '- Conditional formatting: green = done, amber = in progress, red = blocked or missing, on every status.',
  '- At least one chart or diagram (inline SVG or a simple HTML/CSS bar chart), plus icons and real screenshots where they help.',
  '- Plain English, no filler, fits on one or two printed pages.',
  'Then export it to PDF: open the HTML in Chrome, Print > Save as PDF, with "Background graphics" turned on. Commit both the .html and the .pdf, push, and upload the PDF as your artifact in the portal. Do not submit a Markdown (.md) file; it is not an artifact.',
].join('\n');

const LIVE_PAGE = 'Write it for Ali, the program lead: plain English, status colors (green done, amber in progress, red blocked), at least one chart. Commit and push, then reply to Ali with the live URL.';

function ask(c: Ctx, key: string, name: string, why: string, forThem: string, body: string, finish = FINISH): ArtifactAsk {
  const prompt = `${projectContext(c)}\n\n${body}\n\n${finish}`.trim();
  const project = c.project ? ` for ${c.project.name}` : '';
  const deliver = finish === FINISH ? 'and upload the PDF in the portal when it is done' : 'and send me the link when it is live';
  return {
    key, name, why, prompt,
    nudge: `Hi ${c.firstName}, could you put together a ${name}${project} in the next two days? ${forThem} Open Claude Code in your repo, paste the prompt below, ${deliver}.`,
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

type Published = ArtifactsView['published'];

/**
 * Course correction for artifacts in the wrong format (Ali, 10 Nov 2026: "if they are creating the
 * wrong type of documents ... we can say, stop creating .md files or here is feedback to make your
 * prompt more picture and visually orientated"). Built only from their own recent wrong-format
 * files, so the nudge names exactly what to redo.
 */
export function formatCorrection(c: Ctx, published: Published, nowMs: number): ArtifactAsk | null {
  const cutoff = nowMs - FORMAT_CORRECTION_DAYS * 86400000;
  const allWrong = published.filter((a) => WRONG_FORMAT.has(a.fileType)).sort((x, y) => Date.parse(y.at) - Date.parse(x.at));
  const newest = [...published].sort((x, y) => Date.parse(y.at) - Date.parse(x.at))[0];
  // Still in the habit = a wrong-format file in the window, OR their most recent artifact of all is
  // one (prod, 10 Nov: a 30-day window alone corrected 1 of 6 interns whose latest work is .md).
  const recent = allWrong.filter((a) => Date.parse(a.at) >= cutoff);
  const wrong = recent.length ? recent : (newest && WRONG_FORMAT.has(newest.fileType) ? allWrong : []);
  if (!wrong.length) return null;
  const names = wrong.map((a) => a.provenance.replace(/ @ [0-9a-f]+$/, '').replace(/, uploaded$/, '') || a.title);
  const shown = names.slice(0, 5);
  const n = wrong.length;
  const files = n === 1 ? `one Markdown/text file (${shown[0]})` : `${n} Markdown/text files (${shown.slice(0, 2).join(', ')}${n > 2 ? ', ...' : ''})`;
  const body = [
    `Convert ${n === 1 ? 'this artifact' : 'these artifacts'} from Markdown/text into visual PDFs. For each file below, read it, then rebuild it as a visual page:`,
    lines(shown),
    '',
    'Upgrade the way you prompt. Do not ask Claude Code to "write up" or "document" something; ask it to SHOW it. For example, instead of',
    '  "Write a markdown doc describing my MCP server"',
    'ask',
    '  "Build a one-page HTML for an executive that shows my MCP server: a status table of each tool colored green (working), amber (partial), red (missing); a simple diagram of how requests flow; an icon per section; and a screenshot of it running. Lead with a one-sentence takeaway."',
    'Use that style for every artifact from now on: a table with status colors, at least one chart or diagram, icons, and real screenshots.',
  ].join('\n');
  return {
    key: 'format_correction',
    name: 'Visual PDFs instead of Markdown',
    why: `${recent.length ? `${n} of their artifacts from the last ${FORMAT_CORRECTION_DAYS} days ${n === 1 ? 'is' : 'are'}` : `Their most recent artifact, and ${n} in all, ${n === 1 ? 'is' : 'are'}`} Markdown or text; a visual PDF (status colors, charts, icons) tells you the story at a glance, and the prompt habit fixes every future artifact.`,
    prompt: `${projectContext(c)}\n\n${body}\n\n${FINISH}`.trim(),
    nudge: `Hi ${c.firstName}, a quick course correction on your artifacts: you have submitted ${files}. Please stop creating .md files for artifacts; an artifact should be a visual PDF built from HTML, with status colors, a chart or diagram, icons and screenshots, so it tells the story at a glance. When you prompt Claude Code, ask it to show the work, not write it up. Paste the prompt below to convert these, and upload the PDFs in the portal.`,
  };
}

/** The project artifacts worth asking for right now, most useful first. */
export function chooseAsks(c: Ctx, published: Published = [], nowMs = Date.now(), presentation: PresentationDue | null = null): ArtifactAsk[] {
  const p = c.project;
  const out: ArtifactAsk[] = [];
  // Second only to a Blocker Brief: an intern who is blocked needs unblocking before reformatting.
  const correction = formatCorrection(c, published, nowMs);
  if (p && isStuck(c)) {
    out.push(ask(c, 'blocker_brief', 'Blocker Brief',
      'Shows exactly what is blocking the build, what they already tried, and the one thing they need from you, so one reply can unblock them.',
      'It lets me unblock you in one reply instead of a back-and-forth.',
      `Create docs/BLOCKER_BRIEF.html (and its PDF). Use git log, the open stories in the build plan, and any error you can reproduce now. Sections:\n1. What I am trying to finish${p.next ? ` (the story "${p.next.title}")` : ''}.\n2. Exactly where it fails: the command, file and error text.\n3. What I already tried and what happened.\n4. The one decision, access or answer I need from Ali.\n5. What I will do the moment it is unblocked.`));
  }
  // The next presentation, once their own plan says it is due (presentations.presentationDue).
  if (presentation) out.push(presentationAsk(c.firstName, p?.name ?? null, presentation));
  if (correction) out.push(correction);
  if (p && !p.commandCenterUrl) {
    const started = p.verifiedRecent.some((v) => /command center|story-000/i.test(v.title)) || p.commitsRecent.some((x) => /command center|story-000/i.test(x.message));
    out.push(ask(c, 'command_center', started ? 'published Command Center' : 'Command Center',
      'Gives you a live page for this project you can open any time, instead of reading the repo.',
      started ? 'You have built it; publishing it means I can open it from my report any time.' : 'It is the page I open first to see where your build is.',
      `${started ? 'My Command Center (STORY-000) is built in this repo.' : 'Build my Command Center (STORY-000): one static page showing the project, the stories verified so far, what is in progress, and what is next.'}\nPublish it on GitHub Pages: put the static files under docs/command-center/, enable Pages from the /docs folder on the main branch, and confirm the URL loads in a private browser window. Add that URL to the README under "Command Center".`, LIVE_PAGE));
  }
  if (c.gov && c.gov.total > 0 && c.gov.pct >= 75) {
    out.push(ask(c, 'demo_walkthrough', 'Demo Walkthrough',
      'Shows the working system story by story against the RFP, which is what the proposal and the demo call will need.',
      'We are close enough that the proposal needs to show what works.',
      `Create docs/DEMO_WALKTHROUGH.html (and its PDF) for the pursuit "${c.gov.title}". For each verified story: one screenshot or short code excerpt, what an evaluator would see, and which RFP requirement it satisfies. End with an honest list of what is not built yet.`));
  } else if (c.track === 'agent' && p && (p.tasksDone ?? 0) >= 10) {
    out.push(ask(c, 'capability_map', 'Capability Map',
      'Turns the verified stories into a list of what the agent can actually do today, with evidence, so you can judge it without reading code.',
      'You have verified enough stories that I want to see what the agent can do today.',
      'Create docs/CAPABILITY_MAP.html (and its PDF). For every verified story: the capability it gives the agent in one sentence, the evidence (file, commit or screenshot), and whether it runs autonomously or needs a human. Group by capability area and finish with the three capabilities that are next.'));
  }
  if (p && (p.verifiedRecent.length || p.commitsRecent.length)) {
    out.push(ask(c, 'project_one_pager', 'Project One-Pager',
      'One page in their own words: the problem, what is built, how it fits together, and what is next, which is the fastest way to understand the project.',
      'It is the fastest way for me to understand where the whole project stands.',
      'Create docs/PROJECT_ONE_PAGER.html (and its PDF) from what is actually in this repo:\n1. The problem and who it is for.\n2. What is built: link each verified story to the file or commit that proves it.\n3. How it fits together: components, data and outside services, as a simple diagram.\n4. What is next and the biggest open question.'));
  }
  if (!p) {
    out.push(ask(c, 'project_proposal', 'Project Proposal',
      'Three concrete project ideas from them, so you can pick one and start their build this week.',
      'It lets us pick your project this week.',
      `Create PROJECT_PROPOSAL.html (and its PDF) in your training repo with three project ideas you could build in the internship. For each: the problem, who has it, what you would build in four weeks, and what it would prove about you. Mark the one you want most and why. You are ${c.training.weeksCompleted} weeks into training; pick ideas that use what you have learned so far.`));
  }
  return out.slice(0, MAX_ASKS);
}

/** Repo first, because that is the evidence Ali asked for; newest first inside each class. */
const SOURCE_ORDER: Record<ArtifactSource, number> = { recording: 0, repo: 1, upload: 2, link: 3 };

/**
 * What this intern actually MADE, newest first within each provenance class. Nothing here is
 * inferred from the curriculum and nothing here was written by the platform: a row the intern did
 * not produce has no source (see `artifactSource`) and is dropped, here as well as in SQL. The
 * filter lives in both places on purpose - the SQL keeps the rows out of the report, and this keeps
 * the rule testable without a database, which is how the generated rows got in the first time.
 */
export function publishedArtifacts(enrollmentId: string, published: PublishedArtifact[], videos: ArtifactsView['published'] = []): ArtifactsView['published'] {
  return published
    .filter((a) => a.enrollment_id === enrollmentId && artifactSource(a) !== null)
    .map((a): ArtifactsView['published'][number] => ({
      id: a.id, kind: a.kind, title: a.title, at: new Date(a.created_at).toISOString(), url: artifactUrl(a),
      source: artifactSource(a) as ArtifactSource, provenance: artifactProvenance(a), fileType: artifactFileType(a),
      repoPath: a.repo_path ?? null, uploadName: a.upload_name ?? null,
    }))
    // Their demo videos (presentations.videoArtifacts) are artifacts too, listed first.
    .concat(videos)
    .sort((a, b) => SOURCE_ORDER[a.source] - SOURCE_ORDER[b.source] || new Date(b.at).getTime() - new Date(a.at).getTime());
}
