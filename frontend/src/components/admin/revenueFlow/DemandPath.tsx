import React from 'react';
import { paintFor } from './flowTokens';
import DemandSourceDetail from './DemandSourceDetail';
import { fmtCountOr } from './fmtCount';
import type { DemandBand } from './flowBoardTypes';

/**
 * The path in front of a revenue number: what we asked, where the evidence stops, who arrived.
 *
 * Ali, 2026-11-23: "Currently there is an alumni campaign and 2 Maya campaigns and marketing
 * (Landing page - open house) currently going towards this revenue source. Can we show that so
 * we can see the path before they reach the final revenue number."
 *
 * ── WHY THE BREAK IS DRAWN AND NOT FOOTNOTED ─────────────────────────────────────────────
 *
 * Measured on production that morning, over the 33 people paying today: `leads.source` covers
 * 33 of 33, any UTM tag 7, and `utm_campaign` 6. A campaign-keyed path would be blank for 27
 * of the 33 people who pay us, and nothing anywhere records that a subscription exists because
 * a campaign asked for it.
 *
 * So the two bands do not connect, and the page says where they stop connecting, at the width
 * of the card, in the reading order. Ali chose this shape over the two alternatives (a single
 * chain that implied attribution it does not have, or campaigns left off the page) precisely
 * because the break is the finding. A gap drawn is a finding; a gap omitted is a claim.
 *
 * ── A SOURCE WEARS A TONE, NOT A CLASSIFICATION ──────────────────────────────────────────
 *
 * Every other coloured thing here carries a classification key and looks its paint up in the
 * registry the backend ships. A demand source carries a tone instead, because the registry
 * exists so a dated EVENT can carry only a key and still be readable, and no demand source is
 * ever an event (see `DemandSourceDetail`). A classification minted for these would sit in the
 * legend explaining a meaning no pill on the timeline ever wears.
 *
 * The tone still carries a WORD, from the same `TONE` table the legend uses, so identity here
 * is never colour alone either.
 */
export default function DemandPath({
  streamKey, bands, openSourceKey, onPickSource,
}: {
  streamKey: string;
  bands: DemandBand[];
  /** Which source's detail is expanded, or null. Held by the card, so only one opens at a time. */
  openSourceKey: string | null;
  onPickSource: (sourceKey: string | null) => void;
}) {
  return (
    <div className="mb-3" data-testid={`demand-path-${streamKey}`}>
      {bands.map((band) => {
        const open = band.sources.find((s) => s.key === openSourceKey);
        return (
          <React.Fragment key={band.key}>
            <div className="mb-1">
              <div style={{ fontSize: 12, fontWeight: 700 }} data-testid={`demand-band-${streamKey}-${band.key}`}>
                {band.label}
              </div>
              <div className="text-muted" style={{ fontSize: 11 }}>{band.definition}</div>
            </div>

            <div className="d-flex flex-wrap gap-2 mb-2">
              {band.sources.map((src) => {
                const paint = paintFor(src.tone);
                const isOpen = src.key === openSourceKey;
                return (
                  <button
                    key={src.key}
                    type="button"
                    className="text-start"
                    data-testid={`demand-source-${streamKey}-${src.key}`}
                    aria-expanded={isOpen}
                    onClick={() => onPickSource(isOpen ? null : src.key)}
                    style={{
                      flex: '1 1 190px',
                      minWidth: 190,
                      padding: '8px 10px',
                      borderRadius: 6,
                      background: isOpen ? paint.bg : 'var(--surface-subtle)',
                      border: `1px solid ${isOpen ? paint.fg : 'var(--border-subtle, #e2e8f0)'}`,
                      cursor: 'pointer',
                    }}
                  >
                    <div style={{ fontSize: 11, fontWeight: 600, color: paint.fg }}>
                      <span
                        aria-hidden="true"
                        style={{
                          display: 'inline-block', width: 8, height: 8, borderRadius: 2,
                          background: paint.fg, marginRight: 6,
                        }}
                      />
                      {paint.name}
                    </div>
                    <div style={{ fontSize: 13, fontWeight: 700, lineHeight: 1.25 }}>{src.label}</div>
                    <div style={{ fontSize: 18, fontWeight: 700 }}>{fmtCountOr(src.count, 'Not recorded')}</div>
                    <div className="text-muted" style={{ fontSize: 11 }}>{src.countLabel}</div>

                    {/* ── THE TWO SUB-KPIs, BOTTOM LEFT AND BOTTOM RIGHT (R27) ───────────
                        Ali, 25 Nov: "show bottom left and right sub kpi's showing the read
                        and click rates".

                        Each prints its own numerator and denominator under the percentage.
                        A rate without its basis is the easiest number on this page to
                        misuse: 14% over 8,518 emails and 14% over 7 are the same figure and
                        not the same fact. */}
                    {src.rates && src.rates.length > 0 && (
                      <div
                        className="d-flex justify-content-between mt-2 pt-2"
                        style={{ borderTop: '1px solid var(--border-subtle, #e2e8f0)', gap: 8 }}
                        data-testid={`demand-rates-${streamKey}-${src.key}`}
                      >
                        {src.rates.map((rate, i) => (
                          <div
                            key={rate.key}
                            style={{ textAlign: i === 0 ? 'left' : 'right', minWidth: 0 }}
                            data-testid={`demand-rate-${streamKey}-${src.key}-${rate.key}`}
                          >
                            <div
                              style={{
                                fontSize: 13,
                                fontWeight: 700,
                                // Words rather than a percentage when the denominator is zero,
                                // so an undefined rate never wears the colour of a measured one.
                                color: rate.defined ? 'var(--text-primary)' : 'var(--text-muted)',
                              }}
                            >
                              {rate.display}
                            </div>
                            <div className="text-muted" style={{ fontSize: 10 }}>{rate.label}</div>
                            {rate.defined && (
                              <div className="text-muted" style={{ fontSize: 9 }}>
                                {fmtCountOr(rate.numerator, '0')}
                                {' of '}
                                {fmtCountOr(rate.denominator, '0')}
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </button>
                );
              })}
            </div>

            {open && <DemandSourceDetail streamKey={streamKey} source={open} />}

            {band.attributionBreak && (
              <div
                className="my-3 p-2"
                data-testid={`demand-break-${streamKey}`}
                style={{
                  fontSize: 11,
                  borderTop: '2px dashed var(--status-warning)',
                  borderBottom: '2px dashed var(--status-warning)',
                  background: 'var(--status-warning-bg)',
                }}
              >
                <strong>Needs attention: the chain of evidence stops here.</strong>{' '}
                {band.attributionBreak}
              </div>
            )}
          </React.Fragment>
        );
      })}
    </div>
  );
}

