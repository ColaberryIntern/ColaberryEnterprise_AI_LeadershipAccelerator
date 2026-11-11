/**
 * C124: ONE_MOVE_PROMPT.md, the attachment that lets Ali say "make the move" from inbox zero. Built from the same view
 * model as the report and the email (lib/view.js), so the move, its numbers and its hypothesis cannot drift apart.
 *
 * The prompt makes Claude Code (1) prove the recommendation is still current, (2) file the ticket, (3) build the move,
 * (4) APPEND the decision + hypothesis to story/decisions.json in the same PR, so next Wednesday's report grades it.
 */
'use strict';

const LEDGER = 'scripts/reports/open-house-weekly/story/decisions.json';
const LIST = 'https://app.basecamp.com/3945211/buckets/7463955/todolists/10457116157';

function addDays(ymd, n) {
  const d = new Date(`${ymd}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

function table(rows, targets) {
  const tgt = (r) => (r.rate && targets.rates[r.rate] ? `${targets.rates[r.rate].good}%` : 'n/a');
  return ['| Step | People | % of step before | Target | Status |', '|---|---|---|---|---|',
    ...rows.map((r) => `| ${r.step} | ${r.n} | ${r.pctPrev === null ? 'n/a' : `${r.pctPrev}%`} | ${tgt(r)} | ${r.status} |`)].join('\n');
}

function buildPromptMd(view, targets) {
  const { rec, weekOf, cur, top10, story } = view;
  const s = rec.star;
  if (!s) {
    return `# ONE MOVE: none this week (${weekOf})\n\nEvery step is on target or still being measured. Do nothing; next Wednesday's report will say.\n`;
  }
  const until = addDays(weekOf, 7);
  const entryId = `B-${weekOf}-${s.key}`;
  const hyp = s.hypothesis;
  const entry = {
    id: entryId, date: `${weekOf} HH:MM`, kind: 'build', ticket: '<the Basecamp ticket URL>', pr: '<the PR URL>',
    title: `<ticket id>: ${s.title}`, detail: '<one or two plain sentences: what changed for the visitor>',
    move: s.key, measure_until: until, recommendation: s.id,
  };
  const hypEntry = {
    id: `H-${weekOf}-${s.key}`, date: `${weekOf} HH:MM`, kind: 'hypothesis',
    title: `<one sentence: why this move should move ${hyp.metric}>`,
    detail: `Baseline ${weekOf}: ${s.n} of ${s.d} (${s.pct}%).`, test: hyp, status: 'open',
  };
  const inFlight = story.inFlight.map((m) => `- ${m.title} (measuring until ${m.until}): do not redo it.`).join('\n') || '- none';

  return `# ONE MOVE: ${s.title}

**Recommendation id:** \`${s.id}\` · **Week of:** ${weekOf} · **Snapshot:** ${view.snap.generated_ct} CT
**Who can make it:** ${s.executor === 'build' ? 'Claude Code (this prompt)' : 'a person; Claude Code prepares the evidence and the ask, and builds nothing'}

You are Claude Code working in the Colaberry Enterprise AI Leadership Accelerator repo. Ali has asked you, from inbox zero, to make the one move that this week's Open House funnel report starred. Follow every step in order. Stop and report instead of guessing if a check fails.

## 0. Prove this is still the move (do not skip)

1. Fetch main and read \`${LEDGER}\`. If it already holds an entry with \`"recommendation": "${s.id}"\`, the move was made: STOP and report that, with that entry's ticket and PR.
2. If any entry dated after ${weekOf} has \`"move": "${s.key}"\`, someone changed course: STOP and report it.
3. Re-run the report on the prod host (\`bash scripts/reports/open-house-weekly/run.sh\`) and read the starred id in the footer of \`/tmp/open-house-weekly/report.html\` (\`REC-<date>-<move>\`, where the date is the day it ran). If its move is no longer \`${s.key}\`, STOP and tell Ali the new star; do not build an old one.

## 1. Why this move (this week's numbers)

- ${s.key === 'source' ? `${s.gap.worst.label} signs up ${s.gap.worst.rate}% of visitors vs ${s.gap.best.label} ${s.gap.best.rate}%` : `${s.n} of ${s.d} (${s.pct}%) against a target of ${s.target}%`}: about **${s.short} people short**.
- Score ${s.score} = ${s.short} short × stage weight ${s.weight} × confidence ${s.conf}${s.conf < 1 ? ' (fewer than ' + targets.minSample + ' people: a strong lead, not a verdict)' : ''} × ${s.executor === 'build' ? 'buildable 1' : 'needs a person 0.6'}${s.top < 1 ? ' × top of funnel 0.5' : ''}.
- Next in line: ${rec.runnersUp.map((r) => `${r.title} (${r.score})`).join('; ') || 'none'}.
- Already being measured (leave alone):
${inFlight}

The 10 numbers that matter most this week:
${top10.map((f) => `${f.rank}. ${f.text}${f.why ? ` _${f.why}_` : ''}`).join('\n')}

The funnel (landing page door, ${cur.from_ct} to ${cur.to_ct} CT):

${table(view.funnel, targets)}

## 2. File the ticket BEFORE the first commit

- Basecamp list "Round 11 - Explorer first win from ad traffic": ${LIST}
- Next free C-number in that list; title starts with it. Assignee Ali (people id 17454835), with a due date.
- Description: the move, the numbers above, the hypothesis below, and "Done when".

## 3. Make the move

${s.how.map((h, i) => `${i + 1}. ${h}`).join('\n')}

Where to start: ${s.files.length ? s.files.map((f) => `\`${f}\``).join(', ') : 'locate the code first; list what you found in the ticket'}.

${s.executor === 'build' ? '' : '**This move needs a person.** Build nothing. Write the evidence and the exact ask as a Basecamp comment on the ticket for Ali to forward, and stop.\n\n'}House rules for this build: follow CLAUDE.md (tests ship with the change, \`tsc --noEmit\` clean, idempotent, failure path designed). Copy never uses the word for zero cost (say "$0" or "No card needed"). American spelling. Judge everything on a 390x844 phone screen first: ${cur.by_device.find((d) => d.label === 'mobile') ? 'most visitors are on phones' : 'the audience is mobile-first'}. No new outreach to students (Maya owns reach-out). Never merge: open the PR and give Ali the link with the Basecamp link.

## 4. Record the decision in the story (same PR, append only)

Append BOTH entries below to \`entries\` in \`${LEDGER}\`, filled in. Never edit or delete an older entry: if this changes or reverses an earlier direction, also append a \`"kind": "retraction"\` or \`"pivot"\` entry with \`"supersedes": "<old id>"\`.

\`\`\`json
${JSON.stringify(entry, null, 2)},
${JSON.stringify(hypEntry, null, 2)}
\`\`\`

The report reads this file from main every Wednesday: while \`measure_until\` (${until}) has not passed, it will not star this move again, and the hypothesis board will grade \`${hyp.metric} ${hyp.op} ${hyp.value}%\` against the live numbers. Run \`node --test scripts/reports/open-house-weekly/__tests__\` after editing it (the ledger is validated).

## 5. Done when

- The ticket exists, the PR is open, both ledger entries are in the PR, and tests pass.
- You tell Ali, in plain English: what changed for the visitor, the hypothesis, the date next week's report will grade it, the PR link and the ticket link.

## 6. If the evidence goes the other way next week

Do not quietly undo it. Append a \`retraction\` entry that supersedes the build, say why in one sentence with the numbers, and let the report show the change of direction.
`;
}

module.exports = { buildPromptMd, addDays };
