/**
 * platformBuild/bundle - the workspace the runner builds in, and the live files the page reads. I/O.
 *
 * Both come from `renderProjectDocs`, the same function the repo sync uses, with `repoUrl: null`:
 * the platform build never depends on the student having a repository. The demo kit is added when
 * the render did not already include it (it only does for builds that carry STORY-900), because
 * the demo brief scaffolds from `docs/demo-kit/scaffold-demo-spec.mjs`.
 */
import type { BuildPlan } from '../planContract';
import { renderProjectDocs } from '../renderProjectDocs';
import { demoKitFiles } from '../demoKit';
import { platformCommandCenterPrompt, platformDemoPrompt, PLATFORM_BUILD_DONE } from './prompts';

export interface RunnerBundle {
  plan_version: number;
  files: Record<string, string>;
  prompts: { command_center: string; demo: string };
  done_marker: string;
}

export async function runnerBundle(projectId: string, correlationId: string | null): Promise<RunnerBundle | null> {
  const rendered = await renderProjectDocs(projectId, { repoUrl: null, correlationId });
  if (!rendered) return null;
  const files: Record<string, string> = {};
  for (const f of rendered.files) files[f.path] = f.content;
  for (const f of demoKitFiles()) if (!(f.path in files)) files[f.path] = f.content;
  const plan = rendered.stored.plan as BuildPlan;
  return {
    plan_version: rendered.stored.version,
    files,
    prompts: {
      command_center: platformCommandCenterPrompt(plan, rendered.schedule, { projectId }),
      demo: platformDemoPrompt(plan),
    },
    done_marker: PLATFORM_BUILD_DONE,
  };
}

/*
 * A page load fetches four to eight `.colaberry/` files within a second. Rendering the project
 * once per file would repeat every query behind the render that many times, so one render is
 * kept for 30 seconds per project. This is a cache, not state: losing it (a restart, a second
 * container) only costs a re-render, and 30 seconds is shorter than any change a student could
 * make and then go and look for. Bounded at 200 projects so it cannot grow without limit.
 */
const LIVE_TTL_MS = 30_000;
const LIVE_MAX = 200;
const live = new Map<string, { at: number; files: Map<string, string> | null }>();

/** For tests. */
export function clearLiveCache(): void { live.clear(); }

/** One live `.colaberry/` file for the served page, or null when the render does not produce it. */
export async function liveProjectFile(projectId: string, path: string): Promise<string | null> {
  let hit = live.get(projectId);
  if (!hit || Date.now() - hit.at > LIVE_TTL_MS) {
    const rendered = await renderProjectDocs(projectId, { repoUrl: null, correlationId: null });
    hit = { at: Date.now(), files: rendered ? new Map(rendered.files.map((f) => [f.path, f.content])) : null };
    if (live.size >= LIVE_MAX) live.delete(live.keys().next().value as string);
    live.set(projectId, hit);
  }
  return hit.files?.get(path) ?? null;
}
