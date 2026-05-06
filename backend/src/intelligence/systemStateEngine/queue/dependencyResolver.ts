/**
 * dependencyResolver — resolves cross-task dependencies and produces
 * a topological ordering. Tasks downstream of unsatisfied dependencies
 * get state='blocked'; tasks with all dependencies met become 'ready'.
 *
 * Cycle detection is mandatory — a cycle is a contradiction in itself
 * and gets reported as queue_ordering_inconsistency.
 */
import type {
  AuthoritativeTask,
  ContradictionFlag,
} from '../types/systemState.types';

export interface DependencyResolution {
  readonly tasks: ReadonlyArray<AuthoritativeTask>;
  readonly cycles: ReadonlyArray<ReadonlyArray<string>>;  // each cycle is an array of task ids
  readonly blocked_by_missing: ReadonlyArray<string>;     // task ids that reference non-existent dependencies
}

/**
 * Take a flat task list (with .dependencies set), figure out which are
 * ready vs blocked vs failing-dependency, and return a normalized list.
 * Does NOT change priority_score / calculated_rank — that's priorityRanker's job.
 */
export function resolveDependencies(tasks: ReadonlyArray<AuthoritativeTask>): DependencyResolution {
  const taskMap = new Map(tasks.map(t => [t.id, t]));
  const cycles = detectCycles(tasks, taskMap);
  const cycleSet = new Set(cycles.flat());

  const blockedByMissing: string[] = [];
  const result: AuthoritativeTask[] = [];

  for (const task of tasks) {
    let state = task.state;
    const reasoning = [...task.reasoning];

    // Check if part of a cycle
    if (cycleSet.has(task.id)) {
      state = 'blocked';
      reasoning.push(`In dependency cycle: ${cycles.find(c => c.includes(task.id))?.join(' → ')}`);
    } else {
      // Resolve dependencies
      const unmet: string[] = [];
      const missing: string[] = [];
      for (const depId of task.dependencies) {
        const dep = taskMap.get(depId);
        if (!dep) {
          missing.push(depId);
          continue;
        }
        if (dep.state !== 'validated' && dep.state !== 'in_progress') {
          unmet.push(depId);
        }
      }

      if (missing.length > 0) {
        blockedByMissing.push(task.id);
        state = 'blocked';
        reasoning.push(`Missing dependency tasks: ${missing.join(', ')}`);
      } else if (unmet.length > 0 && state === 'pending') {
        state = 'blocked';
        reasoning.push(`Waiting on dependencies: ${unmet.join(', ')}`);
      } else if (state === 'pending') {
        state = 'ready';
      }
    }

    result.push({ ...task, state, reasoning: Object.freeze(reasoning) });
  }

  return {
    tasks: Object.freeze(result),
    cycles: Object.freeze(cycles),
    blocked_by_missing: Object.freeze(blockedByMissing),
  };
}

/**
 * Tarjan-flavored cycle detection. Returns each cycle as an array of task ids
 * in cycle order. Empty array if no cycles.
 */
function detectCycles(
  tasks: ReadonlyArray<AuthoritativeTask>,
  taskMap: ReadonlyMap<string, AuthoritativeTask>,
): string[][] {
  const cycles: string[][] = [];
  const WHITE = 0, GRAY = 1, BLACK = 2;
  const color = new Map<string, number>();
  for (const t of tasks) color.set(t.id, WHITE);

  const stack: string[] = [];

  function dfs(id: string): void {
    color.set(id, GRAY);
    stack.push(id);
    const task = taskMap.get(id);
    if (task) {
      for (const depId of task.dependencies) {
        const c = color.get(depId);
        if (c === WHITE) {
          dfs(depId);
        } else if (c === GRAY) {
          // Back edge — extract cycle
          const cycleStart = stack.indexOf(depId);
          if (cycleStart >= 0) {
            cycles.push([...stack.slice(cycleStart), depId]);
          }
        }
      }
    }
    color.set(id, BLACK);
    stack.pop();
  }

  for (const t of tasks) {
    if (color.get(t.id) === WHITE) dfs(t.id);
  }

  return cycles;
}

/**
 * Convert dependency cycles into ContradictionFlags so they surface
 * in the engine's contradiction list.
 */
export function cyclesToContradictions(
  cycles: ReadonlyArray<ReadonlyArray<string>>,
  projectId: string,
): ContradictionFlag[] {
  return cycles.map(cycle => ({
    kind: 'queue_ordering_inconsistency' as const,
    severity: 'error' as const,
    message: `Dependency cycle: ${cycle.join(' → ')}`,
    project_id: projectId,
    evidence: { cycle: [...cycle] },
  }));
}
