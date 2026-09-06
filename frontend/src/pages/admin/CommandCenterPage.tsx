import React, { useCallback, useEffect, useState } from 'react';
import api from '../../utils/api';
import { PageHeader, SectionCard, StatCard } from '../../components/admin/shell';
import { toDrilldownUrl } from '../../adminOs/drilldown';

/**
 * Command Center — the executive home.
 *
 * WHAT THIS PAGE DOES DIFFERENTLY. The War Room fetches six endpoints and wraps
 * each in `.catch(() => ({ data: {} }))`, so a 500 becomes an empty object and
 * renders as 0. A broken backend and a genuinely quiet day look identical, and
 * the reader has no way to tell which one they are looking at.
 *
 * Here the backend composes the sources and reports each one's state, so a tile
 * can say "Couldn't load" or "Unavailable" instead of showing a number that
 * isn't true. Nothing on this page is hard-coded: every figure comes from
 * /api/admin/command-center/summary, and a figure that cannot be computed is
 * rendered as absent rather than as zero.
 */

type SourceStatus = 'ok' | 'failed' | 'unavailable';
type Trust = 'trusted' | 'partial' | 'stale' | 'unavailable' | 'invalid';

interface MetricTile {
  key: string;
  name: string;
  value: number | null;
  unit: string;
  trust: Trust;
  note?: string;
  computable: boolean;
  status: SourceStatus;
  errorClass?: string;
}

interface FeedItem {
  id: string;
  label: string;
  detail?: string;
  at?: string;
  severity?: number;
}

interface FeedSection {
  status: SourceStatus;
  items: FeedItem[];
}

interface Summary {
  generatedAt: string;
  windowDays: number;
  tiles: MetricTile[];
  attention: FeedSection;
  activity: FeedSection;
  degraded: string[];
}

const WINDOWS = [7, 30, 90];

/** Trust that is worth showing next to a number. 'trusted' needs no badge. */
const TRUST_LABEL: Partial<Record<Trust, string>> = {
  partial: 'Partial',
  stale: 'Stale',
  unavailable: 'No source',
  invalid: 'Not valid',
};

const TRUST_TONE: Record<Trust, 'success' | 'warning' | 'danger' | 'neutral'> = {
  trusted: 'success',
  partial: 'warning',
  stale: 'warning',
  unavailable: 'neutral',
  invalid: 'danger',
};

function formatValue(tile: MetricTile): React.ReactNode {
  // The rule, at the last possible moment before pixels: a value that could not
  // be computed is never drawn as 0.
  if (tile.value === null) {
    const text = tile.status === 'failed' ? "Couldn't load" : 'Unavailable';
    return <span style={{ fontSize: '1.05rem', color: 'var(--text-muted)' }}>{text}</span>;
  }
  if (tile.unit === 'percent') return `${tile.value.toFixed(2)}%`;
  if (tile.unit === 'currency') return `$${tile.value.toLocaleString()}`;
  return tile.value.toLocaleString();
}

/** Where a tile drills through to, when its metric supports one. */
function drilldownFor(tile: MetricTile, days: number): string | undefined {
  if (tile.value === null) return undefined;
  if (!tile.key.startsWith('growth.')) return undefined;
  return toDrilldownUrl({
    kind: 'people.roster',
    metricKey: tile.key,
    filters: { period: `${days}d`, includeBots: false },
  });
}

/**
 * A list that says which kind of empty it is.
 *
 * An empty list from a healthy source means nothing is happening. An empty list
 * from a failed source means we could not look. Rendering both as "All clear" is
 * how an outage reads as a calm morning, so the two are drawn differently.
 */
function FeedList({
  section,
  emptyText,
  showSeverity = false,
}: {
  section: FeedSection;
  emptyText: string;
  showSeverity?: boolean;
}) {
  if (section.status === 'failed') {
    return (
      <p className="text-danger mb-0 small">
        Couldn&apos;t load this list. It is not empty — we just can&apos;t see it right now.
      </p>
    );
  }
  if (section.items.length === 0) {
    return <p className="text-muted mb-0 small">{emptyText}</p>;
  }
  return (
    <ul className="list-unstyled mb-0">
      {section.items.slice(0, 12).map((item) => (
        <li key={item.id} className="d-flex justify-content-between gap-3 py-2 border-bottom">
          <span>
            {showSeverity && item.severity !== undefined && (
              <span className="badge text-bg-secondary me-2">S{item.severity}</span>
            )}
            <span className="fw-semibold">{item.label}</span>
            {item.detail && <span className="text-muted small ms-2">{item.detail}</span>}
          </span>
          {item.at && (
            <span className="text-muted small text-nowrap">
              {new Date(item.at).toLocaleString()}
            </span>
          )}
        </li>
      ))}
    </ul>
  );
}

export default function CommandCenterPage() {
  const [summary, setSummary] = useState<Summary | null>(null);
  const [days, setDays] = useState(30);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (windowDays: number) => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.get(`/api/admin/command-center/summary?days=${windowDays}`);
      setSummary(res.data);
    } catch (err) {
      // Deliberately not `.catch(() => ({}))`. An empty summary would render as
      // a page full of zeros, which is the failure this page exists to end.
      setSummary(null);
      setError(
        err instanceof Error
          ? `Could not load the summary (${err.message}).`
          : 'Could not load the summary.',
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(days); }, [days, load]);

  return (
    <div className="container-fluid py-4">
      <PageHeader
        title="Command Center"
        subtitle="What needs attention, and what the numbers can actually tell you."
      />

      <div className="d-flex align-items-center gap-2 mb-3">
        <span className="text-muted small">Window</span>
        {WINDOWS.map((w) => (
          <button
            key={w}
            type="button"
            className={`btn btn-sm ${w === days ? 'btn-dark' : 'btn-outline-secondary'}`}
            onClick={() => setDays(w)}
            aria-pressed={w === days}
          >
            {w} days
          </button>
        ))}
      </div>

      {/* A failed load says so. It never falls through to an empty page that
          reads as "nothing happened". */}
      {error && (
        <div className="alert alert-danger d-flex justify-content-between align-items-center">
          <span>{error}</span>
          <button type="button" className="btn btn-sm btn-outline-dark" onClick={() => void load(days)}>
            Retry
          </button>
        </div>
      )}

      {/* Partial degradation is named, so a reader knows which tiles to distrust
          rather than having to guess from a suspicious-looking zero. */}
      {summary && summary.degraded.length > 0 && (
        <div className="alert alert-warning">
          <strong>Some sources didn&apos;t respond:</strong> {summary.degraded.join(', ')}.
          Those tiles show &quot;Couldn&apos;t load&quot; rather than zero.
        </div>
      )}

      {loading && !summary && <div className="text-muted py-5 text-center">Loading…</div>}

      {summary && (
        <>
          <div className="row g-3 mb-4">
            {summary.tiles.map((tile) => {
              const to = drilldownFor(tile, summary.windowDays);
              return (
                <div className="col-12 col-sm-6 col-xl-4" key={tile.key}>
                  <StatCard
                    label={tile.name}
                    value={formatValue(tile)}
                    tone={TRUST_TONE[tile.trust]}
                    hint={TRUST_LABEL[tile.trust]}
                    to={to}
                  />
                </div>
              );
            })}
          </div>

          <div className="row g-3 mb-4">
            <div className="col-12 col-lg-6">
              <SectionCard title="Needs attention">
                <FeedList
                  section={summary.attention}
                  emptyText="Nothing needs attention right now."
                  showSeverity
                />
              </SectionCard>
            </div>
            <div className="col-12 col-lg-6">
              <SectionCard title="Recent activity">
                <FeedList section={summary.activity} emptyText="No activity recorded yet." />
              </SectionCard>
            </div>
          </div>

          {/* Every caveat, stated once, in full. A footnote a reader has to hover
              for is a caveat most readers never see. */}
          <SectionCard title="What these numbers mean">
            <ul className="list-unstyled mb-0">
              {summary.tiles
                .filter((t) => t.note)
                .map((t) => (
                  <li key={t.key} className="mb-3">
                    <div className="fw-semibold">{t.name}</div>
                    <div className="text-muted small">{t.note}</div>
                  </li>
                ))}
              <li className="text-muted small">
                Generated {new Date(summary.generatedAt).toLocaleString()} over the last{' '}
                {summary.windowDays} days.
              </li>
            </ul>
          </SectionCard>
        </>
      )}
    </div>
  );
}
