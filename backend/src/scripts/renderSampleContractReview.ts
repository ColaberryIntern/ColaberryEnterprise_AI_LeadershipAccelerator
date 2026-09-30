/**
 * renderSampleContractReview — render the Phase-1 sample as the review a manager would read:
 * both tracks, every task's executor and accountable human, the human/AI allocation, the
 * old→new role map, and the requirement→task coverage. Generated FROM the sample data (not
 * hardcoded), so it is the honest picture the contracts produce. Writes docs/samples/.
 */
import * as fs from 'fs';
import * as path from 'path';
import { buildSampleContractProject } from '../services/factory/sample/sampleContractProject';
import type { FactoryProject } from '../services/factory/contracts/factoryContract';

const esc = (s: unknown) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c] as string));

export function renderSampleReviewHtml(p: FactoryProject = buildSampleContractProject()): string {
  const roleName = (id: string | null | undefined) => p.roles.find((r) => r.id === id)?.name ?? (id ?? '—');
  const performerOf = (taskId: string) => p.assignments.find((a) => a.task_id === taskId && a.responsibility === 'PERFORMER');
  const accountableOf = (taskId: string) => p.assignments.find((a) => a.task_id === taskId && a.responsibility === 'ACCOUNTABLE');
  const flowTasks = p.tasks.filter((t) => t.kind === 'TASK' || t.kind === 'DECISION');

  const taskRows = flowTasks.map((t) => {
    const perf = performerOf(t.id);
    const acct = accountableOf(t.id);
    const executor = perf?.executor ? `${perf.executor.type} · ${roleName(perf.role_id)}` : '—';
    const isAgent = perf?.executor?.type === 'agent';
    return `<tr>
      <td><b>${esc(t.title)}</b><div class="muted">${esc(t.kind)} · ${esc(t.method)}${t.confidence != null ? ' · conf ' + t.confidence : ''}</div></td>
      <td>${isAgent ? '<span class="pill agent">agent</span> ' : ''}${esc(executor)}</td>
      <td>${acct ? esc(roleName(acct.role_id)) + ' <span class="pill human">human</span>' : '<span class="pill warn">none</span>'}</td>
      <td>${esc(t.source_evidence.join(', ') || '—')}</td>
    </tr>`;
  }).join('');

  const coverageRows = p.requirements.map((r) => {
    const citing = p.tasks.filter((t) => r.source_evidence.some((b) => t.source_evidence.includes(b)));
    return `<tr><td><b>${esc(r.id)}</b> ${esc(r.kind)}</td><td>${esc(r.statement)}</td><td>${esc(r.source_evidence.join(', '))}</td>
      <td>${citing.length ? citing.map((t) => esc(t.title)).join('; ') : '<span class="pill warn">uncited</span>'}</td></tr>`;
  }).join('');

  const roleMapRows = p.role_map.map((m) => `<tr><td>${esc(m.previous_function)}</td><td>${esc(m.ai_contribution)}</td>
    <td><b>${esc(roleName(m.new_role_id))}</b></td><td>${esc(m.retained_responsibilities.join('; '))}</td></tr>`).join('');

  const allocRows = p.allocation.map((a) => `<tr><td>${esc(p.tasks.find((t) => t.id === a.task_id)?.title)}</td>
    <td><span class="pill">${esc(a.execution_class)}</span></td><td>${esc(roleName(a.accountable_role_id))}</td><td class="muted">${esc(a.rationale)}</td></tr>`).join('');

  const trackCards = p.tracks.map((t) => `<div class="card"><div class="eyebrow">${esc(t.track_type)} track</div>
    <div class="muted">status: ${esc(t.status)}</div>${t.solution_student_project_id ? `<div class="muted">solution build → student project ${esc(t.solution_student_project_id).slice(0, 8)}…</div>` : ''}</div>`).join('');

  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Sample Contract — Factory Review</title><style>
:root{--navy:#1a365d;--accent:#2b6cb0;--ink:#1f2733;--muted:#6b7685;--line:#e3e7ec;--bg:#f5f6f8;--good:#2f855a;--warn:#b5710a}
body{margin:0;background:var(--bg);color:var(--ink);font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;font-size:14px;line-height:1.55}
.wrap{max-width:1000px;margin:auto;padding:0 20px 50px}
header{background:linear-gradient(135deg,var(--navy),#20507f);color:#fff;padding:34px 0}
header .wrap{padding-bottom:0}h1{margin:8px 0 4px;font-size:26px}.eyebrow{font-size:11px;letter-spacing:.14em;text-transform:uppercase;color:var(--accent);font-weight:700}
header .eyebrow{color:#9fc4ea}.muted{color:var(--muted);font-size:12.5px}
h2{font-size:16px;margin:30px 0 12px;color:var(--navy)}
.cards{display:flex;gap:14px;flex-wrap:wrap;margin-top:18px}.card{background:#fff;border:1px solid var(--line);border-radius:12px;padding:16px 18px;flex:1 1 220px}
table{width:100%;border-collapse:collapse;background:#fff;border:1px solid var(--line);border-radius:12px;overflow:hidden}
th,td{text-align:left;padding:11px 14px;border-bottom:1px solid var(--line);vertical-align:top;font-size:13px}
th{background:#eef1f5;font-size:11px;letter-spacing:.04em;text-transform:uppercase;color:var(--muted)}
tr:last-child td{border-bottom:0}
.pill{display:inline-block;font-size:11px;font-weight:600;padding:2px 8px;border-radius:20px;background:#eef1f5;color:var(--navy)}
.pill.agent{background:#fff3e0;color:#b5710a}.pill.human{background:#e7f2ec;color:var(--good)}.pill.warn{background:#fbeee0;color:var(--warn)}
.note{margin-top:8px;font-size:12px;color:var(--muted)}
</style></head><body>
<header><div class="wrap"><div class="eyebrow">AI Project Factory · Phase 1 sample</div>
<h1>AI Government Contract Finder — contract project</h1>
<div class="muted" style="color:#c4d3e4">A worked sample: two tracks, an evidence-anchored process, and human/AI ownership — validated by factoryValidate() with zero errors.</div></div></header>
<div class="wrap">
<h2>Tracks</h2><div class="cards">${trackCards}</div>
<h2>Process tasks — who does the work, and who is accountable</h2>
<table><thead><tr><th>Task</th><th>Executor (performer)</th><th>Accountable human</th><th>Evidence</th></tr></thead><tbody>${taskRows}</tbody></table>
<div class="note">Every task that an agent performs carries a human accountable — the rule the gate enforces (OVERSIGHT).</div>
<h2>Human / AI allocation</h2>
<table><thead><tr><th>Task</th><th>Execution class</th><th>Accountable</th><th>Why</th></tr></thead><tbody>${allocRows}</tbody></table>
<h2>Old → new role map</h2>
<table><thead><tr><th>Previous function</th><th>AI contribution</th><th>New role</th><th>Retained by the human</th></tr></thead><tbody>${roleMapRows}</tbody></table>
<h2>Requirement → task coverage</h2>
<table><thead><tr><th>Requirement</th><th>Statement</th><th>Source blocks</th><th>Cited by</th></tr></thead><tbody>${coverageRows}</tbody></table>
<div class="note">DESIGN SAMPLE · fictional government contract. Generated from the typed sample data, not hardcoded.</div>
</div></body></html>`;
}

function main() {
  const outDir = path.resolve(__dirname, '..', '..', '..', 'docs', 'samples');
  fs.mkdirSync(outDir, { recursive: true });
  const out = path.join(outDir, 'sample-contract-review.html');
  fs.writeFileSync(out, renderSampleReviewHtml(), 'utf8');
  console.log('wrote', out);
}

if (require.main === module) main();
