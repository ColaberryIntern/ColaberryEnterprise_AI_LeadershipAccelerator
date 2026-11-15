import { useCallback, useEffect, useRef, useState } from 'react';
import { updateServiceOffering } from '../../../../services/factoryApi';
import {
  analyzeCaseStudyGap, getGapOpportunities, getLatestGapRun, pinServiceSuggestion, reviewGapAnalysis, startGapBatch,
  type GapAnalysis, type GapCluster, type GapOpportunities, type GapRun,
} from '../../../../services/serviceGapApi';
import type { IntakeSummaryItem } from '../../../../services/ourServicesApi';
import { mergeExpansion } from './serviceGapModel';

/**
 * useServiceGap - the AI service recommendations for the Intake queue, and every action a person can take on one.
 *
 * Reads GET service-gap-opportunities (never calls the model) on mount and whenever the page summary changes, so a
 * card that gets linked drops out. While a batch runs, polls its progress every POLL_MS (capped) and reloads at the
 * end. Failure here NEVER blocks manual matching: on a read error the cards simply show no recommendation.
 *
 * Actions are human clicks only. "Use existing" pins the target as a SUGGESTION and pre-ticks it; the Link button
 * still confirms. "Apply expansion" PATCHes the service with the shown diff, then records the review. Nothing else
 * writes to services or links.
 */
export const POLL_MS = 4000;
export const POLL_CAP = 300; // 20 minutes at 4 s

type ApiError = { response?: { data?: { error?: string } } };
const messageOf = (e: unknown, fallback: string): string => (e as ApiError)?.response?.data?.error ?? fallback;

export interface ServiceGapState {
  data: GapOpportunities | null;
  error: string | null;
  notice: string | null;
  busy: Set<string>;
  run: GapRun | null;
  /** caseStudyId -> serviceId the person chose with "Use existing"; the card starts with that service ticked. */
  pinned: Record<string, string>;
  analyze: (caseStudyId: string, force?: boolean) => Promise<void>;
  startBatch: () => Promise<void>;
  review: (a: GapAnalysis, state: 'accepted' | 'dismissed', note?: string) => Promise<void>;
  dismissCluster: (c: GapCluster) => Promise<void>;
  adoptExisting: (item: IntakeSummaryItem, a: GapAnalysis) => Promise<void>;
  applyExpansion: (a: GapAnalysis, current: { description: string | null; keywords: string[] }) => Promise<void>;
  dismissNotice: () => void;
}

export function useServiceGap(summaryVersion: string | null, reloadSummary: () => Promise<void>): ServiceGapState {
  const [data, setData] = useState<GapOpportunities | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState<Set<string>>(new Set());
  const [run, setRun] = useState<GapRun | null>(null);
  const [pinned, setPinned] = useState<Record<string, string>>({});
  const polls = useRef(0);

  const reload = useCallback(async () => {
    try { const d = await getGapOpportunities(); setData(d); setRun(d.run); setError(null); } catch (e) {
      setError(messageOf(e, 'AI service recommendations are not available right now. Manual linking still works.'));
    }
  }, []);
  useEffect(() => { void reload(); }, [reload, summaryVersion]);

  // Poll a running batch; stop at the cap or when it finishes, then reload once.
  useEffect(() => {
    if (run?.status !== 'running') return undefined;
    const t = setTimeout(async () => {
      polls.current += 1;
      try {
        const r = await getLatestGapRun();
        setRun(r);
        if (!r || r.status !== 'running' || polls.current >= POLL_CAP) { polls.current = 0; await reload(); }
      } catch (e) {
        // A missed poll is not fatal: re-arm the timer (same run object, new identity) until the cap.
        console.warn(JSON.stringify({ event: 'service_gap_poll_failed', message: messageOf(e, 'poll failed') }));
        if (polls.current < POLL_CAP) setRun((r) => (r ? { ...r } : r)); else { polls.current = 0; await reload(); }
      }
    }, POLL_MS);
    return () => clearTimeout(t);
  }, [run, reload]);

  const withBusy = useCallback(async (id: string, fn: () => Promise<void>) => {
    setBusy((b) => new Set(b).add(id));
    try { await fn(); } catch (e) { setError(messageOf(e, 'That did not work. Manual linking still works.')); } finally {
      setBusy((b) => { const n = new Set(b); n.delete(id); return n; });
    }
  }, []);

  const analyze = useCallback((caseStudyId: string, force = false) => withBusy(caseStudyId, async () => {
    await analyzeCaseStudyGap(caseStudyId, force); await reload();
  }), [withBusy, reload]);

  const startBatch = useCallback(() => withBusy('batch', async () => { polls.current = 0; setRun(await startGapBatch()); }), [withBusy]);

  const review = useCallback((a: GapAnalysis, state: 'accepted' | 'dismissed', note?: string) => withBusy(a.caseStudyId, async () => {
    await reviewGapAnalysis(a.id, state, note); await reload();
  }), [withBusy, reload]);

  const dismissCluster = useCallback((c: GapCluster) => withBusy(c.key, async () => {
    for (const id of c.analysisIds) await reviewGapAnalysis(id, 'dismissed', 'Dismissed from AI Service Opportunities');
    await reload();
  }), [withBusy, reload]);

  const adoptExisting = useCallback((item: IntakeSummaryItem, a: GapAnalysis) => withBusy(item.id, async () => {
    const target = a.recommendation?.target;
    if (!target) return;
    if (!item.suggestions.some((s) => s.serviceId === target.serviceId)) {
      const link = await pinServiceSuggestion(item.id, target.serviceId, a.recommendation?.verdict ?? null);
      if (link.state === 'rejected') { setNotice(`"${target.serviceName}" was rejected for this case study earlier, so it was not re-suggested. Link it from the service's Evidence panel if that has changed.`); return; }
      if (link.state === 'confirmed') { setNotice(`"${item.title}" is already linked to "${target.serviceName}".`); await reloadSummary(); return; }
    }
    setPinned((p) => ({ ...p, [item.id]: target.serviceId }));
    await reloadSummary();
    setNotice(`"${target.serviceName}" is ticked on "${item.title}". Click Link to confirm it.`);
  }), [withBusy, reloadSummary]);

  const applyExpansion = useCallback((a: GapAnalysis, current: { description: string | null; keywords: string[] }) => withBusy(a.caseStudyId, async () => {
    const ex = a.recommendation?.expansion;
    if (!ex) return;
    const next = mergeExpansion(current, ex);
    if (next.changed) await updateServiceOffering(ex.serviceId, { description: next.description, keywords: next.keywords });
    await reviewGapAnalysis(a.id, 'accepted', `Expansion applied to ${ex.serviceName}`);
    setNotice(`"${ex.serviceName}" updated. Link the case study to it when ready.`);
    await reloadSummary();
  }), [withBusy, reloadSummary]);

  return { data, error, notice, busy, run, pinned, analyze, startBatch, review, dismissCluster, adoptExisting, applyExpansion, dismissNotice: () => setNotice(null) };
}
