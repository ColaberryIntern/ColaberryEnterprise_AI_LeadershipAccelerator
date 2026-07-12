// Launch PMO - risk + critical-path VIEW (the wiring between the deterministic
// engines and the daily executive email).
//
// buildRiskView(state, blockerMap, ctx) turns the daily heartbeat's already-
// computed project state + blocker map into:
//   - ranked: every open task with a PMBOK risk score (launchPmoRiskScore),
//             most-risky first
//   - elevated: the subset scoring above LOW (what Ali actually needs to see)
//   - criticalPath: the longest real dependency chain (launchPmoCriticalPath),
//             ONLY when actual dependency edges exist (>=2 linked tasks)
//   - overdueOnCritical: how many critical-path tasks are already overdue
//             (i.e. the launch date itself is slipping)
//
// The dependency edges come from detectBlockedTasks (approval task -> its open
// upstream), which today is a sparse graph: risk scoring is always active, but
// the critical-path callout stays quiet until enough dependencies are wired.
// That is honest - we show the chain only when there is a real chain.
//
// renderRiskSectionHtml(view, ctx) emits the "Top predicted risks" email block
// (or a green all-clear). Pure string building, self-contained (own esc/pill
// helpers), and it strips em-dashes so it can never trip the Mandrill preflight.
//
// Failure-first: every input is optional-safe. Missing state/areas -> empty
// view. A render over an empty view returns '' so the email simply omits the
// section rather than breaking.

const { scoreTaskRisk } = require('./launchPmoRiskScore');
const { computeCriticalPath } = require('./launchPmoCriticalPath');

// Effort weights mirror the feasibility model (human work dominates schedule).
const TIER_WEIGHT = { HUMAN: 1.5, AI: 0.15, EITHER: 0.8 };
function weightOf(t) { return TIER_WEIGHT[String(t.tier || '').toUpperCase()] || 0.8; }

function collectNodes(state) {
  const nodes = [];
  for (const a of (state && state.areas) || []) {
    for (const t of (a.openTodos || [])) {
      nodes.push({ id: t.id, content: t.content, tier: t.tier, due_on: t.due_on, assignees: t.assignees, area: a.listName, url: t.url });
    }
  }
  return nodes;
}

// blockerMap is Map<taskId, {blocked, upstreamId?}>. Each upstreamId is an edge
// upstream -> this task (this task depends on upstream).
function edgesFromBlockerMap(blockerMap) {
  const edges = [];
  if (!blockerMap || typeof blockerMap.forEach !== 'function') return edges;
  blockerMap.forEach((info, id) => {
    if (info && info.upstreamId != null) edges.push({ from: info.upstreamId, to: id });
  });
  return edges;
}

function buildRiskView(state, blockerMap, ctx = {}) {
  const nodes = collectNodes(state);
  const edges = edgesFromBlockerMap(blockerMap);
  const hasGraph = edges.length > 0;
  const cp = computeCriticalPath(nodes, edges, { weightOf });
  const today = ctx.todayIso;

  const ranked = nodes.map((t) => {
    const key = String(t.id);
    const onCriticalPath = hasGraph && cp.onCriticalPath.has(key);
    const downstreamCount = cp.downstreamReach.get(key) || 0;
    const risk = scoreTaskRisk(t, { todayIso: today, launchIso: ctx.launchIso, onCriticalPath, downstreamCount });
    return { ...t, onCriticalPath, downstreamCount, risk };
  }).sort((a, b) => b.risk.score - a.risk.score || (a.due_on || '9999').localeCompare(b.due_on || '9999'));

  const byId = new Map(nodes.map((n) => [String(n.id), n]));
  const criticalPath = hasGraph && cp.criticalPath.length >= 2
    ? cp.criticalPath.map((id) => byId.get(String(id))).filter(Boolean)
    : [];
  const overdueOnCritical = today ? criticalPath.filter((t) => t.due_on && t.due_on < today).length : 0;

  return {
    ranked,
    elevated: ranked.filter((r) => r.risk.band !== 'LOW'),
    criticalPath,
    criticalCount: criticalPath.length,
    overdueOnCritical,
  };
}

// ---------------------------------------------------------------------------
// Rendering (self-contained; no dependency on the emailAli helpers)
// ---------------------------------------------------------------------------
function esc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
function noDash(s) { return String(s == null ? '' : s).replace(/—/g, '-').replace(/–/g, '-'); }
const BAND_COLORS = {
  CRITICAL: { bg: '#fee2e2', fg: '#7f1d1d' },
  HIGH: { bg: '#ffedd5', fg: '#9a3412' },
  MEDIUM: { bg: '#fef9c3', fg: '#854d0e' },
  LOW: { bg: '#f1f5f9', fg: '#475569' },
};
function bandPill(risk) {
  const c = BAND_COLORS[risk.band] || BAND_COLORS.LOW;
  return `<span style="display:inline-block;padding:2px 8px;border-radius:10px;font-size:10px;font-weight:700;background:${c.bg};color:${c.fg};letter-spacing:0.5px">${risk.band} ${risk.score}</span>`;
}

function renderRiskSectionHtml(view, ctx = {}) {
  if (!view || !Array.isArray(view.ranked)) return '';
  const today = ctx.today;
  const elevated = (view.elevated || []).slice(0, 6);
  const rows = elevated.map((t, i) => {
    const why = (t.risk.drivers || []).slice(0, 2).join('; ');
    const overdue = today && t.due_on && t.due_on < today;
    const dueCell = t.due_on
      ? (overdue ? `<span style="color:#b91c1c;font-weight:700">OVERDUE ${esc(t.due_on)}</span>` : esc(t.due_on))
      : '<span style="color:#92400e">no due date</span>';
    const cpTag = t.onCriticalPath ? ' <span style="font-size:9px;font-weight:700;color:#7f1d1d;background:#fee2e2;padding:1px 5px;border-radius:8px">CRITICAL PATH</span>' : '';
    return `<tr style="background:${i % 2 === 0 ? '#fff' : '#fef2f2'}">
<td style="padding:8px 10px;border-bottom:1px solid #fecaca;font-size:11px;color:#64748b;font-weight:700">${i + 1}</td>
<td style="padding:8px 10px;border-bottom:1px solid #fecaca"><a href="${esc(t.url)}" style="color:#1a365d;text-decoration:none;font-weight:600;font-size:12px">${esc(noDash(t.content)).slice(0, 90)}</a>${cpTag}<div style="font-size:10px;color:#94a3b8">${esc(t.area)}</div></td>
<td style="padding:8px 10px;border-bottom:1px solid #fecaca">${bandPill(t.risk)}</td>
<td style="padding:8px 10px;border-bottom:1px solid #fecaca;font-size:11px;color:#475569">${esc(noDash(why))}</td>
<td style="padding:8px 10px;border-bottom:1px solid #fecaca;font-size:11px;color:#475569">${dueCell}</td>
</tr>`;
  }).join('');

  if (!rows) {
    return '<div style="background:#dcfce7;padding:12px 16px;border-radius:6px;color:#14532d;font-size:12px;font-weight:600;margin-bottom:24px">No elevated task risks predicted. Every open task scores LOW.</div>';
  }

  const cpCallout = view.criticalCount >= 2
    ? `<div style="font-size:12px;color:#7f1d1d;margin:0 0 10px"><strong>Critical path:</strong> ${view.criticalCount} linked tasks${view.overdueOnCritical ? `, <strong>${view.overdueOnCritical} overdue on it (launch date at risk)</strong>` : ' (all on track)'}.</div>`
    : '';

  return `<h2 style="color:#7f1d1d;font-size:17px;margin:0 0 10px;border-bottom:2px solid #7f1d1d;padding-bottom:6px">Top predicted risks (PMBOK-scored)</h2>
${cpCallout}<table cellpadding="0" cellspacing="0" border="0" style="width:100%;border-collapse:collapse;font-size:12px;border:1px solid #fecaca;margin-bottom:24px">
<thead><tr style="background:#7f1d1d;color:white"><th align="left" style="padding:9px 10px;font-size:10px;letter-spacing:1px">#</th><th align="left" style="padding:9px 10px;font-size:10px;letter-spacing:1px">TASK</th><th align="left" style="padding:9px 10px;font-size:10px;letter-spacing:1px">RISK</th><th align="left" style="padding:9px 10px;font-size:10px;letter-spacing:1px">WHY</th><th align="left" style="padding:9px 10px;font-size:10px;letter-spacing:1px">DUE</th></tr></thead>
<tbody>${rows}</tbody></table>`;
}

module.exports = { buildRiskView, renderRiskSectionHtml, weightOf };
