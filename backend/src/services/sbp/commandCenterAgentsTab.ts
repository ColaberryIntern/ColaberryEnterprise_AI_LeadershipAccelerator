/**
 * commandCenterAgentsTab — the AI agents tab of the Story 000 prompt.
 *
 * Split out of commandCenterTabs.ts, which was past the 500-line ceiling. PURE:
 * same context in, byte-identical lines out.
 */
import { AUTONOMY_LABEL, bullet, good, type TabContext } from './commandCenterTabContext';
import { unproducedInputs } from './planDocumentInsights';

export interface WorkflowArrow { from: string; to: string; labels: string[] }

/**
 * One arrow per pair of agents. `derived.handoffs` has one entry per thing
 * passed, so ShiftFill v5 had two Offer Sender → Summary Generator entries, and
 * a builder drawing one arrow each put two labels on the same path.
 */
export function workflowArrows(handoffs: TabContext['handoffs']): WorkflowArrow[] {
  const byPair = new Map<string, WorkflowArrow>();
  for (const h of handoffs) {
    const k = `${h.from_agent}\u0000${h.to_agent}`;
    const a = byPair.get(k) ?? { from: h.from_agent, to: h.to_agent, labels: [] };
    if (!a.labels.includes(h.via)) a.labels.push(h.via);
    byPair.set(k, a);
  }
  return [...byPair.values()];
}

/** Agents with three or more outgoing arrows: where labels collide. */
export function fanOuts(arrows: readonly WorkflowArrow[]): { from: string; count: number }[] {
  const count = new Map<string, number>();
  for (const a of arrows) count.set(a.from, (count.get(a.from) ?? 0) + 1);
  return [...count.entries()].filter(([, n]) => n >= 3).map(([from, n]) => ({ from, count: n }));
}

/**
 * The diagram's columns, left to right, so the builder places nodes instead of inventing a layout.
 * An agent sits one column after the furthest agent that feeds it. An arrow that would close a loop
 * does not push anything right. `apart` is every agent with no hand-off at all.
 *
 * ShiftFill v13 (2026-11-25): eleven arrows, but all ten agents were stacked in one column, so every
 * arrow ran down the same side and crossed the others.
 */
export function workflowColumns(
  names: readonly string[],
  arrows: readonly WorkflowArrow[],
): { columns: string[][]; apart: string[] } {
  const inGraph = new Set(arrows.flatMap((a) => [a.from, a.to]));
  const known = names.filter((n) => inGraph.has(n));
  const feeders = new Map<string, string[]>(known.map((n) => [n, []]));
  for (const a of arrows) if (feeders.has(a.from) && a.from !== a.to) feeders.get(a.to)?.push(a.from);

  const depth = new Map<string, number>();
  const visiting = new Set<string>();
  const depthOf = (n: string): number => {
    const done = depth.get(n);
    if (done !== undefined) return done;
    if (visiting.has(n)) return -1;
    visiting.add(n);
    const d = Math.max(-1, ...(feeders.get(n) ?? []).map(depthOf)) + 1;
    visiting.delete(n);
    depth.set(n, d);
    return d;
  };
  const columns: string[][] = [];
  for (const n of known) (columns[depthOf(n)] ??= []).push(n);
  return { columns: columns.filter(Boolean), apart: names.filter((n) => !inGraph.has(n)) };
}

export function agentsTab(c: TabContext): string[] {
  const { plan, agents, handoffs } = c;
  const lines: string[] = [];
  lines.push('### 7. AI agents');
  lines.push(
    'Source: `plan.agents[]` — one card each, with `name`, `purpose`, `trigger_type`, '
    + '`trigger`, `inputs`, `outputs`, `autonomy_level`, `approval_gates` (what a person '
    + 'must release), `hard_rules` (what nobody can override; may be absent), '
    + '`escalation_rules`, `skills` and `owns` (the story ids it owns, which you join back '
    + 'to the plan and the progress file). `plan.derived.counts.agents_by_autonomy` gives '
    + 'you the roster breakdown without counting them yourself. `plan.derived.handoffs` is '
    + 'the list of hand-offs: agent A produces something agent B reads.',
  );
  lines.push(
    'What is NOT there: whether any agent has ever run. There is no run history, no last-run '
    + 'time and no success rate in these files, because none of that exists until you build '
    + 'the agent and it starts running. Show the design, and show "no runs recorded" — never '
    + 'a zero success rate, which reads as an agent that ran and failed.',
  );
  if (agents.length) {
    lines.push('One card per agent. Each shows what fires it, what it reads and produces, how much it decides on its own, and when it must stop and ask:');
    for (const a of agents) {
      lines.push('');
      lines.push(`**${a.name}** — ${a.purpose}`);
      lines.push(bullet(`Fires on: ${a.trigger || 'not specified'} (${a.trigger_type})`));
      if (a.inputs.length) lines.push(bullet(`Reads: ${a.inputs.join(', ')}`));
      if (a.outputs.length) lines.push(bullet(`Produces: ${a.outputs.join(', ')}`));
      lines.push(bullet(`Autonomy: **${AUTONOMY_LABEL[a.autonomy_level]}**`));
      if (a.approval_gates.length) {
        lines.push(bullet(`Waits for a person because of: ${a.approval_gates.join('; ')}`));
      } else if (a.autonomy_level === 'acts_with_approval') {
        // ShiftFill v3: the Gap Notifier "waits for a human" with nothing named to wait on.
        lines.push(bullet(
          'Waits for a person, but the plan names no approval point for it. Show this as an '
          + 'open question on the card ("who releases this, and what do they check?"), never '
          + 'as an empty approval queue that looks finished.',
        ));
      }
      if (a.hard_rules?.length) {
        lines.push(bullet(`Rules it enforces itself (nobody can override them): ${a.hard_rules.join('; ')}`));
      }
      if (a.escalation_rules.length) lines.push(bullet(`Stops and asks when: ${a.escalation_rules.join('; ')}`));
      if (a.skills.length) lines.push(bullet(`Skills it needs: ${a.skills.join(', ')}`));
      lines.push(bullet(`Owns: ${a.owns.join(', ') || 'nothing yet'}`));
    }
    lines.push('');
    if (handoffs.length) {
      const arrows = workflowArrows(handoffs);
      lines.push(
        'How they hand work to each other, from `plan.derived.handoffs`. That list has one entry '
        + 'per thing passed; the diagram has ONE arrow per pair of agents, so the pairs are '
        + 'grouped for you here:',
      );
      arrows.forEach((a) => lines.push(bullet(`${a.from} → ${a.to} (${a.labels.join(', ')})`)));
      const { columns, apart } = workflowColumns(agents.map((a) => a.name), arrows);
      lines.push('Place the diagram\'s nodes in these columns, left to right:');
      columns.forEach((names, i) => lines.push(bullet(`Column ${i + 1}: ${names.join(', ')}`)));
      if (apart.length) {
        lines.push(bullet(`Below the columns, in a row of their own with no arrows between them: ${apart.join(', ')}`));
      }
      const busy = fanOuts(arrows);
      if (busy.length) {
        // ShiftFill v5: Offer Sender fed three agents and its labels drew on top of each other.
        lines.push(bullet(
          `Crowded spots: ${busy.map((b) => `${b.from} feeds ${b.count} agents`).join('; ')}. `
          + 'This is where labels collide, so check it first.',
        ));
      }
      lines.push('');
    }
    const loose = unproducedInputs(agents);
    if (loose.length) {
      // ShiftFill v7: three agents read "Shift acceptance", which no agent produced.
      lines.push('Inputs no agent produces. Each is a missing hand-off or something that arrives from outside; the plan does not say which:');
      loose.forEach((l) => lines.push(bullet(`${l.agent} reads "${l.input}"`)));
      lines.push(
        'Show each one on its agent card and as a marker on that agent\'s node in the diagram, '
        + 'labelled "no agent produces this yet" (a marker, not an arrow), and list it in the Knowledge base as a question for you: '
        + 'which agent should pass it on, or where does it come from? Never draw an arrow the plan '
        + 'does not state.',
      );
      lines.push('');
    }
    lines.push(
      'Autonomy is not decoration. An agent marked "waits for approval" must have somewhere on '
      + 'this page showing what is waiting and who has to release it — otherwise the guardrail '
      + 'exists only in the plan.',
    );
  } else {
    lines.push('Your plan does not carry a scoped agent roster yet, so build this tab from who owns each story:');
    const by = new Map<string, string[]>();
    for (const s of plan.stories) {
      const name = (s.owner_agent || '').trim() || 'Unassigned';
      if (!by.has(name)) by.set(name, []);
      by.get(name)!.push(s.id);
    }
    [...by.entries()].forEach(([name, ids]) => lines.push(bullet(`**${name}** — owns ${ids.join(', ')}`)));
    lines.push('');
    lines.push('These are owners, not scoped agents — say so on the tab rather than presenting a job title as an AI agent.');
  }
  lines.push('');
  // The old line said "On real data there are no skills yet", next to a plan in
  // which every agent HAS a skills list. Two different facts, now named apart.
  lines.push(
    'Each card shows two different skill facts, labelled apart: **skills it needs**, which is '
    + '`skills[]` from the plan and is real data, and **skills built**, which nothing in these '
    + 'files records yet, so it reads "none built yet" rather than an empty box.',
  );
  lines.push(good(
    'a workflow diagram above the cards: one node per agent, laid out in the order work flows, '
    + 'ONE arrow per pair of agents (the grouped list above), labelled with what passes along it, '
    + 'and the trigger drawn as the entry point (an event, a schedule, a person). Every label '
    + 'stays readable: no label overlaps another label, an arrow or a node. Where one agent '
    + 'feeds several, spread the receiving nodes apart vertically and put each label near the '
    + 'receiving end of its own arrow, or, if it still does not fit, number the arrows and list '
    + 'the numbered labels in a key under the diagram. Check this at the narrowest width the page '
    + 'supports, not only at full width. The whole diagram is visible at desktop width with no '
    + 'scrolling: nodes sit in the columns listed above when they are listed (never one tall stack), '
    + 'arrows run left to right into the next column, one that skips a column passes above or below '
    + 'the nodes between, and no two arrows share a line. Below 700px, drop the lines: stack the '
    + 'nodes in column order and list under each node what it hands to whom. Nodes are '
    + 'shaped or coloured by autonomy, so a reader can see at a glance where a human sits in '
    + 'the loop. Then an approval queue: for each agent that waits for a human, what it would '
    + 'be waiting on and who releases it (empty on real data, and saying so). Then the cards, '
    + 'each opening a detail page with its stories and their verification state.',
  ));
  // ShiftFill v5b (2026-11-21): a wide label column ("Waits for a person because of")
  // squeezed the values, so words broke mid-word ("Ranke / d") and the autonomy
  // badge ran past the card edge. Readability is part of the card, not polish.
  lines.push(good(
    'agent cards whose text reads cleanly: each label sits above its value, or the value '
    + 'column gets at least half the card width; no word ever breaks mid-word (wrap between '
    + 'words only); badges and pills stay inside the card and wrap onto their own line when '
    + 'space runs out. Check this at the narrowest width the page supports, not only at full width.',
  ));
  lines.push('');
  return lines;
}
