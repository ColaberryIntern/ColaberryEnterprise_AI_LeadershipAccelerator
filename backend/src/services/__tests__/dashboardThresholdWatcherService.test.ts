/**
 * dashboardThresholdWatcherService — BC #10099862873 (P1, item 4): converts
 * the Trust Center + Ingest Logs dashboards from pull-only to push-alerts.
 */
jest.mock('../trustMetricsService', () => ({ getTrustOverview: jest.fn() }));
jest.mock('../ingestStatsService', () => ({ ingestStatusCounts: jest.fn(), ingestStatusCountsBySource: jest.fn() }));
jest.mock('../alertService', () => ({ emitAlert: jest.fn().mockResolvedValue({ id: 'alert-1' }) }));

import {
  evaluateTrustCenterHealth,
  evaluateIngestHealth,
  checkDashboardThresholds,
} from '../dashboardThresholdWatcherService';
import { getTrustOverview } from '../trustMetricsService';
import { ingestStatusCounts, ingestStatusCountsBySource } from '../ingestStatsService';
import { emitAlert } from '../alertService';

const mockGetTrustOverview = getTrustOverview as jest.Mock;
const mockIngestStatusCounts = ingestStatusCounts as jest.Mock;
const mockIngestStatusCountsBySource = ingestStatusCountsBySource as jest.Mock;
const mockEmitAlert = emitAlert as jest.Mock;

describe('evaluateTrustCenterHealth — pure evaluator', () => {
  it('happy path: green band produces no alert', () => {
    expect(evaluateTrustCenterHealth({ compositeTrustScore: 85, band: 'green' })).toEqual([]);
  });

  it('boundary: amber band produces a warning', () => {
    const alerts = evaluateTrustCenterHealth({ compositeTrustScore: 60, band: 'amber' });
    expect(alerts).toHaveLength(1);
    expect(alerts[0].type).toBe('warning');
  });

  it('failure path: red band produces a critical alert', () => {
    const alerts = evaluateTrustCenterHealth({ compositeTrustScore: 30, band: 'red' });
    expect(alerts).toHaveLength(1);
    expect(alerts[0].type).toBe('critical');
    expect(alerts[0].metadata.composite_score).toBe(30);
  });

  it('regression: the weakest dimension is surfaced so the alert names what to go fix, not just the composite', () => {
    const alerts = evaluateTrustCenterHealth({
      compositeTrustScore: 40,
      band: 'red',
      dimensions: [
        { key: 'trace_coverage', label: 'Trace Coverage', score: 70, state: 'ok', evidence: 'Most calls traced' },
        { key: 'kill_switch', label: 'Kill Switch', score: 10, state: 'critical', evidence: 'Kill switch untested in 90 days' },
      ],
    });
    expect(alerts[0].metadata.worst_dimension).toEqual(
      expect.objectContaining({ key: 'kill_switch', score: 10 })
    );
    expect(alerts[0].description).toContain('Kill Switch');
  });

  it('boundary: no dimensions array provided (e.g. an older overview shape) does not crash', () => {
    expect(() => evaluateTrustCenterHealth({ compositeTrustScore: 40, band: 'red' })).not.toThrow();
  });
});

describe('evaluateIngestHealth — pure evaluator', () => {
  it('happy path: mostly-accepted counts produce no alert', () => {
    const alerts = evaluateIngestHealth({ accepted: 20, rejected: 1, error: 0, pending: 0 });
    expect(alerts).toEqual([]);
  });

  it('boundary: below the min sample size, even 100% failure does not trigger', () => {
    const alerts = evaluateIngestHealth({ accepted: 0, rejected: 2, error: 1, pending: 0 });
    expect(alerts).toEqual([]);
  });

  it('boundary: error rate at exactly 50% (5/10) triggers a warning', () => {
    const alerts = evaluateIngestHealth({ accepted: 5, rejected: 3, error: 2, pending: 0 });
    expect(alerts).toHaveLength(1);
    expect(alerts[0].type).toBe('warning');
    expect(alerts[0].metadata.error_rate).toBe(50);
  });

  it('failure path: error rate at 80% (8/10) escalates to critical', () => {
    const alerts = evaluateIngestHealth({ accepted: 2, rejected: 6, error: 2, pending: 0 });
    expect(alerts).toHaveLength(1);
    expect(alerts[0].type).toBe('critical');
  });

  it('boundary: pending payloads count toward the sample but are not treated as failures', () => {
    const alerts = evaluateIngestHealth({ accepted: 1, rejected: 0, error: 0, pending: 4 });
    expect(alerts).toEqual([]); // 0% error rate even though only 1/5 resolved
  });

  it('regression: the worst-failing source is surfaced, not just the aggregate rate', () => {
    const alerts = evaluateIngestHealth(
      { accepted: 2, rejected: 6, error: 2, pending: 0 },
      [
        { source_slug: 'apollo_import', accepted: 2, rejected: 1, error: 0, pending: 0 },
        { source_slug: 'linkedin_webhook', accepted: 0, rejected: 5, error: 2, pending: 0 },
      ],
    );
    expect(alerts[0].metadata.worst_source).toEqual(
      expect.objectContaining({ source_slug: 'linkedin_webhook', rejected: 5, error: 2 })
    );
    expect(alerts[0].description).toContain('linkedin_webhook');
  });

  it('boundary: no by-source breakdown provided does not crash and omits worst_source', () => {
    const alerts = evaluateIngestHealth({ accepted: 2, rejected: 6, error: 2, pending: 0 });
    expect(alerts[0].metadata.worst_source).toBeNull();
  });
});

describe('checkDashboardThresholds — orchestrator', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('happy path: both dashboards healthy — no alerts emitted', async () => {
    mockGetTrustOverview.mockResolvedValue({ compositeTrustScore: 90, band: 'green' });
    mockIngestStatusCounts.mockResolvedValue({ accepted: 20, rejected: 0, error: 0, pending: 0 });
    mockIngestStatusCountsBySource.mockResolvedValue([]);

    await checkDashboardThresholds();

    expect(mockEmitAlert).not.toHaveBeenCalled();
  });

  it('failure path: one dashboard breaching emits exactly one alert for it', async () => {
    mockGetTrustOverview.mockResolvedValue({ compositeTrustScore: 40, band: 'red' });
    mockIngestStatusCounts.mockResolvedValue({ accepted: 20, rejected: 0, error: 0, pending: 0 });
    mockIngestStatusCountsBySource.mockResolvedValue([]);

    await checkDashboardThresholds();

    expect(mockEmitAlert).toHaveBeenCalledTimes(1);
    expect(mockEmitAlert.mock.calls[0][0]).toEqual(
      expect.objectContaining({ type: 'critical', impactArea: 'trust_center' })
    );
  });

  it('failure isolation: a Trust Center lookup failure does not block the Ingest Logs check', async () => {
    mockGetTrustOverview.mockRejectedValue(new Error('DB timeout'));
    mockIngestStatusCounts.mockResolvedValue({ accepted: 1, rejected: 4, error: 3, pending: 0 }); // 87.5% -> critical
    mockIngestStatusCountsBySource.mockResolvedValue([
      { source_slug: 'apollo_import', accepted: 1, rejected: 4, error: 3, pending: 0 },
    ]);

    await expect(checkDashboardThresholds()).resolves.not.toThrow();

    expect(mockEmitAlert).toHaveBeenCalledTimes(1);
    expect(mockEmitAlert.mock.calls[0][0].impactArea).toBe('lead_ingest');
    expect(mockEmitAlert.mock.calls[0][0].metadata.worst_source.source_slug).toBe('apollo_import');
  });
});
