// Launch PMO - deterministic critical path engine.
//
// PMBOK 8th ed. Schedule Performance Domain: the Critical Path Method (Figure
// 5-4). Given the task dependency graph the daily heartbeat already derives
// (launchPmoDailyUpdate.detectBlockedTasks emits upstream->downstream edges),
// this computes the LONGEST weighted chain to a launch-gate/leaf. That is the
// sequence where a one-day slip on ANY task slips the whole launch. Everything
// else has slack. This turns CB from "task X is overdue" into "task X is
// overdue AND on the critical path, so the date is now at risk."
//
// Pure graph math: no I/O, no LLM, no Date.now(). Deterministic ordering (ids
// and children are sorted) so the same graph always yields the same path and
// tests are stable. Weights default to 1 per node; pass weightOf(task) to
// weight by estimated effort (e.g. human 1.5 / ai 0.15, mirroring the
// feasibility model) so the "longest" path reflects real work, not task count.
//
// Failure-first: empty graph -> empty path (no throw). Edges referencing
// unknown task ids are ignored. Cycles (which a DAG must not have, but a fuzzy
// subject-overlap edge builder can accidentally create) are detected, broken
// deterministically, and returned in `cycles` rather than hanging.

function toId(x) { return String(x); }

// Build adjacency (from -> [to]) and reverse (to -> [from]) over known nodes
// only. Self-loops and edges to/from unknown ids are dropped.
function buildGraph(tasks, edges) {
  const nodes = new Map();
  for (const t of (tasks || [])) nodes.set(toId(t.id), t);
  const fwd = new Map();
  const rev = new Map();
  for (const id of nodes.keys()) { fwd.set(id, []); rev.set(id, []); }
  const seen = new Set();
  for (const e of (edges || [])) {
    const from = toId(e.from);
    const to = toId(e.to);
    if (from === to) continue;
    if (!nodes.has(from) || !nodes.has(to)) continue;
    const key = `${from}->${to}`;
    if (seen.has(key)) continue;
    seen.add(key);
    fwd.get(from).push(to);
    rev.get(to).push(from);
  }
  for (const list of fwd.values()) list.sort();
  for (const list of rev.values()) list.sort();
  return { nodes, fwd, rev };
}

// Longest forward path weight starting AT each node, over a DAG. Cycle edges
// are skipped (recorded in `cycles`). Returns { dist, next, cycles } where
// dist[id] = max total weight from id to any reachable sink, next[id] = the
// child that realizes it (for path reconstruction).
function longestForward(nodes, fwd, weight) {
  const dist = new Map();
  const next = new Map();
  const state = new Map(); // undefined=unvisited, 1=in-stack, 2=done
  const cycles = [];
  const ids = [...nodes.keys()].sort();

  function dfs(id, stack) {
    if (dist.has(id)) return dist.get(id);
    state.set(id, 1);
    stack.push(id);
    let best = weight(id);
    let bestChild = null;
    for (const child of fwd.get(id)) {
      if (state.get(child) === 1) {
        cycles.push([...stack.slice(stack.indexOf(child)), child]); // back-edge
        continue; // break the cycle: ignore this edge
      }
      const cand = weight(id) + dfs(child, stack);
      if (cand > best || (cand === best && (bestChild === null || child < bestChild))) {
        best = cand;
        bestChild = child;
      }
    }
    stack.pop();
    state.set(id, 2);
    dist.set(id, best);
    next.set(id, bestChild);
    return best;
  }

  for (const id of ids) if (!dist.has(id)) dfs(id, []);
  return { dist, next, cycles };
}

// Longest path weight ENDING at each node (forward pass on the reversed graph),
// used for slack. Reuses longestForward on rev with the same weights.
function longestBackward(nodes, rev, weight) {
  return longestForward(nodes, rev, weight).dist;
}

// Count of transitive descendants (how many tasks ultimately wait on this one).
function transitiveDownstream(nodes, fwd) {
  const memo = new Map();
  const stack = new Set();
  function reach(id) {
    if (memo.has(id)) return memo.get(id);
    if (stack.has(id)) return new Set(); // cycle guard
    stack.add(id);
    const acc = new Set();
    for (const child of fwd.get(id)) {
      acc.add(child);
      for (const d of reach(child)) acc.add(d);
    }
    stack.delete(id);
    memo.set(id, acc);
    return acc;
  }
  const out = new Map();
  for (const id of nodes.keys()) out.set(id, reach(id).size);
  return out;
}

/**
 * computeCriticalPath(tasks, edges, opts)
 *   tasks: [{ id, ... }]
 *   edges: [{ from, to }]  (from is upstream of to; to depends on from)
 *   opts.weightOf(task): number  (default 1)
 * Returns {
 *   criticalPath: [id...] upstream->downstream,
 *   length: number (total weight),
 *   onCriticalPath: Set<id>,
 *   downstreamDirect: Map<id,count>,
 *   downstreamReach: Map<id,count>,
 *   slack: Map<id,number>,     // 0 => on a critical path
 *   cycles: [[id...]],
 * }
 */
function computeCriticalPath(tasks, edges, opts = {}) {
  const { nodes, fwd, rev } = buildGraph(tasks, edges);
  const weightOf = opts.weightOf || (() => 1);
  const wById = new Map();
  for (const [id, t] of nodes) wById.set(id, Math.max(0, Number(weightOf(t)) || 0));
  const weight = (id) => (wById.has(id) ? wById.get(id) : 0);

  if (nodes.size === 0) {
    return { criticalPath: [], length: 0, onCriticalPath: new Set(), downstreamDirect: new Map(), downstreamReach: new Map(), slack: new Map(), cycles: [] };
  }

  const { dist: fwdDist, next, cycles } = longestForward(nodes, fwd, weight);
  const backDist = longestBackward(nodes, rev, weight);

  // Global longest path: start at the node with max forward distance (ties ->
  // smallest id for determinism), then follow `next`.
  const starts = [...nodes.keys()].sort((a, b) => fwdDist.get(b) - fwdDist.get(a) || (a < b ? -1 : 1));
  const length = fwdDist.get(starts[0]);
  const criticalPath = [];
  let cur = starts[0];
  const guard = new Set();
  while (cur != null && !guard.has(cur)) { criticalPath.push(cur); guard.add(cur); cur = next.get(cur); }

  // Slack: a node is on A critical path iff backDist + fwdDist - weight == length.
  const onCriticalPath = new Set();
  const slack = new Map();
  for (const id of nodes.keys()) {
    const through = backDist.get(id) + fwdDist.get(id) - weight(id);
    const s = +(length - through).toFixed(4);
    slack.set(id, s);
    if (s <= 1e-9) onCriticalPath.add(id);
  }

  const downstreamDirect = new Map();
  for (const [id, children] of fwd) downstreamDirect.set(id, children.length);
  const downstreamReach = transitiveDownstream(nodes, fwd);

  return { criticalPath, length, onCriticalPath, downstreamDirect, downstreamReach, slack, cycles };
}

module.exports = { computeCriticalPath, buildGraph };
