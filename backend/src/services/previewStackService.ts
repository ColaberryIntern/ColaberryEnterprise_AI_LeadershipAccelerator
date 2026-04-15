/**
 * Preview Stack Service — provision, rebuild, teardown, archive, restore.
 *
 * Responsibilities:
 *   - Manage the lifecycle of per-project preview stacks (isolated docker-compose
 *     environments booted from the user's own repo).
 *   - Allocate ports from a reserved pool.
 *   - Clone the project's repo using its GitHub access token.
 *   - Boot / stop / teardown the stack via `docker compose`.
 *   - Record state transitions on PreviewStack + PreviewEvent.
 *
 * Assumes:
 *   - Backend container has the docker socket mounted (/var/run/docker.sock)
 *     and the `docker` CLI available on PATH.
 *   - A writable PREVIEW_STACKS_ROOT directory on the host, mounted into the
 *     container, where per-stack clones live.
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import crypto from 'crypto';
import fs from 'fs/promises';
import path from 'path';
import { Op } from 'sequelize';
import { Project, PreviewStack, PreviewEvent, GitHubConnection } from '../models';
import type { PreviewEventType } from '../models/PreviewEvent';
import type { PreviewStackStatus } from '../models/PreviewStack';

const execAsync = promisify(exec);

const STACKS_ROOT = process.env.PREVIEW_STACKS_ROOT || '/var/preview-stacks';
const PORT_POOL_START = parseInt(process.env.PREVIEW_PORT_POOL_START || '10000', 10);
const PORT_POOL_END = parseInt(process.env.PREVIEW_PORT_POOL_END || '10999', 10);
const COMPOSE_FILENAME = 'docker-compose.preview.yml';
const DEFAULT_CPU_LIMIT = process.env.PREVIEW_CPU_LIMIT || '0.5';
const DEFAULT_MEM_LIMIT = process.env.PREVIEW_MEM_LIMIT || '512m';

// ---------------------------------------------------------------------------
// Utility: shell
// ---------------------------------------------------------------------------

async function sh(cmd: string, opts: { cwd?: string; timeoutMs?: number; env?: NodeJS.ProcessEnv } = {}) {
  const { cwd, timeoutMs = 300_000, env } = opts;
  try {
    const { stdout, stderr } = await execAsync(cmd, {
      cwd,
      timeout: timeoutMs,
      env: { ...process.env, ...(env || {}) },
      maxBuffer: 10 * 1024 * 1024,
    });
    return { stdout: stdout || '', stderr: stderr || '', code: 0 };
  } catch (err: any) {
    return {
      stdout: err?.stdout || '',
      stderr: err?.stderr || String(err?.message || err),
      code: err?.code || 1,
    };
  }
}

// ---------------------------------------------------------------------------
// Slug generation
// ---------------------------------------------------------------------------

export function slugifyProjectName(raw: string): string {
  return (raw || 'project')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^\w\s-]/g, '')
    .trim()
    .replace(/[\s_]+/g, '-')
    .replace(/-+/g, '-')
    .slice(0, 40)
    .replace(/^-|-$/g, '') || 'project';
}

async function allocateUniqueSlug(baseName: string, projectId: string): Promise<string> {
  const base = slugifyProjectName(baseName);
  // If this project already has a stack, reuse its slug
  const existing = await PreviewStack.findOne({ where: { project_id: projectId } });
  if (existing) return existing.slug;
  // Otherwise, pick a unique slug
  let candidate = base;
  for (let i = 0; i < 50; i++) {
    const conflict = await PreviewStack.findOne({ where: { slug: candidate } });
    if (!conflict) return candidate;
    candidate = `${base}-${(i + 2).toString()}`;
  }
  // Last-resort: random suffix
  return `${base}-${crypto.randomBytes(3).toString('hex')}`;
}

// ---------------------------------------------------------------------------
// Port allocation
// ---------------------------------------------------------------------------

async function allocatePort(kind: 'frontend' | 'backend'): Promise<number> {
  // Pull all ports currently in use across stacks (either kind)
  const rows = await PreviewStack.findAll({
    attributes: ['frontend_port', 'backend_port'],
    where: { status: { [Op.in]: ['provisioning', 'running', 'stopped'] } as any },
  });
  const used = new Set<number>();
  for (const r of rows) {
    if (r.frontend_port) used.add(r.frontend_port);
    if (r.backend_port) used.add(r.backend_port);
  }
  // Reserve front-end ports in the lower half, backend in the upper half
  // to avoid collisions between concurrent allocations.
  const mid = Math.floor((PORT_POOL_START + PORT_POOL_END) / 2);
  const start = kind === 'frontend' ? PORT_POOL_START : mid + 1;
  const end = kind === 'frontend' ? mid : PORT_POOL_END;
  for (let p = start; p <= end; p++) {
    if (!used.has(p)) return p;
  }
  throw new Error(`Preview port pool exhausted for ${kind} (range ${start}-${end})`);
}

// ---------------------------------------------------------------------------
// Events
// ---------------------------------------------------------------------------

async function logEvent(stackId: string, type: PreviewEventType, detail: any = {}) {
  try {
    await PreviewEvent.create({ preview_stack_id: stackId, event_type: type, detail });
  } catch (e: any) {
    console.error('[previewStackService] logEvent failed:', e?.message);
  }
}

async function setStatus(stack: any, status: PreviewStackStatus, extra: any = {}) {
  Object.assign(stack, { status, ...extra, updated_at: new Date() });
  await stack.save();
}

// ---------------------------------------------------------------------------
// GitHub token lookup
// ---------------------------------------------------------------------------

async function getGithubTokenForProject(project: any): Promise<string | null> {
  if (!project?.enrollment_id) return null;
  const conn = await GitHubConnection.findOne({
    where: { enrollment_id: project.enrollment_id },
  });
  const token = (conn as any)?.access_token_encrypted;
  return token || null;
}

function buildAuthedRepoUrl(repoUrl: string, token: string | null): string {
  if (!token) return repoUrl;
  // Insert token into https URL: https://<token>@github.com/owner/repo.git
  try {
    const u = new URL(repoUrl);
    u.username = token;
    u.password = 'x-oauth-basic';
    return u.toString();
  } catch {
    return repoUrl;
  }
}

// ---------------------------------------------------------------------------
// Core lifecycle
// ---------------------------------------------------------------------------

export interface ProvisionOptions {
  projectId: string;
  refreshRepo?: boolean;
}

/**
 * Provision a new preview stack (or rebuild an existing one) for a project.
 * Idempotent: safe to call repeatedly.
 */
export async function provisionStack(opts: ProvisionOptions): Promise<any> {
  const { projectId, refreshRepo = true } = opts;
  const project: any = await Project.findByPk(projectId);
  if (!project) throw new Error(`Project ${projectId} not found`);
  if (!project.github_repo_url) {
    throw new Error('Project has no github_repo_url — cannot provision preview stack');
  }

  // Find or create preview_stacks row
  let stack: any = await PreviewStack.findOne({ where: { project_id: projectId } });
  if (!stack) {
    const slug = await allocateUniqueSlug(project.organization_name || 'project', projectId);
    stack = await PreviewStack.create({
      project_id: projectId,
      slug,
      status: 'provisioning',
      repo_url: project.github_repo_url,
    });
    await logEvent(stack.id, 'provision', { phase: 'created_record', slug });
  } else {
    await setStatus(stack, 'provisioning', { failure_reason: null });
    await logEvent(stack.id, 'rebuild', { phase: 'starting' });
  }

  try {
    // 1. Prepare workspace
    const workDir = path.join(STACKS_ROOT, stack.slug);
    await fs.mkdir(workDir, { recursive: true });

    // 2. Clone or pull the repo
    const token = await getGithubTokenForProject(project);
    const authedUrl = buildAuthedRepoUrl(project.github_repo_url, token);
    const repoDir = path.join(workDir, 'repo');
    const repoExists = await fs.stat(repoDir).then(() => true).catch(() => false);
    if (!repoExists) {
      const clone = await sh(`git clone --depth 1 "${authedUrl}" repo`, { cwd: workDir, timeoutMs: 120_000 });
      if (clone.code !== 0) throw new Error(`git clone failed: ${clone.stderr.slice(0, 500)}`);
      await logEvent(stack.id, 'provision', { phase: 'cloned' });
    } else if (refreshRepo) {
      const pull = await sh(`git -C repo pull --ff-only`, { cwd: workDir, timeoutMs: 120_000 });
      if (pull.code !== 0) {
        // Reset hard to recover from divergent history
        await sh(`git -C repo fetch origin`, { cwd: workDir });
        await sh(`git -C repo reset --hard origin/HEAD`, { cwd: workDir });
      }
      await logEvent(stack.id, 'provision', { phase: 'pulled' });
    }

    // Capture current commit SHA
    const sha = await sh(`git -C repo rev-parse HEAD`, { cwd: workDir });
    const commitSha = (sha.stdout || '').trim().slice(0, 40) || null;

    // 3. Verify docker-compose.preview.yml exists
    const composePath = path.join(repoDir, COMPOSE_FILENAME);
    const hasCompose = await fs.stat(composePath).then(() => true).catch(() => false);
    if (!hasCompose) {
      throw new Error(
        `Repo does not contain ${COMPOSE_FILENAME} at the root. Add one to enable previews. ` +
        `See directives/per-user-project-previews.md for the required shape.`
      );
    }

    // 4. Allocate ports (if not already set)
    if (!stack.frontend_port) stack.frontend_port = await allocatePort('frontend');
    if (!stack.backend_port) stack.backend_port = await allocatePort('backend');
    stack.stack_path = repoDir;
    stack.db_volume = `preview-${stack.slug}-db`;
    stack.repo_commit_sha = commitSha;
    await stack.save();

    // 5. Boot the stack
    await bootStackInternal(stack);

    await setStatus(stack, 'running', { last_started_at: new Date() });
    await logEvent(stack.id, 'boot', { phase: 'ready', commitSha });
    return stack;
  } catch (err: any) {
    const reason = String(err?.message || err).slice(0, 1000);
    await setStatus(stack, 'failed', { failure_reason: reason });
    await logEvent(stack.id, 'error', { phase: 'provision', reason });
    throw err;
  }
}

async function bootStackInternal(stack: any) {
  const env = {
    PREVIEW_SLUG: stack.slug,
    PREVIEW_FRONTEND_PORT: String(stack.frontend_port),
    PREVIEW_BACKEND_PORT: String(stack.backend_port),
    PREVIEW_DB_VOLUME: stack.db_volume,
    PREVIEW_CPU_LIMIT: DEFAULT_CPU_LIMIT,
    PREVIEW_MEM_LIMIT: DEFAULT_MEM_LIMIT,
  };
  const cwd = stack.stack_path;
  if (!cwd) throw new Error('stack_path not set');
  const projectName = `preview-${stack.slug}`;
  const up = await sh(
    `docker compose -p "${projectName}" -f ${COMPOSE_FILENAME} up -d --build --remove-orphans`,
    { cwd, timeoutMs: 600_000, env: env as any }
  );
  if (up.code !== 0) {
    throw new Error(`docker compose up failed: ${up.stderr.slice(0, 1000)}`);
  }
}

/**
 * Stop a running stack (preserves DB volume + repo clone).
 * Stack can be re-booted via touchStack or bootStack.
 */
export async function stopStack(projectId: string): Promise<any> {
  const stack: any = await PreviewStack.findOne({ where: { project_id: projectId } });
  if (!stack) throw new Error('No preview stack for this project');
  if (stack.status !== 'running') return stack;
  const projectName = `preview-${stack.slug}`;
  const cwd = stack.stack_path;
  if (cwd) {
    await sh(`docker compose -p "${projectName}" -f ${COMPOSE_FILENAME} stop`, { cwd });
  }
  await setStatus(stack, 'stopped', { last_stopped_at: new Date() });
  await logEvent(stack.id, 'stop', {});
  return stack;
}

/**
 * Boot a stopped stack. Used by wake-on-access and admin manual boot.
 */
export async function bootStack(projectId: string): Promise<any> {
  const stack: any = await PreviewStack.findOne({ where: { project_id: projectId } });
  if (!stack) throw new Error('No preview stack for this project');
  if (stack.status === 'running') return stack;
  if (stack.status === 'archived') throw new Error('Stack is archived — restore first');
  if (!stack.stack_path) throw new Error('Stack has no stack_path — re-provision required');
  await setStatus(stack, 'provisioning');
  try {
    await bootStackInternal(stack);
    await setStatus(stack, 'running', { last_started_at: new Date() });
    await logEvent(stack.id, 'boot', { phase: 'wake' });
    return stack;
  } catch (err: any) {
    const reason = String(err?.message || err).slice(0, 1000);
    await setStatus(stack, 'failed', { failure_reason: reason });
    await logEvent(stack.id, 'error', { phase: 'boot', reason });
    throw err;
  }
}

/**
 * Update last_accessed_at so the idle reaper doesn't stop an active stack.
 */
export async function touchStack(slug: string): Promise<any> {
  const stack: any = await PreviewStack.findOne({ where: { slug } });
  if (!stack) return null;
  stack.last_accessed_at = new Date();
  await stack.save();
  return stack;
}

/**
 * Non-destructive teardown: stops + archives the stack (DB volume + repo
 * preserved on disk under STACKS_ROOT; can be restored later).
 */
export async function archiveStack(projectId: string): Promise<any> {
  const stack: any = await PreviewStack.findOne({ where: { project_id: projectId } });
  if (!stack) throw new Error('No preview stack for this project');
  const projectName = `preview-${stack.slug}`;
  const cwd = stack.stack_path;
  if (cwd) {
    await sh(`docker compose -p "${projectName}" -f ${COMPOSE_FILENAME} down`, { cwd });
  }
  await setStatus(stack, 'archived', { last_stopped_at: new Date() });
  await logEvent(stack.id, 'archive', {});
  return stack;
}

/**
 * Destructive teardown — removes containers, named volumes (INCLUDING the
 * project's DB data), and the on-disk clone. Caller must confirm twice.
 */
export async function destroyStack(projectId: string): Promise<void> {
  const stack: any = await PreviewStack.findOne({ where: { project_id: projectId } });
  if (!stack) return;
  await setStatus(stack, 'tearing_down');
  const projectName = `preview-${stack.slug}`;
  const cwd = stack.stack_path;
  if (cwd) {
    await sh(`docker compose -p "${projectName}" -f ${COMPOSE_FILENAME} down -v --remove-orphans`, { cwd });
  }
  // Remove the workspace
  const workDir = path.dirname(stack.stack_path || '');
  if (workDir && workDir.startsWith(STACKS_ROOT)) {
    await sh(`rm -rf "${workDir}"`);
  }
  await logEvent(stack.id, 'teardown', { destructive: true });
  await stack.destroy();
}

/**
 * Get a project's current preview stack (or null).
 */
export async function getStackByProject(projectId: string) {
  return PreviewStack.findOne({ where: { project_id: projectId } });
}

export async function getStackBySlug(slug: string) {
  return PreviewStack.findOne({ where: { slug } });
}

export async function listStacks() {
  return PreviewStack.findAll({ order: [['updated_at', 'DESC']] });
}
