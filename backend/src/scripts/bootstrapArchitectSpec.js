#!/usr/bin/env node
// Bootstrap the AI_ProjectArchitect repo with the Build Index spec files
// pulled from BC ticket 9956775973 (and its comments + the parent list todos).
// Saves to AI Project Architect & Build Companion/spec/ then leaves git
// changes uncommitted for Ali to review + push in the OTHER session.

const path = require('path');
const fs = require('fs');
require('dotenv').config({ path: path.resolve(__dirname, '../../../.env') });

const BC = process.env.BASECAMP_ACCESS_TOKEN || 'BAhbB0kiAbB7ImNsaWVudF9pZCI6IjNkMzNmMzFiNDQ3YjRmODg1YTA1NTQwNzBjZjNmMWQ1ODdlMjM5MzAiLCJleHBpcmVzX2F0IjoiMjAyNi0wNi0wOVQyMDoxNTowMloiLCJ1c2VyX2lkcyI6WzQ1MzIxNzUxXSwidmVyc2lvbiI6MSwiYXBpX2RlYWRib2x0IjoiNmQ5NDQ4OThkN2U4ZDdhMmU4YmExMjg4M2ViOWYyYWQifQY6BkVUSXU6CVRpbWUNNJUfwKrnIjwJOg1uYW5vX251bWk4Og1uYW5vX2RlbmkGOg1zdWJtaWNybyIHBRA6CXpvbmVJIghVVEMGOwBG--cb82294fd86132b92b6c954402af0b6bd46630da';
const H = { Authorization: 'Bearer ' + BC, 'User-Agent': 'Colaberry', Accept: 'application/json' };
const BASE = 'https://3.basecampapi.com/3945211/buckets/7463955';

const ARCHITECT_REPO = 'c:/Users/ali_m/OneDrive/Business/Colaberry Novedea/AI Projects/AI Project Architect & Build Companion';
const SPEC_DIR = path.join(ARCHITECT_REPO, 'spec');

const PLAN_TODO = 9956775973;
const PARENT_LIST = 9953889092;
const COMMENTS_TO_EXTRACT = [
  { id: 9956776017, filename: 'BUILD_INDEX.md', label: 'Build Index (inlined Build Index content)' },
  { id: 9956801994, filename: 'BUILD_INDEX_ATTACHMENTS_NOTE.md', label: 'note about BUILD_INDEX.md + current_list_snapshot.json BC attachments' },
  { id: 9956813365, filename: 'ADVISOR_CLAUDE_CODE_PROMPT.md', label: 'Advisor Claude Code kickoff prompt reference' },
];

function htmlToMarkdown(html) {
  return (html || '')
    .replace(/<\/?strong>/g, '**')
    .replace(/<\/?b>/g, '**')
    .replace(/<\/?em>/g, '*')
    .replace(/<\/?i>/g, '*')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n\n')
    .replace(/<p[^>]*>/gi, '')
    .replace(/<\/h([1-6])>/gi, '\n\n')
    .replace(/<h1[^>]*>/gi, '\n# ')
    .replace(/<h2[^>]*>/gi, '\n## ')
    .replace(/<h3[^>]*>/gi, '\n### ')
    .replace(/<h4[^>]*>/gi, '\n#### ')
    .replace(/<li[^>]*>/gi, '\n- ')
    .replace(/<\/li>/gi, '')
    .replace(/<\/?ul[^>]*>/gi, '\n')
    .replace(/<\/?ol[^>]*>/gi, '\n')
    .replace(/<\/?code>/g, '`')
    .replace(/<\/?pre>/g, '\n```\n')
    .replace(/<a [^>]*href="([^"]+)"[^>]*>([^<]+)<\/a>/gi, '[$2]($1)')
    .replace(/<bc-attachment[^>]*filename="([^"]+)"[^>]*>[\s\S]*?<\/bc-attachment>/g, '[BC ATTACHMENT: $1 — fetch from BC ticket]')
    .replace(/<figure[^>]*>[\s\S]*?<\/figure>/g, '')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

(async () => {
  fs.mkdirSync(SPEC_DIR, { recursive: true });

  // 1. Save the parent todo description
  const t = await fetch(`${BASE}/todos/${PLAN_TODO}.json`, { headers: H }).then(r => r.json());
  fs.writeFileSync(path.join(SPEC_DIR, 'TICKET_DESCRIPTION.md'),
    `# ${t.title}\n\n` +
    `Source: ${t.app_url}\n\n` +
    `Status: ${t.status} | Due: ${t.due_on} | Assignees: ${(t.assignees||[]).map(a=>a.name).join(', ')}\n\n` +
    `---\n\n` +
    htmlToMarkdown(t.description)
  );
  console.log('  spec/TICKET_DESCRIPTION.md');

  // 2. Save each spec comment
  for (const c of COMMENTS_TO_EXTRACT) {
    const cm = await fetch(`${BASE}/comments/${c.id}.json`, { headers: H }).then(r => r.json());
    fs.writeFileSync(path.join(SPEC_DIR, c.filename),
      `# ${c.label}\n\n` +
      `Source: BC comment ${c.id} on todo ${PLAN_TODO} (${cm.app_url || '-'})\n` +
      `Author: ${cm.creator?.name} | Posted: ${cm.created_at}\n\n` +
      `---\n\n` +
      htmlToMarkdown(cm.content)
    );
    console.log(`  spec/${c.filename}`);
  }

  // 3. Save list snapshot (current 15 todos with descriptions)
  const todos = await fetch(`${BASE}/todolists/${PARENT_LIST}/todos.json?per_page=50`, { headers: H }).then(r => r.json());
  const snapshot = [];
  for (const tt of todos) {
    const full = await fetch(`${BASE}/todos/${tt.id}.json`, { headers: H }).then(r => r.json());
    snapshot.push({
      id: full.id,
      app_url: full.app_url,
      title: full.title || full.content,
      status: full.status,
      completed: full.completed,
      due_on: full.due_on,
      assignees: (full.assignees||[]).map(a => ({ id: a.id, name: a.name })),
      created_at: full.created_at,
      description_markdown: htmlToMarkdown(full.description),
      comments_count: full.comments_count,
    });
  }
  fs.writeFileSync(path.join(SPEC_DIR, 'CURRENT_LIST_SNAPSHOT.json'), JSON.stringify(snapshot, null, 2));
  console.log('  spec/CURRENT_LIST_SNAPSHOT.json (' + snapshot.length + ' todos)');

  // 4. Build a HAND_OFF.md that summarizes the session boundary
  fs.writeFileSync(path.join(SPEC_DIR, 'HAND_OFF.md'),
`# Hand-off to AI_ProjectArchitect Claude Code agent

Hand-off from session CC-20260603-v7da (Colaberry Enterprise AI Leadership Accelerator repo).

## What happened in the originating session

A standing-orders BC ticket (9956775973) asked the prior agent (in the Colaberry Enterprise AI Leadership Accelerator repo, NOT this one) to "fully build the AI_ProjectArchitect system."

That agent invoked SCOPE GUARD: the build is 5 weeks, 33 tickets, in a different git repo. Build Index itself states "A Claude Code agent in the ColaberryIntern/AI_ProjectArchitect repo should be able to read this list cold and build the system end to end." The prior agent posted a focused-question verdict offering 3 options (A: use intended path / B: cross-repo bootstrap / C: coordinate-only) on BC comment 9961267608.

Ali chose Option A + asked for the kickoff prompt for THIS (current) Claude Code session, running in the AI_ProjectArchitect repo.

## What you (this Claude Code session) own

The full buildout, per the Build Index. Read spec/BUILD_INDEX.md first.

## Spec files in this directory (committed at the start of this session)

- \`spec/TICKET_DESCRIPTION.md\` — the BC ticket description verbatim
- \`spec/BUILD_INDEX.md\` — the Build Index content from BC comment 9956776017 (the primary spec)
- \`spec/BUILD_INDEX_ATTACHMENTS_NOTE.md\` — BC comment 9956801994 explaining the original BUILD_INDEX.md + current_list_snapshot.json attachments
- \`spec/ADVISOR_CLAUDE_CODE_PROMPT.md\` — BC comment 9956813365 referencing the kickoff prompt (note: the original .md file was a BC attachment; if its body is needed beyond this comment, refetch from BC)
- \`spec/CURRENT_LIST_SNAPSHOT.json\` — the 15 current todos in the BC parent list (id 9953889092) with full descriptions + metadata

## Source-of-truth BC URLs

- Master Build Index todo: https://app.basecamp.com/3945211/buckets/7463955/todos/9956775973
- Parent list ("AI_ProjectArchitect company-wide rollout"): https://app.basecamp.com/3945211/buckets/7463955/todolists/9953889092
- Account: 3945211 / Bucket: 7463955 / List: 9953889092

## Standing Orders (from Ali, must follow in every action)

PROFESSIONAL OUTPUT — All work is executive-grade. Tone: confident, concise, decisive. No filler, no hedging.

COLABERRY QUALITY RUBRIC (self-check before shipping any output):
1. COMPLETENESS — all sections present, no TBDs, dependencies + assumptions explicit
2. CLARITY — purpose of each section in 1 sentence, terms used consistently
3. BUILD READINESS — execution order clear, inputs/outputs defined, dependencies stated, file boundaries described
4. ANTI-VAGUENESS — forbidden phrases include: "handle edge cases", "optimize later", "make it scalable", "use best practices", "where applicable", "circle back", "going forward", "low-hanging fruit", "just checking in", em-dashes
5. INTERN SUCCESS TEST — could a competent intern execute using only what you delivered?

WORKFLOW ORDERS:
- POST PROGRESS — after each meaningful step, post a 1-line comment on the active BC ticket
- POST YOUR ANSWER — final response is BC-paste-ready, verdict first
- CLOSE IF DONE — only if >85% confident + all 5 rubric gates pass
- ASK IF UNSURE — focused question + STOP
- NEVER NARRATE — do, then report
- SCOPE GUARD — STOP if scope expands >2x or touches outside ticket

## Memory + doctrine references (from the originating repo)

The originating session followed memory rules including:
- Every BC todo created must have due_on set at creation (PUT requires full body)
- Ali Personal: every outbound email + produced document attaches to its originating ticket via sendWithBcAttach
- No em-dashes anywhere in any communication
- Branded HTML + plain-text signature on every outbound email
- Production deploys after hours unless Ali explicitly greenlights

Apply equivalent discipline here.

## Recommended first 3 actions for this session

1. Read \`spec/BUILD_INDEX.md\` end to end. Identify Week 1 ticket 1 ("Infra 1").
2. Read the repo's existing structure (\`agents/\`, \`app/\`, \`config/\`, \`configschemas/\`, \`directives/\`, \`docs/\`, \`execution/\`, \`output/\`, \`CLAUDE.md\`, \`README.md\`, \`Dockerfile\`, \`docker-compose.yml\`). Build a mental model of what already exists.
3. Post a 1-line progress comment on BC todo 9956775973 declaring readiness + naming the first concrete commit you'll make.

## Critical context: this is a multi-week project

The Build Index sequences 5 weeks of work. A single Claude Code session will not finish it. The right cadence: per-day or per-ticket session checkpoints, each one closing 1-3 tickets, each with a BC progress comment + a git push. The originating ticket (9956775973) is the orchestration meta-todo and stays open until the full 5-week cycle wraps.

Session start: 2026-06-03 evening. Build Index due 2026-06-08 (the meta-todo's own due date - 5 days from now).
`
  );
  console.log('  spec/HAND_OFF.md');

  console.log('\nAll spec files written to:', SPEC_DIR);
  console.log('Next: cd to AI Project Architect repo and git add spec/ + commit + push.');
})().catch(e => { console.error('FAIL:', e.stack || e.message); process.exit(1); });
