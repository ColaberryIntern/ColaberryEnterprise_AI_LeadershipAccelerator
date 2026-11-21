import { useCallback, useEffect, useRef, useState } from 'react';
import {
  apiErrorMessage, changeThumbnail, downloadThumbnail, generateThumbnails, getThumbnailJob, listThumbnails, uploadThumbnail, chooseThumbnail,
  type HubEvent, type StudioStyle, type StudioView, type ThumbJob, type ThumbSize,
} from '../../../../../services/commsHubApi';
import { isAiStyle } from './studioDisplay';

/**
 * The thumbnail studio's state (CH4.4). Generating starts a server job; the studio asks for it every
 * 3 s and gives up after 120 s, saying so and making the branded templates instead (the AI pictures
 * still appear here if they finish later, because each one is saved as it is made).
 */
export const POLL_MS = 3_000;
export const GIVE_UP_MS = 120_000;
export const TOO_LONG = 'This is taking too long, so here are the branded templates. AI pictures that finish later will still appear here.';

export type Busy = null | 'generate' | 'change' | 'use' | 'download' | 'upload';

export interface StudioState {
  view: StudioView | null; loadError: string | null;
  style: StudioStyle; headline: string; supporting: string; showWhen: boolean;
  selectedId: string | null; size: ThumbSize; changeText: string;
  busy: Busy; progress: string | null; notice: string | null; error: string | null;
}

const delay = (ms: number): Promise<void> => new Promise((r) => { setTimeout(r, ms); });

export function useThumbnailStudio(event: HubEvent) {
  const [s, setS] = useState<StudioState>({
    view: null, loadError: null, style: 'templates', headline: event.title, supporting: '', showWhen: true,
    selectedId: event.thumbnail_id, size: '16x9', changeText: '', busy: null, progress: null, notice: null, error: null,
  });
  const patch = useCallback((p: Partial<StudioState>) => setS((prev) => ({ ...prev, ...p })), []);
  const alive = useRef(true);
  useEffect(() => () => { alive.current = false; }, []);

  const refresh = useCallback(async (select?: string | null): Promise<void> => {
    try {
      const view = await listThumbnails(event.id);
      if (!alive.current) return;
      setS((prev) => {
        const keep = select ?? prev.selectedId;
        const selectedId = keep && view.options.some((o) => o.id === keep) ? keep : view.chosen_id ?? view.options[0]?.id ?? null;
        return { ...prev, view, loadError: null, selectedId };
      });
    } catch (err) {
      if (alive.current) patch({ loadError: apiErrorMessage(err, 'The thumbnails did not load. Reload the page to try again.') });
    }
  }, [event.id, patch]);
  useEffect(() => { void refresh(); }, [refresh]);

  /** Wait for a job; null when it took too long. */
  const waitFor = useCallback(async (job: ThumbJob): Promise<ThumbJob | null> => {
    const started = Date.now();
    let current = job;
    while (current.status === 'running') {
      if (Date.now() - started >= GIVE_UP_MS) return null;
      // eslint-disable-next-line no-await-in-loop
      await delay(POLL_MS);
      if (!alive.current) return null;
      // eslint-disable-next-line no-await-in-loop
      current = await getThumbnailJob(event.id, job.id);
    }
    return current;
  }, [event.id]);

  const finish = useCallback(async (job: ThumbJob | null, busy: Busy, summary: string | null): Promise<void> => {
    // The studio was closed while waiting: nothing to show, and no template fallback nobody asked for.
    if (!alive.current) return;
    if (!job) {
      patch({ progress: 'Making the branded templates...' });
      const fallback = await waitFor(await generateThumbnails(event.id, { style: 'templates', headline: s.headline.trim(), supporting: s.supporting.trim() || null, show_when: s.showWhen }));
      await refresh(fallback?.option_ids[0] ?? null);
      patch({ busy: null, progress: null, notice: TOO_LONG });
      return;
    }
    if (job.status === 'failed') { await refresh(); patch({ busy: null, progress: null, error: job.error ?? 'The pictures could not be made.' }); return; }
    await refresh(job.option_ids[0] ?? null);
    const made = job.option_ids.length === 1 ? 'One new option is ready below.' : `${job.option_ids.length} new options are ready below.`;
    patch({ busy: null, progress: null, notice: [summary, job.notice ?? made].filter(Boolean).join(' '), changeText: busy === 'change' ? '' : s.changeText });
  }, [event.id, patch, refresh, s.changeText, s.headline, s.showWhen, s.supporting, waitFor]);

  const generate = useCallback(async (): Promise<void> => {
    if (!s.headline.trim()) { patch({ error: 'Add a headline.' }); return; }
    const ai = isAiStyle(s.style);
    patch({ busy: 'generate', error: null, notice: null, progress: ai ? `Making ${s.view?.ai.batch ?? 3} AI pictures. This takes about 15 to 30 seconds.` : 'Making the branded templates...' });
    try {
      const job = await generateThumbnails(event.id, { style: s.style, headline: s.headline.trim(), supporting: s.supporting.trim() || null, show_when: s.showWhen });
      await finish(await waitFor(job), 'generate', null);
    } catch (err) {
      if (alive.current) patch({ busy: null, progress: null, error: apiErrorMessage(err, 'The pictures could not be made. Try again, or pick a template.') });
    }
  }, [event.id, finish, patch, s.headline, s.showWhen, s.style, s.supporting, s.view, waitFor]);

  const askForChange = useCallback(async (): Promise<void> => {
    if (!s.selectedId) return;
    if (s.changeText.trim().length < 3) { patch({ error: 'Say what to change.' }); return; }
    patch({ busy: 'change', error: null, notice: null, progress: 'Working out the change and making a new option...' });
    try {
      const { job, summary } = await changeThumbnail(event.id, s.selectedId, s.changeText.trim());
      if (alive.current) patch({ progress: `${summary} Making it now...` });
      await finish(await waitFor(job), 'change', summary);
    } catch (err) {
      if (alive.current) patch({ busy: null, progress: null, error: apiErrorMessage(err, 'That change could not be made. Try different words.') });
    }
  }, [event.id, finish, patch, s.changeText, s.selectedId, waitFor]);

  const chooseSelected = useCallback(async (onUsed?: (id: string) => void): Promise<void> => {
    if (!s.selectedId) return;
    patch({ busy: 'use', error: null, notice: null });
    try {
      const id = await chooseThumbnail(event.id, s.selectedId);
      await refresh(id);
      onUsed?.(id);
      patch({ busy: null, notice: 'This is now the event\'s thumbnail. It shows on the member Events page.' });
    } catch (err) {
      patch({ busy: null, error: apiErrorMessage(err, 'The thumbnail was not set. Try again.') });
    }
  }, [event.id, patch, refresh, s.selectedId]);

  const download = useCallback(async (): Promise<void> => {
    if (!s.selectedId) return;
    patch({ busy: 'download', error: null });
    try {
      const blob = await downloadThumbnail(event.id, s.selectedId, s.size);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${event.title.replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').toLowerCase() || 'event'}-${s.size}.png`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      patch({ busy: null });
    } catch (err) {
      patch({ busy: null, error: apiErrorMessage(err, 'The download did not start. Try again.') });
    }
  }, [event.id, event.title, patch, s.selectedId, s.size]);

  const upload = useCallback(async (file: File, altText: string): Promise<boolean> => {
    patch({ busy: 'upload', error: null, notice: null });
    try {
      const id = await uploadThumbnail(event.id, file, altText);
      await refresh(id);
      patch({ busy: null, notice: 'Your picture was added as an option and is selected. Choose "Use for this event" to use it.' });
      return true;
    } catch (err) {
      patch({ busy: null, error: apiErrorMessage(err, 'The picture was not uploaded. Try again.') });
      return false;
    }
  }, [event.id, patch, refresh]);

  return { s, patch, generate, askForChange, chooseSelected, download, upload, refresh };
}
