import { randomUUID } from 'crypto';
import { PromptGuardError } from './stylePrompts';
import type { BatchResult } from './thumbnailStudio';

/**
 * Thumbnail generation runs in the background (CH4.4): AI pictures take about 15 s each, longer than a
 * request should hang. The studio starts a job, then asks for it every 3 s (it gives up after 120 s and
 * says so). Jobs live in this process only, which is enough: the backend runs as one container, and
 * every option a job makes is already a database row, so a restart loses only the job's progress
 * message, never a picture. One job per event at a time, so repeated clicks cannot queue paid calls.
 */
export type JobStatus = 'running' | 'done' | 'failed';
/** 'ai' jobs make paid calls and are one per event; 'template' jobs are quick and unpaid, so the studio's
 *  "taking too long, using a template" fallback can start one while a slow AI job is still running. */
export type JobKind = 'ai' | 'template';
export interface ThumbnailJob {
  id: string; event_id: string; kind: JobKind; status: JobStatus;
  option_ids: string[]; notice: string | null; error: string | null;
  started_at: string; finished_at: string | null;
}

export class JobBusyError extends Error {}

const KEEP_MS = 30 * 60_000;
const jobs = new Map<string, ThumbnailJob>();

function sweep(now: number): void {
  for (const [id, j] of jobs) {
    if (j.finished_at && now - Date.parse(j.finished_at) > KEEP_MS) jobs.delete(id);
  }
}

/** The plain sentence for a failed job: the guard's own words, or a generic one (never a stack). */
export function jobErrorMessage(err: unknown): string {
  if (err instanceof PromptGuardError) return err.message;
  return 'The pictures could not be made. Try again, or pick a template.';
}

export function startJob(eventId: string, work: () => Promise<BatchResult>, log: (err: unknown) => void = () => undefined, kind: JobKind = 'ai'): ThumbnailJob {
  sweep(Date.now());
  for (const j of jobs.values()) {
    if (j.event_id === eventId && j.kind === kind && j.status === 'running') throw new JobBusyError('Pictures are already being made for this event. Wait for them to finish.');
  }
  const job: ThumbnailJob = { id: randomUUID(), event_id: eventId, kind, status: 'running', option_ids: [], notice: null, error: null, started_at: new Date().toISOString(), finished_at: null };
  jobs.set(job.id, job);
  void work().then(
    (r) => { Object.assign(job, { status: 'done', option_ids: r.optionIds, notice: r.notice, finished_at: new Date().toISOString() }); },
    (err) => { log(err); Object.assign(job, { status: 'failed', error: jobErrorMessage(err), finished_at: new Date().toISOString() }); },
  );
  return { ...job };
}

/** A job of this event, or null (unknown, another event's, or forgotten after a restart or 30 minutes). */
export function getJob(eventId: string, jobId: string): ThumbnailJob | null {
  const j = jobs.get(jobId);
  return j && j.event_id === eventId ? { ...j } : null;
}

/** Tests only. */
export function resetJobs(): void { jobs.clear(); }
