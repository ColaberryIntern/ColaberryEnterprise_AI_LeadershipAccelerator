/**
 * Drawer — reusable slide-in panel from the right.
 *
 * Living Workspace Sprint, 2026-05-10. The shared shell every contextual
 * drawer in the workspace uses (Readiness / Coverage / Why-this-next /
 * Cory). Calm, premium, restrained — backdrop fades, panel slides 280ms,
 * Esc closes, click-outside closes.
 *
 * Children control the body content; the shell owns the chrome.
 */
import React, { useEffect } from 'react';

interface Props {
  open: boolean;
  onClose: () => void;
  /** Compact label above the title, e.g. "READINESS · why 38%" */
  eyebrow?: string;
  /** Main title — short, sentence case */
  title: string;
  /** Optional pill/badge alongside title (status, count, etc.) */
  titleBadge?: { text: string; tone?: 'good' | 'warn' | 'info' | 'neutral' };
  /** Short subtitle below the title */
  subtitle?: string;
  /** Footer node — typically action buttons */
  footer?: React.ReactNode;
  children: React.ReactNode;
  /** Width in px. Default 460. */
  width?: number;
}

const TONE_COLORS: Record<NonNullable<NonNullable<Props['titleBadge']>['tone']>, { bg: string; fg: string }> = {
  good: { bg: 'rgba(16, 185, 129, 0.1)', fg: 'var(--color-success)' },
  warn: { bg: 'rgba(245, 158, 11, 0.1)', fg: 'var(--color-warning)' },
  info: { bg: 'rgba(59, 130, 246, 0.1)', fg: 'var(--color-info)' },
  neutral: { bg: 'var(--color-bg-alt)', fg: 'var(--color-text-light)' },
};

const Drawer: React.FC<Props> = ({ open, onClose, eyebrow, title, titleBadge, subtitle, footer, children, width = 460 }) => {
  // Esc-to-close + body scroll lock when open.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [open, onClose]);

  return (
    <>
      {/* Backdrop — soft, fades in */}
      <div
        onClick={onClose}
        aria-hidden="true"
        style={{
          position: 'fixed', inset: 0,
          background: 'rgba(15, 23, 42, 0.32)',
          opacity: open ? 1 : 0,
          pointerEvents: open ? 'auto' : 'none',
          transition: 'opacity 220ms ease',
          zIndex: 1040,
        }}
      />

      {/* Panel — slides from the right */}
      <aside
        role="dialog"
        aria-modal="true"
        aria-label={title}
        style={{
          position: 'fixed', top: 0, right: 0, bottom: 0,
          width, maxWidth: '92vw',
          background: 'white',
          boxShadow: '-12px 0 40px rgba(15, 23, 42, 0.18)',
          transform: open ? 'translateX(0)' : `translateX(${width + 60}px)`,
          transition: 'transform 280ms cubic-bezier(.22,.85,.32,1)',
          zIndex: 1045,
          display: 'flex', flexDirection: 'column',
          overflow: 'hidden',
        }}
      >
        {/* Header */}
        <header style={{
          padding: '1rem 1.2rem 0.85rem',
          borderBottom: '1px solid var(--color-border)',
          background: 'var(--color-bg-alt)',
        }}>
          {eyebrow && (
            <div style={{
              fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.1em',
              color: 'var(--color-text-light)', fontWeight: 600, marginBottom: 5,
            }}>{eyebrow}</div>
          )}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
              <h3 style={{
                fontSize: 17, fontWeight: 600, color: '#FB2832',
                margin: 0, letterSpacing: '-0.01em',
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              }}>{title}</h3>
              {titleBadge && (() => {
                const t = TONE_COLORS[titleBadge.tone || 'neutral'];
                return (
                  <span style={{
                    fontSize: 10, padding: '0.15rem 0.5rem', borderRadius: 3,
                    fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em',
                    background: t.bg, color: t.fg, flexShrink: 0,
                  }}>{titleBadge.text}</span>
                );
              })()}
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              style={{
                background: 'transparent', border: 'none', color: 'var(--color-text-light)',
                fontSize: 22, lineHeight: 1, cursor: 'pointer', padding: '0 4px',
              }}
            >×</button>
          </div>
          {subtitle && (
            <div style={{ fontSize: 12, color: 'var(--color-text-light)', marginTop: 5, lineHeight: 1.55 }}>
              {subtitle}
            </div>
          )}
        </header>

        {/* Body — scrolls */}
        <div style={{
          flex: 1, minHeight: 0, overflowY: 'auto',
          padding: '1rem 1.2rem',
        }}>
          {children}
        </div>

        {/* Footer — optional */}
        {footer && (
          <footer style={{
            padding: '0.7rem 1.2rem',
            borderTop: '1px solid var(--color-border)',
            background: 'var(--color-bg-alt)',
            display: 'flex', justifyContent: 'flex-end', gap: 8, alignItems: 'center',
          }}>
            {footer}
          </footer>
        )}
      </aside>
    </>
  );
};

export default Drawer;
