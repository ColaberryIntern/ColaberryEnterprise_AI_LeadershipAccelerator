/**
 * AF12.1 — grouping tool requests into the task they serve.
 *
 * The case that matters is `a task half decided`: that is the state the decide screen could never
 * show, and showing it is the whole reason the key exists.
 */
import { groupIntoTasks, siblingTools } from '../taskGrouping';
import type { ChangeRequestRow } from '../agentChangeRequestService';

type Status = ChangeRequestRow['status'];

function row(
  id: string,
  opts: Partial<{
    task_key: string; task_unblocked: string; tool_name: string; status: Status;
    domain: string; kind: ChangeRequestRow['kind']; at: string;
    has_package: boolean; ready: boolean; bounced: string[];
  }> = {},
): ChangeRequestRow {
  const kind = opts.kind ?? 'tool';
  return {
    id,
    kind,
    domain_key: opts.domain ?? 'admissions',
    title: `${opts.tool_name ?? id}: does a thing`,
    description: null,
    status: opts.status ?? 'submitted',
    requested_by_identity: 'kalkidankin@gmail.com',
    requested_at: opts.at ?? `2026-11-1${id.length}T10:00:00Z`,
    approved_by_identity: null,
    approved_at: null,
    declined_reason: null,
    tool_request: kind === 'tool' ? ({
      task_key: opts.task_key ?? 'weekly_unpaid_explorer_report',
      task_unblocked: opts.task_unblocked ?? 'Send the admissions team the weekly report',
      tool_name: opts.tool_name ?? id,
    } as ChangeRequestRow['tool_request']) : null,
    readiness: {
      has_package: opts.has_package ?? true,
      ready_for_a_human: opts.ready ?? true,
      bounced_blocks: (opts.bounced ?? []) as never,
      bounce_reasons: [] as never,
    } as ChangeRequestRow['readiness'],
  };
}

describe('one task, several tools', () => {
  it('gathers three requests under one key', () => {
    const { tasks } = groupIntoTasks([
      row('read_explorers', { tool_name: 'read_explorers' }),
      row('read_crm_history', { tool_name: 'read_crm_history' }),
      row('build_report', { tool_name: 'build_report' }),
    ]);
    expect(tasks).toHaveLength(1);
    expect(tasks[0].tools.map((t) => t.tool_name).sort())
      .toEqual(['build_report', 'read_crm_history', 'read_explorers']);
  });

  it('shows a task HALF DECIDED, which is the state the old screen could not show', () => {
    const { tasks } = groupIntoTasks([
      row('a', { tool_name: 'a', status: 'approved' }),
      row('b', { tool_name: 'b', status: 'submitted' }),
      row('c', { tool_name: 'c', status: 'submitted' }),
    ]);
    const t = tasks[0];
    expect(t.approved_to_build).toBe(1);
    expect(t.waiting_on_a_decision).toBe(2);
    expect(t.every_tool_decided).toBe(false);
  });

  it('says every tool is decided only when none is still waiting', () => {
    const { tasks } = groupIntoTasks([
      row('a', { tool_name: 'a', status: 'approved' }),
      row('b', { tool_name: 'b', status: 'declined' }),
    ]);
    expect(tasks[0].every_tool_decided).toBe(true);
  });

  it('never calls an approved request "granted", because a grant is a different record', () => {
    const { tasks } = groupIntoTasks([row('a', { tool_name: 'a', status: 'approved' })]);
    expect(tasks[0].tools[0].state).toBe('approved_to_build');
    expect(JSON.stringify(tasks[0])).not.toContain('granted');
  });
});

describe('the task label when the tools disagree about it', () => {
  it('keeps the most specific sentence and does not throw the others away', () => {
    const { tasks } = groupIntoTasks([
      row('a', { tool_name: 'a', task_unblocked: 'Weekly report' }),
      row('b', { tool_name: 'b', task_unblocked: 'Send the admissions team the weekly unpaid Explorer report' }),
    ]);
    expect(tasks[0].task_label).toBe('Send the admissions team the weekly unpaid Explorer report');
    expect(tasks[0].other_labels).toEqual(['Weekly report']);
  });

  it('falls back to the key when nobody wrote a sentence', () => {
    const { tasks } = groupIntoTasks([row('a', { tool_name: 'a', task_unblocked: '' })]);
    expect(tasks[0].task_label).toBe('weekly_unpaid_explorer_report');
  });
});

describe('what is deliberately NOT grouped', () => {
  it('leaves a change request ungrouped rather than inventing a task for it', () => {
    // Kalkidan's real row is `kind: 'change'`. Forcing it into a task would put a grouping on
    // screen that nobody declared.
    const { tasks, ungrouped } = groupIntoTasks([row('kalkidan', { kind: 'change' })]);
    expect(tasks).toHaveLength(0);
    expect(ungrouped.map((r) => r.id)).toEqual(['kalkidan']);
  });

  it('does not merge two domains that happen to use the same word', () => {
    const { tasks } = groupIntoTasks([
      row('a', { tool_name: 'a', domain: 'admissions', task_key: 'weekly_report' }),
      row('b', { tool_name: 'b', domain: 'marketing', task_key: 'weekly_report' }),
    ]);
    expect(tasks).toHaveLength(2);
    expect(tasks.map((t) => t.domain_key).sort()).toEqual(['admissions', 'marketing']);
  });

  it('matches a key case-insensitively, so capitalisation does not split a task', () => {
    const { tasks } = groupIntoTasks([
      row('a', { tool_name: 'a', task_key: 'weekly_report' }),
      row('b', { tool_name: 'b', task_key: 'Weekly_Report' }),
    ]);
    expect(tasks).toHaveLength(1);
    expect(tasks[0].tools).toHaveLength(2);
  });
});

describe('why a tool is not in front of a human', () => {
  it('names the bounced blocks in the readiness check’s own words', () => {
    const { tasks } = groupIntoTasks([
      row('a', { tool_name: 'a', ready: false, bounced: ['simulated_action', 'key_findings'] }),
    ]);
    expect(tasks[0].tools[0].ready_to_decide).toBe(false);
    expect(tasks[0].tools[0].not_ready_because).toEqual(['simulated_action', 'key_findings']);
  });

  it('distinguishes no package at all from an incomplete one', () => {
    const { tasks } = groupIntoTasks([
      row('a', { tool_name: 'a', has_package: false, ready: false }),
    ]);
    expect(tasks[0].tools[0].not_ready_because).toEqual(['no decision package has been written']);
  });
});

describe('siblingTools', () => {
  it('returns the other tools of the task, and not this one', () => {
    const rows = [
      row('a', { tool_name: 'a' }), row('b', { tool_name: 'b' }), row('c', { tool_name: 'c' }),
    ];
    const { task, siblings } = siblingTools(rows, 'b');
    expect(task?.tools).toHaveLength(3);
    expect(siblings.map((s) => s.request_id).sort()).toEqual(['a', 'c']);
  });

  it('an empty sibling list is a real answer: this task needs one tool', () => {
    const { task, siblings } = siblingTools([row('solo', { tool_name: 'solo' })], 'solo');
    expect(task).not.toBeNull();
    expect(siblings).toEqual([]);
  });

  it('returns nothing for a request that belongs to no task', () => {
    const { task, siblings } = siblingTools([row('k', { kind: 'change' })], 'k');
    expect(task).toBeNull();
    expect(siblings).toEqual([]);
  });
});
