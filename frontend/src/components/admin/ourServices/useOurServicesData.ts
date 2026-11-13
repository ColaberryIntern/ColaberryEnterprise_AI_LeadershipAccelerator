import { useCallback, useEffect, useState } from 'react';
import {
  listServiceOfferings, createServiceOffering, updateServiceOffering, retireServiceOffering,
  type ServiceOffering, type ServiceOfferingInput,
} from '../../../services/factoryApi';
import { decideServiceLink } from '../../../services/caseStudyServiceLinkApi';
import {
  getEvidenceSummary, proposeServiceFromCaseStudy, promoteService,
  type EvidenceSummary, type IntakeSummaryItem,
} from '../../../services/ourServicesApi';

/**
 * useOurServicesData - loads the page's two reads in parallel and owns every write. After each write the summary
 * is re-read, so counts, charts and the Intake queue always reflect the server, never an optimistic guess.
 *
 * Reads:  GET services?status=all (the editable fields: description, owner, PSC) and GET evidence-summary?status=all.
 * Failure: either read failing shows a plain error with a retry; the page never renders evidence numbers it did
 * not receive. A write failing keeps the page as it was and surfaces the server's sentence. No automatic retry:
 * every write is a person's click, and the routes behind them are idempotent, so clicking again is safe.
 */
type ApiError = { response?: { data?: { error?: string } } };
const messageOf = (e: unknown, fallback: string): string => (e as ApiError)?.response?.data?.error ?? fallback;

export interface OurServicesData {
  summary: EvidenceSummary | null;
  offerings: ServiceOffering[];
  loading: boolean;
  error: string | null;
  notice: string | null;
  dismissError: () => void;
  dismissNotice: () => void;
  reload: () => Promise<void>;
  saveService: (editing: ServiceOffering | 'new', input: ServiceOfferingInput) => Promise<boolean>;
  retire: (id: string) => Promise<void>;
  promote: (id: string, name: string) => Promise<void>;
  link: (item: IntakeSummaryItem, linkIds: string[]) => Promise<void>;
  propose: (item: IntakeSummaryItem, name: string, category: string) => Promise<void>;
}

export function useOurServicesData(): OurServicesData {
  const [summary, setSummary] = useState<EvidenceSummary | null>(null);
  const [offerings, setOfferings] = useState<ServiceOffering[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const reload = useCallback(async () => {
    const [list, sum] = await Promise.allSettled([listServiceOfferings('all'), getEvidenceSummary('all')]);
    if (list.status === 'fulfilled') setOfferings(list.value);
    if (sum.status === 'fulfilled') setSummary(sum.value);
    if (list.status === 'rejected') setError(messageOf(list.reason, 'Could not load the service catalog.'));
    else if (sum.status === 'rejected') setError(messageOf(sum.reason, 'Could not load the evidence summary.'));
    setLoading(false);
  }, []);

  useEffect(() => { void reload(); }, [reload]);

  const saveService = useCallback(async (editing: ServiceOffering | 'new', input: ServiceOfferingInput): Promise<boolean> => {
    setError(null);
    try {
      if (editing === 'new') await createServiceOffering(input);
      else await updateServiceOffering(editing.id, input);
      await reload();
      return true;
    } catch (e) { setError(messageOf(e, 'Could not save the service.')); return false; }
  }, [reload]);

  const retire = useCallback(async (id: string) => {
    setError(null);
    try { await retireServiceOffering(id); await reload(); } catch (e) { setError(messageOf(e, 'Could not retire the service.')); }
  }, [reload]);

  const promote = useCallback(async (id: string, name: string) => {
    setError(null);
    try {
      const r = await promoteService(id);
      setNotice(r.promoted ? `"${name}" is now active and counts in Gov fit.` : `"${name}" was already active.`);
      await reload();
    } catch (e) { setError(messageOf(e, 'Could not promote the service.')); }
  }, [reload]);

  // Throws on failure so the intake card can show the error beside the button that was clicked.
  const link = useCallback(async (item: IntakeSummaryItem, linkIds: string[]) => {
    for (const id of linkIds) await decideServiceLink(id, 'confirmed');
    setNotice(`"${item.title}" linked to ${linkIds.length} service${linkIds.length === 1 ? '' : 's'}. Evidence scores updated.`);
    await reload();
  }, [reload]);

  const propose = useCallback(async (item: IntakeSummaryItem, name: string, category: string) => {
    const r = await proposeServiceFromCaseStudy(item.id, { name, category: category || undefined });
    setNotice(r.existing
      ? `"${r.service.name}" already existed, so "${item.title}" was linked to it.`
      : `New Growth service "${r.service.name}" created and linked to "${item.title}".`);
    await reload();
  }, [reload]);

  return {
    summary, offerings, loading, error, notice,
    dismissError: () => setError(null), dismissNotice: () => setNotice(null),
    reload, saveService, retire, promote, link, propose,
  };
}
