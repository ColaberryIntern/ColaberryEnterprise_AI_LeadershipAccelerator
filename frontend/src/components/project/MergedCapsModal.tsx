/**
 * MergedCapsModal — surfaces which caps were collapsed into a single
 * BP row by the frontend_route dedup helper.
 *
 * 2026-05-20: operator caught the silent merge — clicking the "+N"
 * pill on a row now opens this small overlay listing each merged cap
 * with name + source + linked-file counts + a button to drill into
 * the specific cap. Closes the audit loop.
 */
import React from 'react';

interface MergedCap {
  id: string;
  name: string;
  source?: string;
  linked_backend_services_count?: number;
  linked_frontend_components_count?: number;
  linked_agents_count?: number;
}

interface Props {
  open: boolean;
  route: string;
  caps: MergedCap[];
  primaryId: string;
  onClose: () => void;
  onPickCap: (id: string) => void;
}

const MergedCapsModal: React.FC<Props> = ({ open, route, caps, primaryId, onClose, onPickCap }) => {
  if (!open) return null;
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Merged capabilities"
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0,
        background: 'rgba(15, 23, 42, 0.45)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        zIndex: 2000,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: 'white',
          borderRadius: 8,
          width: 'min(540px, 92vw)',
          maxHeight: '80vh',
          overflow: 'auto',
          boxShadow: '0 20px 60px rgba(15, 23, 42, 0.25)',
          padding: '1.25rem 1.4rem',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14 }}>
          <div>
            <div style={{
              fontSize: 10.5, textTransform: 'uppercase', letterSpacing: '0.1em',
              color: 'var(--color-text-light)', fontWeight: 600,
            }}>
              Caps sharing this route
            </div>
            <div style={{ fontSize: 16, fontWeight: 600, color: 'var(--color-primary)', marginTop: 2 }}>
              {route}
            </div>
            <div style={{ fontSize: 12, color: 'var(--color-text-light)', marginTop: 4 }}>
              These {caps.length} caps were collapsed into one row because they all point at this page.
              The row shows the "primary" cap (most linked code, shortest canonical name);
              the others are folded in. Drill into any of them below.
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            style={{
              background: 'transparent', border: 'none', fontSize: 18,
              color: 'var(--color-text-light)', cursor: 'pointer',
              padding: 4, lineHeight: 1,
            }}
          >
            <i className="bi bi-x-lg" />
          </button>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {caps.map(c => {
            const isPrimary = c.id === primaryId;
            return (
              <div
                key={c.id}
                style={{
                  display: 'flex', alignItems: 'center', gap: 12,
                  padding: '10px 12px',
                  border: '1px solid var(--color-border)',
                  borderRadius: 6,
                  background: isPrimary ? 'var(--color-bg-alt)' : 'white',
                }}
              >
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-text)' }}>
                      {c.name}
                    </span>
                    {isPrimary && (
                      <span style={{
                        fontSize: 9.5, fontWeight: 700,
                        color: 'var(--color-primary)',
                        background: 'rgba(37, 99, 235, 0.10)',
                        padding: '1px 6px', borderRadius: 3,
                        textTransform: 'uppercase', letterSpacing: '0.04em',
                      }}>
                        Primary
                      </span>
                    )}
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--color-text-light)', marginTop: 3 }}>
                    {c.source || 'unknown source'}
                    {' · '}
                    BE {c.linked_backend_services_count || 0}
                    {' · '}
                    FE {c.linked_frontend_components_count || 0}
                    {' · '}
                    AG {c.linked_agents_count || 0}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => onPickCap(c.id)}
                  className="btn btn-sm btn-outline-primary"
                  style={{ fontSize: 11, whiteSpace: 'nowrap' }}
                >
                  Open this cap
                </button>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};

export default MergedCapsModal;
