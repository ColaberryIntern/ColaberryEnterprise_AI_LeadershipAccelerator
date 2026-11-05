/**
 * captureStoryArtifact — Proposal Studio P4. When a build story is VERIFIED, capture a screenshot of it from the
 * project's demo as proposal build evidence (our discriminator: a working software demo, not a stock image). The
 * capture is Playwright, with a STRICT timeout, NO credentials (a fresh context), a 1440x900 viewport, and the PNG
 * saved to the persistent uploads volume. IDEMPOTENT per (story, commit): a re-sync over the same verified commit
 * never captures twice. Fail-soft throughout — a capture failure records a `failed` row (or nothing), never throws
 * into the verification path that called it.
 *
 * Security: the demo URL is admin-set and validated here — https only, and the host must be on the allowlist — so a
 * verified-story hook can never be steered to navigate an arbitrary internal URL.
 */
import crypto from 'crypto';
import fs from 'fs/promises';
import path from 'path';
import { QueryTypes } from 'sequelize';
import { sequelize } from '../../../config/database';
import GovBuildArtifact from '../../../models/GovBuildArtifact';
import GovBuildDemo from '../../../models/GovBuildDemo';
import { GOV_BUILD_ARTIFACT_DIR } from '../../../config/upload';

export class GovBuildDemoError extends Error {
  constructor(message: string, readonly reason: 'not_https' | 'host_not_allowed' | 'bad_url') { super(message); this.name = 'GovBuildDemoError'; }
}

const DEFAULT_ALLOWLIST = ['colaberry.dev', 'colaberry.ai', 'refactored.ai', 'vercel.app', 'netlify.app', 'onrender.com', 'localhost', '127.0.0.1'];

export function demoHostAllowlist(): string[] {
  const env = (process.env.GOV_DEMO_HOST_ALLOWLIST || '').split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);
  return env.length ? env : DEFAULT_ALLOWLIST;
}

/** PURE: is this an https URL whose host is on the allowlist (exact or a subdomain of an allowed host)? */
export function isAllowedDemoUrl(url: string, allowlist: string[] = demoHostAllowlist()): boolean {
  let u: URL;
  try { u = new URL(url); } catch { return false; }
  if (u.protocol !== 'https:') return false;
  const host = u.hostname.toLowerCase();
  return allowlist.some((a) => host === a || host.endsWith('.' + a));
}

/** The relative, same-origin artifact-image route (what an <img src> in a document points at — matches the
 *  sanitizer's ARTIFACT_SRC_RE). Access is checked by the route; the path itself reveals nothing. */
export function artifactImagePath(deliveryProjectId: string, artifactId: string): string {
  return `/api/admin/gov-contracts/${encodeURIComponent(deliveryProjectId)}/artifacts/${encodeURIComponent(artifactId)}/image`;
}

/** The canonical requirement id(s) a gov build story proves. Gov stories are keyed `STORY-<canonicalReqId>`. Pure. */
export function requirementIdsFromStoryId(storyId: string): string[] {
  const id = String(storyId ?? '').replace(/^STORY-/, '').trim();
  return id ? [id] : [];
}

export interface SetDemoInput { demoUrl: string; captureRoot?: string | null; storyCapturePaths?: Record<string, string>; identityId?: string | null; }

/** Admin sets the project's demo URL (validated https + host-allowlisted). Upsert; one row per project. */
export async function setGovBuildDemo(deliveryProjectId: string, input: SetDemoInput): Promise<void> {
  const demoUrl = String(input.demoUrl ?? '').trim();
  if (!demoUrl) throw new GovBuildDemoError('A demo URL is required.', 'bad_url');
  let parsed: URL;
  try { parsed = new URL(demoUrl); } catch { throw new GovBuildDemoError('That is not a valid URL.', 'bad_url'); }
  if (parsed.protocol !== 'https:') throw new GovBuildDemoError('The demo URL must be https.', 'not_https');
  if (!isAllowedDemoUrl(demoUrl)) throw new GovBuildDemoError('That demo host is not on the allowlist.', 'host_not_allowed');
  await GovBuildDemo.upsert({
    delivery_project_id: deliveryProjectId, demo_url: demoUrl,
    capture_root: input.captureRoot ?? null, story_capture_paths: input.storyCapturePaths ?? {},
    updated_by_identity_id: input.identityId ?? null, updated_at: new Date(),
  } as any);
}

export async function getGovBuildDemo(deliveryProjectId: string): Promise<{ demoUrl: string; captureRoot: string | null; storyCapturePaths: Record<string, string> } | null> {
  const row: any = await GovBuildDemo.findByPk(deliveryProjectId);
  if (!row || !row.demo_url) return null;
  return { demoUrl: row.demo_url, captureRoot: row.capture_root ?? null, storyCapturePaths: row.story_capture_paths ?? {} };
}

/** The full URL to capture for a story: demo base + the story's capture path (or the capture root, or '/'). */
function captureUrlFor(demo: { demoUrl: string; captureRoot: string | null; storyCapturePaths: Record<string, string> }, storyId: string): string | null {
  const rel = demo.storyCapturePaths?.[storyId] || demo.captureRoot || '/';
  try { return new URL(rel, demo.demoUrl).toString(); } catch { return null; }
}

/** Take one screenshot with Playwright (no creds, strict timeout, 1440x900). Returns the PNG bytes, or throws. */
async function screenshot(url: string, timeoutMs: number): Promise<Buffer> {
  const { chromium } = await import('playwright');
  const browser = await chromium.launch({ args: ['--no-sandbox', '--disable-dev-shm-usage'] });
  try {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, storageState: undefined });
    const page = await context.newPage();
    await page.goto(url, { waitUntil: 'load', timeout: timeoutMs });
    return (await page.screenshot({ type: 'png', fullPage: false })) as Buffer;
  } finally {
    await browser.close().catch(() => { /* best-effort */ });
  }
}

export interface CaptureResult { status: 'captured' | 'skipped' | 'failed'; artifactId?: string }

/**
 * Capture one story's artifact, idempotent per (story, commit). `force` re-captures (the manual Re-capture action).
 * Fail-soft: a capture failure records a `failed` row and returns, never throws.
 */
export async function captureOneStoryArtifact(deliveryProjectId: string, storyId: string, commitSha: string | null, opts?: { force?: boolean; timeoutMs?: number }): Promise<CaptureResult> {
  try {
    const existing: any = await GovBuildArtifact.findOne({ where: { story_id: storyId, commit_sha: commitSha } });
    if (existing && existing.status === 'captured' && !opts?.force) return { status: 'skipped', artifactId: existing.id };

    const demo = await getGovBuildDemo(deliveryProjectId);
    if (!demo) return { status: 'skipped' }; // no demo configured — nothing to capture (also the non-gov no-op)
    const url = captureUrlFor(demo, storyId);
    if (!url || !isAllowedDemoUrl(url)) return { status: 'skipped' };

    const png = await screenshot(url, opts?.timeoutMs ?? 25000);
    const sha = crypto.createHash('sha256').update(png).digest('hex');
    const fileName = `${crypto.randomUUID()}.png`;
    await fs.mkdir(GOV_BUILD_ARTIFACT_DIR, { recursive: true }).catch(() => {});
    await fs.writeFile(path.join(GOV_BUILD_ARTIFACT_DIR, fileName), png);

    const requirementIds = requirementIdsFromStoryId(storyId);
    const caption = `Captured from the verified build${commitSha ? ` (commit ${commitSha.slice(0, 7)})` : ''}.`;
    if (existing) {
      await existing.update({ file_path: fileName, sha256: sha, requirement_ids: requirementIds, caption, status: 'captured', captured_at: new Date() });
      return { status: 'captured', artifactId: existing.id };
    }
    try {
      const row: any = await GovBuildArtifact.create({ delivery_project_id: deliveryProjectId, story_id: storyId, requirement_ids: requirementIds, commit_sha: commitSha, file_path: fileName, sha256: sha, caption, status: 'captured' } as any);
      return { status: 'captured', artifactId: row.id };
    } catch {
      // Lost a race on the (story, commit) unique index — the winner's row is the answer.
      const winner: any = await GovBuildArtifact.findOne({ where: { story_id: storyId, commit_sha: commitSha } });
      return winner ? { status: 'skipped', artifactId: winner.id } : { status: 'failed' };
    }
  } catch (err: any) {
    console.error(JSON.stringify({ timestamp: new Date().toISOString(), level: 'error', service: 'proposal-studio-capture', event: 'capture_story_artifact', outcome: 'failure', error_class: err?.constructor?.name ?? 'Error', context: { deliveryProjectId, storyId, message: err?.message } }));
    try { await sequelize.query('INSERT INTO gov_build_artifacts (delivery_project_id, story_id, commit_sha, status) VALUES ($1,$2,$3,$4) ON CONFLICT (story_id, commit_sha) DO NOTHING', { bind: [deliveryProjectId, storyId, commitSha, 'failed'], type: QueryTypes.INSERT }); } catch { /* best-effort */ }
    return { status: 'failed' };
  }
}

/** Manual Re-capture: re-shoot a story's artifact at its most recent commit (force). For the admin "Re-capture" action. */
export async function recaptureStory(deliveryProjectId: string, storyId: string): Promise<CaptureResult> {
  const latest: any = await GovBuildArtifact.findOne({ where: { delivery_project_id: deliveryProjectId, story_id: storyId }, order: [['captured_at', 'DESC']] });
  return captureOneStoryArtifact(deliveryProjectId, storyId, latest?.commit_sha ?? null, { force: true });
}

/**
 * Enqueue captures for newly-verified stories (called fail-soft from the build-verification path). No-op when the
 * project has no demo configured (so it is safe to call for every verified story, gov or not). Fire-and-forget with
 * a small concurrency cap; never throws into the caller.
 */
export async function enqueueStoryArtifactCaptures(deliveryProjectId: string, items: Array<{ storyId: string; commitSha: string | null }>): Promise<void> {
  const demo = await getGovBuildDemo(deliveryProjectId).catch(() => null);
  if (!demo) return; // not a gov project with a demo — nothing to do
  for (const it of Array.isArray(items) ? items : []) {
    await captureOneStoryArtifact(deliveryProjectId, it.storyId, it.commitSha).catch(() => { /* fail-soft */ });
  }
}
