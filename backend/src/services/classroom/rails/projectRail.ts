import { getActiveProjectTree } from '../../projects/projectReadService';
import { Rail, RailContext, RailTile, omitIfEmpty } from './types';
import { isTaskOpen } from '../taskStatus';

/**
 * The student's own project, and the tasks still open on it.
 *
 * HIDDEN ENTIRELY WHEN THERE IS NO PROJECT. Not an empty rail, not a rail with
 * a "start a project" placeholder — no rail at all. `getActiveProjectTree`
 * returning null is the whole condition, and it is the same call the classroom
 * projection already uses, so the two can never disagree about whether a
 * student has a project.
 *
 * EVERY TILE OPENS THE WORKSTATION. This is the rail that proves the design:
 * the first thing a student can do on the Projects page is open the task in the
 * workstation, so that is what the tile does. `?open=` carries the project and
 * `?task=` the specific task, so the surface arrives with the right thing
 * already selected rather than at a project index the student then has to
 * navigate.
 *
 * ORDER IS THE PROJECT'S, NOT OURS. Tasks are emitted in list order, the order
 * the project itself presents them. Re-sorting by age or priority here would
 * mean the classroom and the Projects page disagreed about what comes next.
 */

/** A rail, not a backlog. Beyond this the student should be on the real page. */
const TILE_LIMIT = 12;

function projectHref(projectId: string, taskId?: string): string {
  const base = `/portal/projects?open=${encodeURIComponent(projectId)}`;
  return taskId ? `${base}&task=${encodeURIComponent(taskId)}` : base;
}

export async function resolveProjectRail(ctx: RailContext): Promise<Rail | null> {
  const tree = await getActiveProjectTree(ctx.enrollmentId);
  if (!tree) return null;                     // no project, no rail

  const tiles: RailTile[] = [];

  for (const list of tree.lists ?? []) {
    for (const task of list.tasks ?? []) {
      if (tiles.length >= TILE_LIMIT) break;
      if (!isTaskOpen(task.status)) continue;

      const first = tiles.length === 0;
      tiles.push({
        id: task.id,
        title: task.title,
        detail: list.title ?? null,
        meta: first ? 'next task' : null,
        image_url: null,
        glyph: first ? '\u{1F4BB}' : '\u{1F4DD}',
        stamp: first ? 'NEXT TASK' : 'TASK',
        action: { label: 'Open workstation', href: projectHref(tree.id, task.id), kind: 'primary' },
        featured: first,
      });
    }
  }

  // A project with nothing open is still worth a rail — but it says so, and the
  // action becomes the project itself rather than a task that does not exist.
  if (tiles.length === 0) {
    tiles.push({
      id: `${tree.id}-done`,
      title: 'Nothing open right now',
      detail: tree.name || 'your project',
      meta: 'every task on this project is closed',
      image_url: null,
      glyph: '\u{2705}',
      stamp: 'CLEAR',
      action: { label: 'Open project', href: projectHref(tree.id), kind: 'quiet' },
    });
  }

  return omitIfEmpty({
    surface: 'project',
    label: 'Your project',
    count_label: tree.name ? `${tree.name}` : null,
    href: projectHref(tree.id),
    tiles,
  });
}
