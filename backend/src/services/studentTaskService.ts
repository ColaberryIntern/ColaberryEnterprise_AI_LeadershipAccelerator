import RequirementsMap from '../models/RequirementsMap';
import StudentTaskList from '../models/StudentTaskList';
import StudentTask from '../models/StudentTask';
import Project from '../models/Project';

function deriveCluster(requirementKey: string): string {
  const dot = requirementKey.indexOf('.');
  return dot > 0
    ? requirementKey.slice(0, dot).toUpperCase()
    : requirementKey.toUpperCase();
}

function clusterToTitle(cluster: string): string {
  const words = cluster.split('_').map(w => w.charAt(0) + w.slice(1).toLowerCase());
  return words.join(' ') + ' Requirements';
}

function requirementToTitle(text: string): string {
  const firstLine = text.split('\n')[0].replace(/^#+\s*/, '').trim();
  return firstLine.length > 120 ? firstLine.slice(0, 117) + '...' : firstLine;
}

/**
 * Creates StudentTaskLists (one per requirement cluster) and StudentTasks
 * (one per requirement) from the project's RequirementsMap rows.
 * Idempotent — safe to call multiple times; uses findOrCreate on unique keys.
 */
export async function createTasksFromRequirements(projectId: string): Promise<void> {
  const requirements = await RequirementsMap.findAll({
    where: { project_id: projectId, is_active: true },
    order: [['requirement_key', 'ASC']],
  });

  if (requirements.length === 0) return;

  const project = await Project.findByPk(projectId);
  if (!project) return;

  // Group requirements by their cluster prefix (e.g., AUTH.001 → AUTH)
  const clusterMap = new Map<string, RequirementsMap[]>();
  for (const req of requirements) {
    const cluster = deriveCluster(req.requirement_key);
    if (!clusterMap.has(cluster)) clusterMap.set(cluster, []);
    clusterMap.get(cluster)!.push(req);
  }

  let clusterPosition = 0;
  for (const [cluster, reqs] of clusterMap) {
    const [taskList] = await StudentTaskList.findOrCreate({
      where: { project_id: projectId, cluster },
      defaults: {
        project_id: projectId,
        enrollment_id: project.enrollment_id,
        cluster,
        title: clusterToTitle(cluster),
        status: 'not_started',
        position: clusterPosition,
      },
    });

    let taskPosition = 0;
    for (const req of reqs) {
      await StudentTask.findOrCreate({
        where: { project_id: projectId, requirement_key: req.requirement_key },
        defaults: {
          task_list_id: taskList.id,
          project_id: projectId,
          requirement_map_id: req.id,
          requirement_key: req.requirement_key,
          title: requirementToTitle(req.requirement_text),
          description: req.requirement_text,
          status: 'not_started',
          position: taskPosition,
        },
      });
      taskPosition++;
    }
    clusterPosition++;
  }
}
