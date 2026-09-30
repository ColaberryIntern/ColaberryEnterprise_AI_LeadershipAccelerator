import { useCallback, useEffect, useState } from 'react';
import {
  listMeasuredMetrics, listMetricDefinitions, promoteMetric, runMeasurement,
} from '../../services/caseStudyMetricApi';
import type {
  MeasuredMetric, MetricRunReport, MetricVerificationClass,
} from '../../services/caseStudyMetricApi';

/**
 * The measurement half of the Case Study desk.
 *
 * A SIBLING HOOK to `useCaseStudyDesk` and `useCaseStudyStudio`, matching the
 * three-way split on the server. It is separate rather than folded into the desk
 * because the desk's metrics come from SNAPSHOT CONTENT and these come from the
 * `case_study_metrics` TABLE — the same distinction that let a measured figure
 * sit invisible in the database. One hook holding both would blur it again.
 *
 * EVERY RULE LIVES ON THE SERVER. This hook does not decide whether a promotion
 * is allowed; it sends the decision and renders what comes back. A refusal is
 * surfaced with the server's own words, so the operator reads the actual reason
 * rather than a message this file guessed at.
 */

export interface CaseStudyMeasurement {
  readonly metrics: readonly MeasuredMetric[];
  readonly definitionKeys: readonly string[];
  readonly busy: boolean;
  readonly lastRun: MetricRunReport | null;
  readonly error: string | null;
  readonly onRun: (definitionKey: string) => void;
  readonly onPromote: (metricKey: string, next: {
    verificationClass: MetricVerificationClass;
    publishable: boolean;
    isHeadline: boolean;
  }) => void;
}

/** The server's message if it sent one, never a generic substitute for it. */
function messageOf(err: unknown, fallback: string): string {
  const data = (err as { response?: { data?: { error?: string } } })?.response?.data;
  return typeof data?.error === 'string' && data.error.length > 0 ? data.error : fallback;
}

export function useCaseStudyMeasurement(caseStudyId: string | undefined): CaseStudyMeasurement {
  const [metrics, setMetrics] = useState<readonly MeasuredMetric[]>([]);
  const [definitionKeys, setDefinitionKeys] = useState<readonly string[]>([]);
  const [busy, setBusy] = useState(false);
  const [lastRun, setLastRun] = useState<MetricRunReport | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (): Promise<void> => {
    if (!caseStudyId) return;
    try {
      setMetrics(await listMeasuredMetrics(caseStudyId));
    } catch (err) {
      setError(messageOf(err, 'Could not load the measured figures.'));
    }
  }, [caseStudyId]);

  useEffect(() => { void load(); }, [load]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const keys = await listMetricDefinitions();
        if (!cancelled) setDefinitionKeys(keys);
      } catch {
        // A missing definition list disables the run control and nothing else.
        // It is not worth an error banner over the figures themselves.
        if (!cancelled) setDefinitionKeys([]);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const onRun = useCallback((definitionKey: string): void => {
    if (!caseStudyId) return;
    setBusy(true);
    setError(null);
    void (async () => {
      try {
        setLastRun(await runMeasurement(caseStudyId, definitionKey));
        // Reload rather than patching locally: a run writes a row and repoints
        // its evidence, and the server is the only thing that knows the result.
        await load();
      } catch (err) {
        setError(messageOf(err, 'The measurement could not be run.'));
      } finally {
        setBusy(false);
      }
    })();
  }, [caseStudyId, load]);

  const onPromote = useCallback((
    metricKey: string,
    next: { verificationClass: MetricVerificationClass; publishable: boolean; isHeadline: boolean }
  ): void => {
    if (!caseStudyId) return;
    setBusy(true);
    setError(null);
    void (async () => {
      try {
        await promoteMetric(caseStudyId, metricKey, next);
      } catch (err) {
        // The server's refusal, verbatim: "a self-report is not third-party
        // verification" tells an operator what to change. "Promotion failed"
        // does not.
        setError(messageOf(err, 'The decision could not be recorded.'));
      } finally {
        // RELOAD EITHER WAY. On success the row moved; on refusal it did not,
        // and the controls must fall back to what the server actually holds
        // rather than keeping a choice it rejected.
        await load();
        setBusy(false);
      }
    })();
  }, [caseStudyId, load]);

  return { metrics, definitionKeys, busy, lastRun, error, onRun, onPromote };
}
