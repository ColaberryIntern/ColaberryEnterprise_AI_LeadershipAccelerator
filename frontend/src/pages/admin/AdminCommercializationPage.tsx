import React, { useEffect, useState } from 'react';
import api from '../../utils/api';
import { PageHeader, SectionCard } from '../../components/admin/shell';
import type { TrustSignal } from '../../components/admin/shell';

/**
 * Commercialization Command Center (/admin/commercialization) — C8.2, read-only.
 *
 * Eight of these ten tiles have no number. The single most important thing this page
 * does is stop those eight from reading as eight zeros, because "we have a pipeline of
 * $0" and "we do not record pipeline" lead to opposite decisions.
 *
 * So the rule the layout enforces is simple and absolute: A TILE SHOWS A NUMBER ONLY IF
 * A NUMBER WAS MEASURED. A measured zero prints "0". An unmeasurable tile prints nothing
 * at all — not a dash, not a placeholder, since any glyph in the value slot gets read as
 * a value. The status chip beside it carries the distinction in text as well as color,
 * so it survives a colorblind reader, a screenshot and a grayscale print.
 */

export type TileStatus = 'live' | 'measured_zero' | 'undefined_rate' | 'proxy' | 'unmeasurable';

export interface Tile {
  key: string;
  label: string;
  status: TileStatus;
  value: string | null;
  sourceTable: string | null;
  provenance: string;
  falseFriend?: string;
  unlockedBy?: string;
  caveat?: string;
}

interface Board {
  asOf: string;
  tiles: Tile[];
  summary: Partial<Record<TileStatus, number>>;
}

/**
 * Each status gets its own glyph AND its own words. Color is never the only carrier:
 * the four non-live states are easy to confuse at a glance and the whole value of the
 * board is that they are not confused.
 */
const STATUS: Record<TileStatus, {
  label: string; glyph: string; color: string; bg: string; showsNumber: boolean;
}> = {
  live: {
    label: 'Measured', glyph: '●',
    color: 'var(--status-success)', bg: 'var(--status-success-bg)', showsNumber: true,
  },
  measured_zero: {
    label: 'Measured zero', glyph: '○',
    color: 'var(--status-info)', bg: 'var(--status-info-bg)', showsNumber: true,
  },
  undefined_rate: {
    label: 'Undefined', glyph: '—',
    color: 'var(--text-muted)', bg: 'var(--surface-subtle)', showsNumber: false,
  },
  proxy: {
    label: 'Proxy only', glyph: '◐',
    color: 'var(--status-warning)', bg: 'var(--status-warning-bg)', showsNumber: true,
  },
  unmeasurable: {
    label: 'Not yet measurable', glyph: '✕',
    color: 'var(--text-muted)', bg: 'var(--surface-subtle)', showsNumber: false,
  },
};

const ORDER: TileStatus[] = ['live', 'proxy', 'measured_zero', 'undefined_rate', 'unmeasurable'];

function StatusChip({ status }: { status: TileStatus }) {
  const s = STATUS[status];
  return (
    <span
      className="d-inline-flex align-items-center gap-1 px-2 py-1 rounded-pill small fw-semibold"
      style={{ color: s.color, background: s.bg, border: `1px solid ${s.color}` }}
      data-testid={`status-chip-${status}`}
    >
      <span aria-hidden="true">{s.glyph}</span>
      {s.label}
    </span>
  );
}

/**
 * Exported so the "no number unless measured" rule can be tested against fixtures.
 * `renderToStaticMarkup` never runs effects, so the page's own loading shell cannot
 * exercise a populated tile — the invariant has to be reachable directly or it is
 * only asserted by reading the source.
 */
export function TileCard({ tile }: { tile: Tile }) {
  const s = STATUS[tile.status];
  // The invariant, enforced at render rather than trusted: no number unless measured.
  const showNumber = s.showsNumber && tile.value !== null;

  return (
    <div
      className="h-100 p-3 rounded border d-flex flex-column gap-2"
      style={{ background: 'var(--surface-card)', borderColor: 'var(--border-subtle)' }}
      data-testid={`tile-${tile.key}`}
      data-status={tile.status}
      data-has-number={showNumber ? 'yes' : 'no'}
    >
      <div className="d-flex justify-content-between align-items-start gap-2">
        <span className="fw-semibold" style={{ color: 'var(--text-primary)' }}>{tile.label}</span>
        <StatusChip status={tile.status} />
      </div>

      {showNumber ? (
        <div
          className="fw-bold"
          style={{ fontSize: '1.9rem', lineHeight: 1.1, color: s.color }}
          data-testid={`value-${tile.key}`}
        >
          {tile.value}
        </div>
      ) : (
        <div className="small fst-italic" style={{ color: 'var(--text-muted)' }}>
          {tile.status === 'undefined_rate'
            ? 'No closed deals either way, so there is no rate to report.'
            : 'No number is shown because none can be measured.'}
        </div>
      )}

      <p className="small mb-0" style={{ color: 'var(--text-secondary)' }}>{tile.provenance}</p>

      {tile.caveat && (
        <p className="small mb-0 fw-medium" style={{ color: 'var(--status-warning)' }}>
          {tile.caveat}
        </p>
      )}

      {tile.falseFriend && (
        <p className="small mb-0" style={{ color: 'var(--text-muted)' }}>
          <strong>Not this:</strong> {tile.falseFriend}
        </p>
      )}

      <div className="mt-auto pt-1 d-flex flex-column gap-1">
        {tile.sourceTable && (
          <code className="small" style={{ color: 'var(--text-muted)' }}>{tile.sourceTable}</code>
        )}
        {tile.unlockedBy && (
          <span className="small" style={{ color: 'var(--text-muted)' }}>
            <i className="ri-key-2-line" aria-hidden="true" /> {tile.unlockedBy}
          </span>
        )}
      </div>
    </div>
  );
}

export default function AdminCommercializationPage() {
  const [board, setBoard] = useState<Board | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    api.get('/api/admin/commercialization/board')
      .then((res) => {
        if (!alive) return;
        setBoard(res.data?.data ?? null);
        setLoading(false);
      })
      .catch((e) => {
        if (!alive) return;
        setError(e?.response?.data?.error || 'Could not load the commercialization board.');
        setLoading(false);
      });
    return () => { alive = false; };
  }, []);

  const trust: TrustSignal = {
    level: 'live',
    source: 'production Postgres',
    updatedAt: board?.asOf ?? null,
    summary: 'Two tiles are measured from production. The other eight state why they '
      + 'are not, rather than showing a zero.',
    href: '/admin/trust',
  };

  const counts = board?.summary ?? {};
  const measured = (counts.live ?? 0);
  const total = board?.tiles.length ?? 0;

  return (
    // The mount marker the C8.2 acceptance criterion asks for. /api/admin blanket-401s
    // before routing, so a 401 never proved this route existed; a rendered testid does.
    <div data-testid="commercialization-board">
      <PageHeader
        title="Commercialization Command Center"
        subtitle="What we can prove about the commercial business, and what we cannot yet measure"
        icon="line-chart-line"
        breadcrumb={[{ label: 'Admin', to: '/admin' }, { label: 'Commercialization' }]}
        trust={trust}
      />

      {loading && <p className="text-muted">Loading the board…</p>}

      {error && (
        <div className="alert alert-danger" role="alert" data-testid="board-error">{error}</div>
      )}

      {board && (
        <>
          <SectionCard title="What this board can prove today">
            <p className="mb-2">
              <strong>{measured} of {total} tiles carry a measured number.</strong> The rest
              are shown with the reason they are empty, because a dashboard that renders an
              unrecorded metric as <code>0</code> is worse than one that renders nothing: it
              invites a decision based on a number nobody measured.
            </p>
            <div className="d-flex flex-wrap gap-2" data-testid="status-summary">
              {ORDER.filter((s) => (counts[s] ?? 0) > 0).map((s) => (
                <span key={s} className="d-inline-flex align-items-center gap-2">
                  <StatusChip status={s} />
                  <span className="small text-muted">{counts[s]}</span>
                </span>
              ))}
            </div>
            <p className="small text-muted mb-0 mt-3">
              The gap is the finding, not a defect in this page. Two of the tables these
              tiles need already exist and have never been written to, so the instrumentation
              is largely built and unused. Closing that is C8.4.
            </p>
          </SectionCard>

          <div className="row g-3 mt-1">
            {ORDER.flatMap((s) => board.tiles.filter((t) => t.status === s)).map((t) => (
              <div className="col-12 col-md-6 col-xl-4" key={t.key}>
                <TileCard tile={t} />
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
