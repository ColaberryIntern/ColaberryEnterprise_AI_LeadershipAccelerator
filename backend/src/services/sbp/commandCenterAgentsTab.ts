/**
 * commandCenterAgentsTab — the AI agents tab of the Story 000 prompt.
 *
 * Split out of commandCenterTabs.ts, which was past the 500-line ceiling. PURE:
 * same context in, byte-identical lines out.
 */
import { AUTONOMY_LABEL, bullet, good, type TabContext } from './commandCenterTabContext';

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
      lines.push('How they hand work to each other, from `plan.derived.handoffs`:');
      handoffs.forEach((h) => lines.push(bullet(`${h.from_agent} → ${h.to_agent} (${h.via})`)));
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
    + 'an arrow for every entry in `plan.derived.handoffs` labelled with what passes along it, '
    + 'and the trigger drawn as the entry point (an event, a schedule, a person). Nodes are '
    + 'shaped or coloured by autonomy, so a reader can see at a glance where a human sits in '
    + 'the loop. Then an approval queue: for each agent that waits for a human, what it would '
    + 'be waiting on and who releases it (empty on real data, and saying so). Then the cards, '
    + 'each opening a detail page with its stories and their verification state.',
  ));
  lines.push('');
  return lines;
}
