/**
 * The human/AI task breakdown, as ONE whole-flow picture.
 *
 * ## Why this exists, in the DRI's words
 *
 * Demo Tuesday, 2026-11-03, 10:06 Central (transcript, 01:26:00):
 *
 *   "Take all of that information and then create a visual that gives you a flow in line with
 *    ... the whole thing is a big picture instead of individual positions."
 *
 * and the split it has to show, from Akiwam at 01:28:27, which Ali endorsed on the call:
 *
 *   "we let the AI work on most of parts, and we're gonna give a human, the approval side"
 *
 * The purpose is a screenshot for an RFP response (01:25:00: "we're gonna be taking screenshots
 * of this application"), so this renders at a fixed, print-friendly width and does not depend on
 * a browser, a CDN or a client-side chart library.
 *
 * ## Why server-generated SVG rather than Mermaid
 *
 * Following `services/delivery/scopeDiagram.ts`, whose header records the decision (Ali,
 * 2026-09-05). A chart that renders empty because a CDN was slow still looks finished, and this
 * output is going into a bid.
 *
 * ## What it draws from, and what it refuses to invent
 *
 * `AllocationRow.execution_class` is the authoritative human/AI axis. It is DERIVED, by
 * `deriveAllocation`, from the assignments — so this renderer never recomputes it. Where a task
 * has no allocation row, it is drawn as UNCLASSIFIED rather than guessed into a lane: a diagram
 * that silently shows an unclassified task as human is worse than one that admits the gap, since
 * the whole point is to show who does what.
 */
import type {
  FactoryTask,
  Assignment,
  AllocationRow,
  Role,
  TransitionEdge,
  AgentTeam,
  Surface,
  RoleMapRow,
} from '../contracts/factoryContract';

export interface HumanAiFlowInput {
  readonly tasks: readonly FactoryTask[];
  readonly assignments: readonly Assignment[];
  readonly allocation: readonly AllocationRow[];
  readonly roles: readonly Role[];
  readonly transitions: readonly TransitionEdge[];
  /** Shown in the header. The project or bid this flow belongs to. */
  readonly title?: string;
  readonly subtitle?: string;
  /**
   * L10.5. OPTIONAL on purpose: every existing caller and fixture predates these three, and
   * making them required would be a breaking change to a published type for no gain. Absent
   * means "not declared", which the rules below render as a NAMED empty state rather than as
   * silence — see VR8 in `humanAiVisualRules.ts`.
   */
  readonly agent_teams?: readonly AgentTeam[];
  readonly surfaces?: readonly Surface[];
  readonly role_map?: readonly RoleMapRow[];
}

import {
  type Lane, type Placed, LANE_LABELS, LANE_ORDER, GEO,
  laneOf, levelsOf, columnWidthFor, wrapText,
} from './humanAiFlowLayout';

/** Cherry/leaf tokens from `frontend/src/styles/tokens.css`, not invented hex. */
const C = {
  cherry: '#FB2832',
  cherryDeep: '#C20E1E',
  cherryBg: '#FFF0F1',
  leaf: '#77BB4A',
  text: '#2d3748',
  textLight: '#718096',
  border: '#e2e8f0',
  bgAlt: '#f7fafc',
  white: '#ffffff',
};


function esc(s: unknown): string {
  return String(s ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}


/**
 * The whole flow as one standalone SVG string.
 *
 * Standalone on purpose: it carries its own fonts-by-family and colours and references nothing
 * external, so it renders identically inside an HTML page, a PDF, or on its own.
 */
export function renderHumanAiFlowSvg(input: HumanAiFlowInput): string {
  const allocByTask = new Map(input.allocation.map((a) => [a.task_id, a]));
  const roleName = new Map(input.roles.map((r) => [r.id, r.name]));
  const perfByTask = new Map<string, Assignment>();
  const apprByTask = new Map<string, Assignment>();
  for (const a of input.assignments) {
    if (a.responsibility === 'PERFORMER' && !perfByTask.has(a.task_id)) perfByTask.set(a.task_id, a);
    // ACCOUNTABLE or APPROVER is "the approval side" in the DRI's phrasing; either counts.
    if ((a.responsibility === 'ACCOUNTABLE' || a.responsibility === 'APPROVER')
      && !apprByTask.has(a.task_id)) apprByTask.set(a.task_id, a);
  }

  const COL_W = columnWidthFor(input.transitions);
  const level = levelsOf(input.tasks, input.transitions);
  const lanes = new Map<string, Lane>();
  for (const t of input.tasks) lanes.set(t.id, laneOf(t, allocByTask.get(t.id)));

  // Only lanes that are actually used get vertical space: an empty "Not classified" band would
  // read as a finding when there is nothing wrong.
  const usedLanes = LANE_ORDER.filter((l) => [...lanes.values()].includes(l));

  // Stack within (level, lane) so a branch to two tasks at the same depth does not overlap.
  const slot = new Map<string, number>();
  const counter = new Map<string, number>();
  for (const t of [...input.tasks].sort((a, b) => (level.get(a.id)! - level.get(b.id)!))) {
    const key = `${level.get(t.id)}|${lanes.get(t.id)}`;
    const n = counter.get(key) ?? 0;
    slot.set(t.id, n);
    counter.set(key, n + 1);
  }

  const laneRows = new Map<Lane, number>();
  for (const l of usedLanes) {
    let maxStack = 1;
    for (const t of input.tasks) {
      if (lanes.get(t.id) !== l) continue;
      maxStack = Math.max(maxStack, (counter.get(`${level.get(t.id)}|${l}`) ?? 1));
    }
    laneRows.set(l, maxStack);
  }

  const laneTop = new Map<Lane, number>();
  let y = GEO.HEADER_H;
  for (const l of usedLanes) {
    laneTop.set(l, y);
    y += (laneRows.get(l) ?? 1) * (GEO.NODE_H + GEO.ROW_GAP) + 18;
  }
  const totalH = y + 96; // room for the legend
  const maxLevel = [...level.values()].reduce((m, v) => Math.max(m, v), 0);
  const totalW = GEO.PAD_X * 2 + GEO.LANE_LABEL_W + (maxLevel + 1) * COL_W;

  // VR3/VR4 — which team owns a task, and which surface it lands on. Built as lookups so the
  // node renderer states ownership instead of the reader inferring it from position.
  const teamOf = new Map<string, AgentTeam>();
  for (const t of input.agent_teams ?? []) {
    for (const id of t.task_ids) if (!teamOf.has(id)) teamOf.set(id, t);
  }
  const surfaceOf = new Map<string, Surface>();
  for (const s of input.surfaces ?? []) {
    for (const id of s.task_ids) if (!surfaceOf.has(id)) surfaceOf.set(id, s);
  }

  const placed: Placed[] = input.tasks.map((t) => {
    const lane = lanes.get(t.id)!;
    return {
      task: t,
      lane,
      alloc: allocByTask.get(t.id),
      performer: perfByTask.get(t.id),
      approver: apprByTask.get(t.id),
      x: GEO.PAD_X + GEO.LANE_LABEL_W + level.get(t.id)! * COL_W,
      y: (laneTop.get(lane) ?? GEO.HEADER_H) + (slot.get(t.id) ?? 0) * (GEO.NODE_H + GEO.ROW_GAP),
    };
  });
  const byId = new Map(placed.map((p) => [p.task.id, p]));

  const out: string[] = [];
  out.push(`<svg xmlns="http://www.w3.org/2000/svg" width="${totalW}" height="${totalH}" `
    + `viewBox="0 0 ${totalW} ${totalH}" role="img" `
    + `aria-label="${esc(input.title ?? 'Human and AI task flow')}">`);
  out.push(`<rect width="${totalW}" height="${totalH}" fill="${C.white}"/>`);
  out.push('<defs>'
    + `<marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">`
    + `<path d="M0,0 L10,5 L0,10 z" fill="${C.textLight}"/></marker>`
    + `<marker id="arrow-rework" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">`
    + `<path d="M0,0 L10,5 L0,10 z" fill="${C.cherry}"/></marker>`
    + '</defs>');

  // Header
  out.push(`<text x="${GEO.PAD_X}" y="38" font-family="Segoe UI, system-ui, sans-serif" `
    + `font-size="23" font-weight="700" fill="${C.cherry}">${esc(input.title ?? 'Human and AI task flow')}</text>`);
  if (input.subtitle) {
    out.push(`<text x="${GEO.PAD_X}" y="62" font-family="Segoe UI, system-ui, sans-serif" `
      + `font-size="13" fill="${C.textLight}">${esc(input.subtitle)}</text>`);
  }

  // VR6 — PRE-AI BASELINE. "AI does most of it" means nothing without what it was before, so
  // where role_map says a function changed, the picture says how many and names them.
  const displaced = input.role_map ?? [];
  if (displaced.length > 0) {
    const fns = displaced.map((r) => r.previous_function).filter(Boolean).join('; ');
    out.push(`<text x="${GEO.PAD_X}" y="80" font-family="Segoe UI, system-ui, sans-serif" `
      + `font-size="11.5" fill="${C.text}">`
      + `${esc(`Before AI: ${displaced.length} function(s) changed - ${wrapText(fns, 110, 1)[0]}`)}</text>`);
  } else {
    out.push(`<text x="${GEO.PAD_X}" y="80" font-family="Segoe UI, system-ui, sans-serif" `
      + `font-size="11.5" fill="${C.textLight}">Before AI: no displaced function declared</text>`);
  }

  // VR8 — EVERY EMPTY STATE SAYS WHICH EMPTY IT IS.
  //
  // Two different facts that a blank panel renders identically: nothing was generated, and
  // something was generated that allocated nothing. Reading the first as the second is how a
  // pipeline that never ran gets reported as a clean result.
  if (input.tasks.length === 0) {
    out.push(`<text x="${GEO.PAD_X}" y="${GEO.HEADER_H + 34}" font-family="Segoe UI, system-ui, sans-serif" `
      + `font-size="14" font-weight="600" fill="${C.textLight}">No decomposition yet - nothing has been generated for this project.</text>`);
  } else if (input.allocation.length === 0) {
    out.push(`<text x="${GEO.PAD_X}" y="${GEO.HEADER_H + 34}" font-family="Segoe UI, system-ui, sans-serif" `
      + `font-size="14" font-weight="600" fill="${C.textLight}">Nothing allocated yet - ${input.tasks.length} task(s) exist but none is classified human or AI.</text>`);
  }

  // Lane bands
  for (const l of usedLanes) {
    const top = laneTop.get(l)! - 14;
    const h = (laneRows.get(l) ?? 1) * (GEO.NODE_H + GEO.ROW_GAP) + 6;
    out.push(`<rect x="${GEO.PAD_X - 10}" y="${top}" width="${totalW - GEO.PAD_X * 2 + 20}" height="${h}" `
      + `rx="10" fill="${l === 'ai' ? C.cherryBg : C.bgAlt}" stroke="${C.border}"/>`);
    out.push(`<text x="${GEO.PAD_X - 2}" y="${top + 15}" font-family="Segoe UI, system-ui, sans-serif" `
      + `font-size="11" font-weight="600" letter-spacing="0.6" `
      + `fill="${l === 'ai' ? C.cherryDeep : C.textLight}">${esc(LANE_LABELS[l].toUpperCase())}</text>`);
  }

  // Edges first, so nodes sit on top of them.
  for (const e of input.transitions) {
    const a = byId.get(e.from_task_id);
    const b = byId.get(e.to_task_id);
    if (!a || !b) continue;
    const x1 = a.x + GEO.NODE_W;
    const y1 = a.y + GEO.NODE_H / 2;
    const x2 = b.x;
    const y2 = b.y + GEO.NODE_H / 2;
    const mid = x1 + Math.max(18, (x2 - x1) / 2);
    const stroke = e.is_rework ? C.cherry : C.textLight;
    const dash = e.is_rework ? ' stroke-dasharray="6 4"' : '';
    const marker = e.is_rework ? 'arrow-rework' : 'arrow';
    // A rework edge runs backwards, so route it under the row rather than through the nodes.
    const d = e.is_rework
      ? `M ${x1 - GEO.NODE_W / 2} ${a.y + GEO.NODE_H} V ${Math.max(y1, y2) + 34} H ${x2 + GEO.NODE_W / 2} V ${b.y + GEO.NODE_H}`
      : `M ${x1} ${y1} H ${mid} V ${y2} H ${x2}`;
    out.push(`<path d="${d}" fill="none" stroke="${stroke}" stroke-width="1.6"${dash} marker-end="url(#${marker})"/>`);
    if (e.condition) {
      // Centred on the vertical run, in the gap between columns, so it cannot be overdrawn by
      // the target node. Anchored middle rather than start for the same reason.
      out.push(`<text x="${mid}" y="${y2 - 8}" text-anchor="middle" `
        + `font-family="Segoe UI, system-ui, sans-serif" font-size="11" font-style="italic" `
        + `fill="${C.textLight}">${esc(e.condition)}</text>`);
    }
  }

  // Nodes
  for (const p of placed) {
    const isAi = p.lane === 'ai';
    const isSpine = p.lane === 'spine';
    const accent = p.lane === 'unclassified' ? C.textLight : (isAi ? C.cherry : (isSpine ? C.textLight : C.leaf));
    const h = isSpine ? 48 : GEO.NODE_H;
    const yTop = isSpine ? p.y + (GEO.NODE_H - 48) / 2 : p.y;
    out.push(`<rect x="${p.x}" y="${yTop}" width="${GEO.NODE_W}" height="${h}" rx="9" `
      + `fill="${C.white}" stroke="${C.border}" stroke-width="1.2"/>`);
    out.push(`<rect x="${p.x}" y="${yTop}" width="4.5" height="${h}" rx="2" fill="${accent}"/>`);

    if (isSpine) {
      out.push(`<text x="${p.x + 16}" y="${yTop + 29}" font-family="Segoe UI, system-ui, sans-serif" `
        + `font-size="12.5" font-weight="700" fill="${C.text}">${esc(p.task.title)}</text>`);
      continue;
    }

    const lines = wrapText(p.task.title, 34, 2);
    lines.forEach((ln, i) => {
      out.push(`<text x="${p.x + 15}" y="${yTop + 22 + i * 15}" font-family="Segoe UI, system-ui, sans-serif" `
        + `font-size="12.5" font-weight="600" fill="${C.text}">${esc(ln)}</text>`);
    });

    const badge = p.alloc
      ? (p.alloc.execution_class === 'ai_autonomous' ? 'AI, NO APPROVER' : p.alloc.execution_class.replace(/_/g, ' '))
      : 'unclassified';
    const badgeY = yTop + 22 + lines.length * 15 + 4;
    out.push(`<rect x="${p.x + 15}" y="${badgeY}" width="${Math.min(GEO.NODE_W - 30, 9 + badge.length * 6.1)}" height="16" `
      + `rx="8" fill="${isAi ? C.cherryBg : C.bgAlt}" stroke="${accent}" stroke-width="0.9"/>`);
    out.push(`<text x="${p.x + 20}" y="${badgeY + 12}" font-family="Segoe UI, system-ui, sans-serif" `
      + `font-size="9.5" font-weight="600" fill="${isAi ? C.cherryDeep : C.text}">${esc(badge.toUpperCase())}</text>`);

    const perf = p.performer
      ? `${p.performer.executor?.type === 'agent' ? 'Agent' : 'Person'}: ${roleName.get(p.performer.role_id) ?? p.performer.role_id}`
      : 'No performer recorded';
    const appr = p.approver
      ? `Approves: ${roleName.get(p.approver.role_id) ?? p.approver.role_id}`
      : (isAi ? 'No human approver' : '');
    out.push(`<text x="${p.x + 15}" y="${badgeY + 31}" font-family="Segoe UI, system-ui, sans-serif" `
      + `font-size="10.5" fill="${C.textLight}">${esc(wrapText(perf, 40, 1)[0])}</text>`);
    if (appr) {
      out.push(`<text x="${p.x + 15}" y="${badgeY + 45}" font-family="Segoe UI, system-ui, sans-serif" `
        + `font-size="10.5" fill="${p.approver ? C.text : C.cherry}" `
        + `font-weight="${p.approver ? '400' : '600'}">${esc(wrapText(appr, 40, 1)[0])}</text>`);
    }

    // VR3 — NAMED, SUBJECT-BOUNDED AGENTS. An AI task says which team owns it and what that
    // team's subject is. A team called "AI" with no subject is the monolith relabelled, so the
    // subject is rendered next to the name rather than left in the data.
    const team = teamOf.get(p.task.id);
    if (isAi) {
      const teamLabel = team
        ? `Team: ${team.name} - ${team.subject}`
        : 'No team owns this AI task';
      out.push(`<text x="${p.x + 15}" y="${badgeY + 59}" font-family="Segoe UI, system-ui, sans-serif" `
        + `font-size="10" fill="${team ? C.cherryDeep : C.cherry}" `
        + `font-weight="${team ? '400' : '600'}">${esc(wrapText(teamLabel, 42, 1)[0])}</text>`);
    }
  }

  // VR4 — ONE SURFACE. Human tasks have to converge somewhere, and the picture has to show
  // where. Human work with an owner and no destination is what grew one screen and one login
  // per role in the first cohort's app: the contract permitted it, which was the real defect.
  // So the count per surface is rendered, external is marked external, and "no surface" is
  // stated rather than left as white space.
  const humanTasks = placed.filter((p) => p.lane === 'human');
  const surfaceBandY = totalH - 76;
  if (humanTasks.length > 0) {
    const surfaces = input.surfaces ?? [];
    let label: string;
    if (surfaces.length === 0) {
      label = `${humanTasks.length} human task(s) land on NO surface - no destination declared`;
    } else {
      const consoles = surfaces.filter((s) => s.kind === 'console');
      const parts = surfaces.map((s) => {
        const n = humanTasks.filter((p) => surfaceOf.get(p.task.id)?.id === s.id).length;
        return `${s.name}${s.kind === 'external' ? ' (external)' : ''}: ${n}`;
      });
      const prefix = consoles.length === 1
        ? 'One console'
        : (consoles.length === 0 ? 'NO console' : `${consoles.length} consoles - should be one`);
      label = `${prefix} - ${parts.join('; ')}`;
    }
    out.push(`<text x="${GEO.PAD_X}" y="${surfaceBandY}" font-family="Segoe UI, system-ui, sans-serif" `
      + `font-size="11" fill="${C.text}">${esc(`Human work lands on: ${wrapText(label, 120, 1)[0]}`)}</text>`);
  }

  // Legend. Counts are computed, never typed in.
  const counts = new Map<Lane, number>();
  for (const l of usedLanes) counts.set(l, placed.filter((p) => p.lane === l).length);
  const legendY = totalH - 52;
  out.push(`<line x1="${GEO.PAD_X}" y1="${legendY - 18}" x2="${totalW - GEO.PAD_X}" y2="${legendY - 18}" stroke="${C.border}"/>`);
  let lx = GEO.PAD_X;
  for (const l of usedLanes) {
    const col = l === 'ai' ? C.cherry : (l === 'human' ? C.leaf : C.textLight);
    out.push(`<rect x="${lx}" y="${legendY}" width="11" height="11" rx="3" fill="${col}"/>`);
    const label = `${LANE_LABELS[l]} (${counts.get(l) ?? 0})`;
    out.push(`<text x="${lx + 17}" y="${legendY + 10}" font-family="Segoe UI, system-ui, sans-serif" `
      + `font-size="11" fill="${C.text}">${esc(label)}</text>`);
    lx += 30 + label.length * 6.0;
  }
  const rework = input.transitions.filter((e) => e.is_rework).length;
  if (rework > 0) {
    out.push(`<line x1="${lx}" y1="${legendY + 6}" x2="${lx + 22}" y2="${legendY + 6}" `
      + `stroke="${C.cherry}" stroke-width="1.6" stroke-dasharray="6 4"/>`);
    out.push(`<text x="${lx + 28}" y="${legendY + 10}" font-family="Segoe UI, system-ui, sans-serif" `
      + `font-size="11" fill="${C.text}">Rework (${rework})</text>`);
  }

  out.push('</svg>');
  return out.join('\n');
}
