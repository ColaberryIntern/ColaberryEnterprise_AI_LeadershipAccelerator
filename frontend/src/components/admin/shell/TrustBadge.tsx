import React, { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { TrustSignal, levelMeta, timeAgo } from './trust';

/**
 * TrustBadge — the "trust on every page" chip (Basecamp todo 10027085963).
 * L0 chip (level + source + freshness); click to drill L1 pillars -> L2 evidence
 * -> L3 raw links. Self-contained popover (no extra deps): button + click-away.
 */
export default function TrustBadge({ signal, compact = false }: { signal: TrustSignal; compact?: boolean }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const meta = levelMeta(signal.level);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div className="trust-badge" ref={ref}>
      <button
        type="button"
        className="trust-badge__chip"
        style={{ color: meta.color, background: meta.bg, borderColor: meta.color }}
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-haspopup="dialog"
        title="Data trust & provenance"
      >
        <i className={`ri-${meta.icon}`} aria-hidden="true" />
        <span className="fw-semibold">{meta.label}</span>
        {typeof signal.score === 'number' && <span className="trust-badge__score">{signal.score}</span>}
        {!compact && signal.updatedAt && (
          <span className="trust-badge__meta">· {timeAgo(signal.updatedAt)}</span>
        )}
        <i className="ri-arrow-down-s-line trust-badge__caret" aria-hidden="true" />
      </button>

      {open && (
        <div className="trust-badge__panel shadow-lg" role="dialog" aria-label="Data trust details">
          <div className="trust-badge__panel-head">
            <div className="d-flex align-items-center gap-2">
              <i className={`ri-${meta.icon}`} style={{ color: meta.color, fontSize: '1.1rem' }} aria-hidden="true" />
              <span className="fw-bold">{meta.label}</span>
              {typeof signal.score === 'number' && (
                <span className="trust-badge__score-lg" style={{ color: meta.color }}>{signal.score}<small>/100</small></span>
              )}
            </div>
            {signal.summary && <p className="text-muted small mb-0 mt-1">{signal.summary}</p>}
          </div>

          <div className="trust-badge__panel-meta small text-muted">
            {signal.source && <span><i className="ri-database-2-line" aria-hidden="true" /> {signal.source}</span>}
            {signal.updatedAt && <span><i className="ri-history-line" aria-hidden="true" /> Updated {timeAgo(signal.updatedAt)}</span>}
          </div>

          {signal.pillars && signal.pillars.length > 0 && (
            <ul className="trust-badge__pillars">
              {signal.pillars.map((p, i) => {
                const pm = levelMeta(p.status || signal.level);
                return (
                  <li key={i} className="trust-badge__pillar">
                    <div className="d-flex align-items-center justify-content-between">
                      <span className="fw-semibold small">
                        <i className={`ri-${pm.icon}`} style={{ color: pm.color }} aria-hidden="true" /> {p.name}
                      </span>
                      {typeof p.score === 'number' && <span className="small" style={{ color: pm.color }}>{p.score}</span>}
                    </div>
                    {p.evidence && p.evidence.length > 0 && (
                      <ul className="trust-badge__evidence">
                        {p.evidence.map((e, j) => (
                          <li key={j} className="d-flex justify-content-between gap-2">
                            <span className="text-muted">{e.label}</span>
                            <span className="text-end">
                              {e.value && <span className="fw-medium">{e.value}</span>}
                              {e.href && (
                                <a href={e.href} className="ms-2" target="_blank" rel="noreferrer" title="View source rows">
                                  <i className="ri-external-link-line" aria-hidden="true" />
                                </a>
                              )}
                            </span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </li>
                );
              })}
            </ul>
          )}

          <div className="trust-badge__panel-foot">
            <Link to={signal.href || '/admin/trust'} className="small" onClick={() => setOpen(false)}>
              Open Trust Center <i className="ri-arrow-right-line" aria-hidden="true" />
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
