/**
 * renderPromptDigest — deterministic HTML + text digest of the run-prompts the
 * Task Prompt Worker generated. Pure, never throws, no clock (the caller passes
 * runId + dateStr so the output is reproducible / idempotent).
 */

function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * @param {{runId:string, dateStr:string,
 *   code?:Array<{task:object, prompt:string}>,
 *   needsYou?:Array<{task:object, kind:string}>}} input
 * @returns {{subject:string, html:string, text:string}}
 */
function renderDigest({ runId, dateStr, code = [], needsYou = [] }) {
  const subject = `Your task worker: ${code.length} ready-to-run prompt${code.length === 1 ? '' : 's'}, ${needsYou.length} need you (${dateStr})`;

  const codeBlocks = code
    .map(
      ({ task, prompt }) => `
    <div style="margin:0 0 22px;border:1px solid #e2e8f0;border-radius:8px;overflow:hidden">
      <div style="background:#0f172a;color:#e2e8f0;padding:10px 14px;font-size:14px;font-weight:600">${esc(task.title)}</div>
      <div style="padding:8px 14px;font-size:12px;color:#475569">${esc(task.project || '')}${task.due ? ' &middot; due ' + esc(task.due) : ''} &middot; <a href="${esc(task.url)}">open ticket</a></div>
      <pre style="margin:0;padding:14px;background:#f8fafc;border-top:1px solid #e2e8f0;white-space:pre-wrap;font-size:12px;line-height:1.5;color:#0f172a">${esc(prompt)}</pre>
    </div>`
    )
    .join('');

  const needRows = needsYou
    .map(
      ({ task, kind }) =>
        `<li style="margin:4px 0"><span style="color:#92400e;font-size:11px;text-transform:uppercase">${esc(kind)}</span> &middot; <a href="${esc(task.url)}">${esc(task.title)}</a></li>`
    )
    .join('');

  const html = `
  <div style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;max-width:760px;margin:0 auto;color:#0f172a">
    <div style="background:#0f172a;color:#fff;padding:18px 20px;border-radius:8px 8px 0 0">
      <div style="font-size:12px;letter-spacing:1px;color:#94a3b8">TASK WORKER (REPORT-ONLY)</div>
      <div style="font-size:20px;font-weight:700">Ready-to-run prompts</div>
      <div style="font-size:12px;color:#94a3b8;margin-top:4px">${esc(dateStr)} &middot; run ${esc(runId)} &middot; nothing was executed or posted</div>
    </div>
    <div style="padding:20px;border:1px solid #e2e8f0;border-top:none;border-radius:0 0 8px 8px">
      <p style="font-size:14px">Paste any block below into a Claude Code session opened in the enterprise repo to have it do the task and open a PR.</p>
      <h3 style="font-size:14px">Ready-to-run (${code.length})</h3>
      ${codeBlocks || '<p style="color:#64748b;font-size:13px">No code-doable tasks in scope this run.</p>'}
      <h3 style="font-size:14px">Needs you - not a code fix (${needsYou.length})</h3>
      <ul style="padding-left:18px">${needRows || '<li style="color:#64748b">none</li>'}</ul>
    </div>
  </div>`;

  const text = [
    `TASK WORKER (report-only) - ${dateStr} - run ${runId}`,
    'Nothing was executed or posted to any task ticket.',
    '',
    `READY-TO-RUN PROMPTS (${code.length}):`,
    ...code.map(({ task, prompt }) => `\n### ${task.title}\n${task.url}\n\n${prompt}\n`),
    '',
    `NEEDS YOU (${needsYou.length}):`,
    ...needsYou.map(({ task, kind }) => `- [${kind}] ${task.title} ${task.url}`),
  ].join('\n');

  return { subject, html, text };
}

module.exports = { renderDigest };
