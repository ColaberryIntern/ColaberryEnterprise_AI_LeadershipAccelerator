/**
 * BPDetailV2 — editorial replacement for the legacy
 * PortalBusinessProcessDetail modal.
 *
 * BP V2 Detail Modal Sprint, 2026-05-12.
 *
 * The legacy modal showed numbered "Process Overview / System Truth /
 * What Exists / Backend Stack / Requirements Status / Quality Scores /
 * Maturity" sections, with red NOT READY badges, metric bars, and an
 * architecture/flow/database tab strip. Clicking a BP from the V2
 * architecture surface dropped the operator straight back into V1
 * telemetric land.
 *
 * This component speaks the same data, in V2 editorial language:
 *   - Soft lifecycle pill (Foundational / Emerging / … / Stabilizing)
 *     replaces the red NOT READY badge
 *   - One authored paragraph: what the BP does + where it sits in flow
 *   - "Where it stands" — what's working / what's missing as prose lists,
 *     no metric bars
 *   - 5-dot maturity strip (L1 → L5) — calm progression, not "Maturity Level 1"
 *   - Requirements: simple list (collapsed if >5), no Verified/Auto/Planned/Unmapped tiles
 *   - "Next steps" — 1-3 quiet improvement-prompt buttons via the existing
 *     bpApi.generatePrompt endpoint (same prompts as before, calmer presentation)
 *
 * Same Props interface as the legacy component so BPDomainSurface can
 * swap in without changes. The legacy modal still exists for power users
 * via "Show full inventory" → PortalBusinessProcessesTab.
 */
import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import * as bpApi from '../../services/portalBusinessProcessApi';
import { lifecycleStateFor, type LifecycleState } from '../../utils/bpDomainClassifier';

interface Props {
  processId: string;
  onClose: () => void;
  onUpdate: () => void;
}

// Soft lifecycle palette — matches BPDomainSurface so the surface ↔ detail feel cohesive.
const LIFECYCLE_TONE: Record<LifecycleState, { fg: string; bg: string }> = {
  Foundational: { fg: 'var(--color-text-light)', bg: 'rgba(113,128,150,0.08)' },
  Emerging:     { fg: '#b45309', bg: 'rgba(245,158,11,0.10)' },
  Coordinated:  { fg: '#1d4ed8', bg: 'rgba(59,130,246,0.10)' },
  Operational:  { fg: '#15803d', bg: 'rgba(56,161,105,0.12)' },
  Scaling:      { fg: '#0e7490', bg: 'rgba(8,145,178,0.12)' },
  Stabilizing:  { fg: '#6d28d9', bg: 'rgba(139,92,246,0.10)' },
};

const MATURITY_LABELS: Record<number, { label: string; blurb: string }> = {
  1: { label: 'Prototype', blurb: 'Early structure exists; rough edges are expected.' },
  2: { label: 'Working',   blurb: 'Core path runs; edges and recovery paths still informal.' },
  3: { label: 'Reliable',  blurb: 'Documented happy path; supporting infrastructure in place.' },
  4: { label: 'Hardened',  blurb: 'Verified end-to-end; observability is in the loop.' },
  5: { label: 'Mature',    blurb: 'Steady state; ongoing work is refinement.' },
};

interface ImprovementTarget {
  key: string;
  label: string;
  help: string;
  /** Optional page-specific override (used when frontend_route is set). */
  pageLabel?: string;
  pageHelp?: string;
}
const IMPROVEMENT_TARGETS: ImprovementTarget[] = [
  { key: 'backend_improvement', label: 'Generate a backend prompt',  help: 'Drafts a Claude Code prompt to extend the backend layer of this BP.' },
  {
    key: 'frontend_exposure',   label: 'Generate a UI prompt',       help: 'Drafts a prompt to add or improve the frontend surface for this BP.',
    pageLabel: 'Generate upgrade prompt',
    pageHelp: 'Drafts a Claude Code prompt to redesign / upgrade this page.',
  },
  { key: 'agent_enhancement',   label: 'Generate an agent prompt',   help: 'Drafts a prompt to evolve the agent or autonomous layer.' },
];

function toast(msg: string) {
  const el = document.createElement('div');
  el.innerHTML = `<div style="position:fixed;top:20px;left:50%;transform:translateX(-50%);z-index:99999;background:#1a365d;color:#fff;padding:11px 18px;border-radius:8px;box-shadow:0 4px 20px rgba(0,0,0,0.2);font-size:13px"><i class="bi bi-clipboard-check me-2"></i>${msg}</div>`;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 2800);
}

const BPDetailV2: React.FC<Props> = ({ processId, onClose, onUpdate: _onUpdate }) => {
  const navigate = useNavigate();
  const [p, setP] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [showAllReqs, setShowAllReqs] = useState(false);
  const [generating, setGenerating] = useState<string | null>(null);
  const [previewLoaded, setPreviewLoaded] = useState(false);

  useEffect(() => {
    setLoading(true);
    bpApi.getProcess(processId)
      .then(r => setP(r.data))
      .catch(() => setP(null))
      .finally(() => setLoading(false));
  }, [processId]);

  const lifecycleState = useMemo<LifecycleState>(() => {
    if (!p) return 'Foundational';
    const completion = (p.total_requirements && p.total_requirements > 0)
      ? Math.round(((p.matched_requirements || 0) / p.total_requirements) * 100)
      : 0;
    return lifecycleStateFor([p], completion);
  }, [p]);

  const layerStanding = useMemo(() => {
    if (!p) return { working: [] as string[], missing: [] as string[] };
    const u = p.usability || {};
    const working: string[] = [];
    const missing: string[] = [];
    const statusWord = (raw?: string, layer = ''): 'present' | 'partial' | 'missing' => {
      if (raw === 'ready' || raw === 'present') return 'present';
      if (raw === 'partial') return 'partial';
      return 'missing';
    };
    const push = (layer: 'backend' | 'frontend' | 'agent', raw?: string) => {
      const s = statusWord(raw, layer);
      const label = layer === 'backend' ? 'Backend implementation'
        : layer === 'frontend' ? 'Frontend surface'
        : 'Agent / autonomous layer';
      if (s === 'present') working.push(label);
      else if (s === 'partial') working.push(`${label} (forming)`);
      else missing.push(label);
    };
    push('backend', u.backend);
    push('frontend', u.frontend);
    push('agent', u.agent);
    const gaps = Array.isArray(p.gaps) ? p.gaps : [];
    if (gaps.length > 0) missing.push(`${gaps.length} open gap${gaps.length === 1 ? '' : 's'} flagged by analysis`);
    return { working, missing };
  }, [p]);

  /**
   * Hand this Page BP off to the Critique workspace. We seed sessionStorage
   * with the page route + BP id so VisualWorkspacePage (next render) can
   * pre-create or pre-select a session for this surface without the
   * operator needing to navigate manually.
   */
  const handleCritique = (route: string) => {
    try {
      sessionStorage.setItem('critique:autoOpenRoute', route);
      sessionStorage.setItem('critique:autoOpenBpId', processId);
      sessionStorage.setItem('critique:autoOpenAt', new Date().toISOString());
    } catch { /* localStorage unavailable */ }
    onClose();
    navigate('/portal/visual-workspace');
  };

  const handleGenerate = async (target: string) => {
    setGenerating(target);
    try {
      const r = await bpApi.generatePrompt(processId, target);
      try { await navigator.clipboard.writeText(r.data.prompt_text); }
      catch {
        // HTTP-dev fallback
        const ta = document.createElement('textarea');
        ta.value = r.data.prompt_text;
        ta.style.position = 'fixed'; ta.style.left = '-9999px';
        document.body.appendChild(ta); ta.select(); document.execCommand('copy');
        document.body.removeChild(ta);
      }
      toast(`Prompt copied — paste into Claude Code`);
    } catch { toast('Could not generate prompt'); }
    finally { setGenerating(null); }
  };

  if (loading) {
    return (
      <div style={{ padding: '2.5rem 1rem', textAlign: 'center', color: 'var(--color-text-light)' }}>
        <div className="spinner-border spinner-border-sm me-2" role="status" />
        Loading process detail…
      </div>
    );
  }
  if (!p) {
    return (
      <div style={{ padding: '2.5rem 1rem', textAlign: 'center' }}>
        <div style={{ color: 'var(--color-secondary)', fontWeight: 600 }}>Could not load this process.</div>
        <button type="button" className="btn btn-sm btn-link mt-2" onClick={onClose}>Close</button>
      </div>
    );
  }

  const tone = LIFECYCLE_TONE[lifecycleState];
  const matLevel = Math.min(5, Math.max(0, Number(p.maturity?.level || 0)));
  const matSpec = MATURITY_LABELS[matLevel || 1];
  const features = Array.isArray(p.features) ? p.features : [];
  const allRequirements: { key?: string; text: string }[] = features
    .flatMap((f: any) => Array.isArray(f.requirements) ? f.requirements : []);
  const visibleReqs = showAllReqs ? allRequirements : allRequirements.slice(0, 5);
  const description = (p.description || '').trim();
  const intro = buildIntro(p.name, description, lifecycleState);

  return (
    <div>
      {/* ─── Header ─── */}
      <div style={{
        display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between',
        gap: 14, marginBottom: '1.25rem',
      }}>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{
            fontSize: 10.5, textTransform: 'uppercase', letterSpacing: '0.12em',
            color: 'var(--color-text-light)', fontWeight: 600,
          }}>
            Business process
          </div>
          <h2 style={{
            fontSize: 22, fontWeight: 600, color: 'var(--color-primary)',
            margin: '6px 0 8px', letterSpacing: '-0.012em', lineHeight: 1.3,
          }}>
            {p.name}
          </h2>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', fontSize: 12.5 }}>
            <span style={{
              fontSize: 10.5, textTransform: 'uppercase', letterSpacing: '0.08em',
              color: tone.fg, background: tone.bg, padding: '3px 9px',
              borderRadius: 3, fontWeight: 600,
            }}>
              {lifecycleState}
            </span>
            <span style={{ color: 'var(--color-text-light)' }}>
              {p.total_requirements ? `${p.matched_requirements || 0} of ${p.total_requirements} requirements matched` : 'No requirements yet'}
            </span>
            {p.frontend_route && (
              <span style={{
                fontFamily: 'ui-monospace, monospace', fontSize: 11.5,
                color: 'var(--color-text-light)',
                background: 'var(--color-bg-alt)',
                padding: '2px 7px', borderRadius: 3,
              }}>
                {p.frontend_route}
              </span>
            )}
          </div>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          style={{
            background: 'transparent', border: 'none', padding: '0.25rem 0.5rem',
            fontSize: 20, color: 'var(--color-text-light)', cursor: 'pointer',
            lineHeight: 1, flexShrink: 0,
          }}
        >
          ×
        </button>
      </div>

      {/* ─── Authored intro paragraph ─── */}
      <p style={{
        fontSize: 14, color: 'var(--color-text)', lineHeight: 1.65,
        marginBottom: '1.5rem', maxWidth: 720,
      }}>
        {intro}
      </p>

      {/* ─── Live preview — only renders for Page BPs (frontend_route set) ─── */}
      {p.frontend_route && (
        <section style={{ marginBottom: '1.5rem' }}>
          <div style={{
            display: 'flex', alignItems: 'baseline', justifyContent: 'space-between',
            marginBottom: '0.65rem', gap: 12, flexWrap: 'wrap',
          }}>
            <div style={{
              fontSize: 10.5, textTransform: 'uppercase', letterSpacing: '0.1em',
              color: 'var(--color-text-light)', fontWeight: 600,
            }}>
              Live preview
            </div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <a
                href={p.frontend_route}
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  fontSize: 11.5, color: 'var(--color-primary-light)',
                  textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 4,
                }}
                onMouseEnter={(e) => { e.currentTarget.style.textDecoration = 'underline'; }}
                onMouseLeave={(e) => { e.currentTarget.style.textDecoration = 'none'; }}
              >
                <i className="bi bi-box-arrow-up-right" style={{ fontSize: 11 }}></i>
                Open <code style={{ background: 'var(--color-bg-alt)', padding: '0 5px', borderRadius: 3, fontSize: 11 }}>{p.frontend_route}</code>
              </a>
              <button
                type="button"
                onClick={() => handleCritique(p.frontend_route)}
                style={{
                  background: 'var(--color-primary)', color: 'white',
                  border: 'none', padding: '0.35rem 0.75rem', borderRadius: 4,
                  fontSize: 11.5, fontWeight: 500, cursor: 'pointer',
                  display: 'inline-flex', alignItems: 'center', gap: 5,
                }}
                title="Open this page in the Critique workspace to pin issues and compile a prompt"
              >
                <i className="bi bi-bullseye" style={{ fontSize: 11 }}></i>
                Critique this page
              </button>
            </div>
          </div>
          <div
            style={{
              position: 'relative',
              background: 'var(--color-bg-alt)',
              border: '1px solid var(--color-border)',
              borderRadius: 6,
              overflow: 'hidden',
              height: 420,
            }}
          >
            {!previewLoaded && (
              <div style={{
                position: 'absolute', inset: 0,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                color: 'var(--color-text-light)', fontSize: 12,
                pointerEvents: 'none',
              }}>
                <span className="spinner-border spinner-border-sm me-2" />
                Loading {p.frontend_route}…
              </div>
            )}
            <iframe
              src={p.frontend_route}
              title={`Preview of ${p.name}`}
              onLoad={() => setPreviewLoaded(true)}
              style={{
                width: '100%', height: '100%', border: 'none',
                background: 'white',
                opacity: previewLoaded ? 1 : 0,
                transition: 'opacity 220ms ease',
              }}
              sandbox="allow-same-origin allow-scripts allow-forms allow-popups"
            />
          </div>
          <div style={{
            fontSize: 11, color: 'var(--color-text-light)', marginTop: 6,
            fontStyle: 'italic',
          }}>
            Preview is the live production surface. Use "Critique this page" to pin issues, or "Generate upgrade prompt" below to draft a redesign brief.
          </div>
        </section>
      )}

      {/* ─── Where it stands (what's working / what's missing) ─── */}
      <section style={{ marginBottom: '1.5rem' }}>
        <div style={{
          fontSize: 10.5, textTransform: 'uppercase', letterSpacing: '0.1em',
          color: 'var(--color-text-light)', fontWeight: 600, marginBottom: '0.65rem',
        }}>
          Where it stands
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <StatColumn
            heading="In place"
            items={layerStanding.working}
            empty="Nothing is in place yet — this BP is awaiting its first build."
            tone="present"
          />
          <StatColumn
            heading="Still needed"
            items={layerStanding.missing}
            empty="Nothing flagged as missing — the layer set is complete."
            tone="missing"
          />
        </div>
      </section>

      {/* ─── Agents (2026-05-20) — name each linked agent + show its role
            from agent_roles_cache when populated. Trigger detection is a
            follow-up sprint. ─── */}
      <AgentsSection
        linkedAgents={(p as any).linked_agents || []}
        rolesCache={(p as any).agent_roles_cache || null}
      />

      {/* ─── Maturity progression strip ─── */}
      <section style={{ marginBottom: '1.5rem' }}>
        <div style={{
          fontSize: 10.5, textTransform: 'uppercase', letterSpacing: '0.1em',
          color: 'var(--color-text-light)', fontWeight: 600, marginBottom: '0.65rem',
        }}>
          Maturity
        </div>
        <div style={{
          display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap',
          padding: '0.85rem 1rem',
          background: 'var(--color-bg-alt)',
          borderRadius: 6,
        }}>
          <MaturityStrip current={matLevel} />
          <div style={{ flex: 1, minWidth: 220 }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-primary)' }}>
              {matLevel > 0 ? `L${matLevel} · ${matSpec.label}` : 'Not yet rated'}
            </div>
            <div style={{ fontSize: 12, color: 'var(--color-text-light)', marginTop: 2 }}>
              {matLevel > 0 ? matSpec.blurb : 'Maturity emerges as the BP gathers requirements and gains usable layers.'}
            </div>
          </div>
        </div>
      </section>

      {/* ─── Requirements ─── */}
      {allRequirements.length > 0 && (
        <section style={{ marginBottom: '1.5rem' }}>
          <div style={{
            display: 'flex', justifyContent: 'space-between', alignItems: 'baseline',
            marginBottom: '0.65rem',
          }}>
            <div style={{
              fontSize: 10.5, textTransform: 'uppercase', letterSpacing: '0.1em',
              color: 'var(--color-text-light)', fontWeight: 600,
            }}>
              Requirements ({allRequirements.length})
            </div>
            {allRequirements.length > 5 && (
              <button
                type="button"
                onClick={() => setShowAllReqs(s => !s)}
                style={{
                  background: 'transparent', border: 'none', padding: 0,
                  fontSize: 12, color: 'var(--color-primary-light)', cursor: 'pointer',
                }}
              >
                {showAllReqs ? `Show first 5` : `Show all ${allRequirements.length}`}
              </button>
            )}
          </div>
          <ul style={{ margin: 0, paddingLeft: 18, color: 'var(--color-text)', fontSize: 13 }}>
            {visibleReqs.map((r, i) => (
              <li key={(r.key || '') + i} style={{ marginBottom: 4, lineHeight: 1.5 }}>
                {r.key && (
                  <code style={{
                    background: 'var(--color-bg-alt)', padding: '0 5px',
                    borderRadius: 3, fontSize: 11, marginRight: 6, color: 'var(--color-text-light)',
                  }}>{r.key}</code>
                )}
                {r.text}
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* ─── Next steps ─── */}
      <section style={{
        marginBottom: '0.5rem', paddingTop: '1.25rem',
        borderTop: '1px solid var(--color-border)',
      }}>
        <div style={{
          fontSize: 10.5, textTransform: 'uppercase', letterSpacing: '0.1em',
          color: 'var(--color-text-light)', fontWeight: 600, marginBottom: '0.65rem',
        }}>
          Next steps
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 8 }}>
          {IMPROVEMENT_TARGETS.map(t => {
            const isPage = !!p.frontend_route;
            const label = isPage && t.pageLabel ? t.pageLabel : t.label;
            const help = isPage && t.pageHelp ? t.pageHelp : t.help;
            return (
              <button
                key={t.key}
                type="button"
                title={help}
                disabled={!!generating}
                onClick={() => handleGenerate(t.key)}
                style={{
                  background: 'white', color: 'var(--color-primary)',
                  border: '1px solid var(--color-border)',
                  padding: '0.45rem 0.85rem', borderRadius: 4,
                  fontSize: 12.5, fontWeight: 500, cursor: generating ? 'wait' : 'pointer',
                  opacity: generating && generating !== t.key ? 0.5 : 1,
                }}
                onMouseEnter={(e) => { if (!generating) e.currentTarget.style.borderColor = 'var(--color-primary-light)'; }}
                onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'var(--color-border)'; }}
              >
                {generating === t.key
                  ? <><span className="spinner-border spinner-border-sm me-1" style={{ width: 11, height: 11 }} /> Drafting…</>
                  : label}
              </button>
            );
          })}
        </div>
        <div style={{ fontSize: 11.5, color: 'var(--color-text-light)', fontStyle: 'italic' }}>
          Each button drafts a Claude Code prompt and copies it to the clipboard. Run the prompt externally; nothing executes from here.
        </div>
      </section>
    </div>
  );
};

// ──────────────────────────────────────────────────────────────────────────

const StatColumn: React.FC<{
  heading: string;
  items: string[];
  empty: string;
  tone: 'present' | 'missing';
}> = ({ heading, items, empty, tone }) => {
  const fg = tone === 'present' ? '#15803d' : 'var(--color-text-light)';
  return (
    <div style={{
      background: 'white', border: '1px solid var(--color-border)',
      borderRadius: 6, padding: '0.75rem 0.95rem',
    }}>
      <div style={{
        fontSize: 11, fontWeight: 600, color: fg, marginBottom: 6,
      }}>
        {heading}
      </div>
      {items.length === 0 ? (
        <div style={{ fontSize: 12, color: 'var(--color-text-light)', fontStyle: 'italic' }}>
          {empty}
        </div>
      ) : (
        <ul style={{ margin: 0, paddingLeft: 16, fontSize: 12.5, color: 'var(--color-text)' }}>
          {items.map((it, i) => (
            <li key={i} style={{ marginBottom: 3, lineHeight: 1.55 }}>{it}</li>
          ))}
        </ul>
      )}
    </div>
  );
};

const MaturityStrip: React.FC<{ current: number }> = ({ current }) => (
  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }} aria-label={`Maturity level ${current} of 5`}>
    {[1, 2, 3, 4, 5].map(level => {
      const filled = level <= current;
      return (
        <React.Fragment key={level}>
          <span
            aria-hidden="true"
            style={{
              width: 14, height: 14, borderRadius: '50%',
              background: filled ? 'var(--color-primary)' : 'white',
              border: `2px solid ${filled ? 'var(--color-primary)' : 'var(--color-border)'}`,
              transition: 'background 200ms ease',
            }}
          />
          {level < 5 && (
            <span
              aria-hidden="true"
              style={{
                width: 16, height: 2,
                background: filled && current > level
                  ? 'var(--color-primary)' : 'var(--color-border)',
              }}
            />
          )}
        </React.Fragment>
      );
    })}
  </div>
);

function buildIntro(name: string, description: string, state: LifecycleState): string {
  // Lead with the authored description when present; soften it with the
  // lifecycle framing. When no description, fall back to a state-aware
  // sentence that doesn't read like a stub.
  const lifecycleFraming: Record<LifecycleState, string> = {
    Foundational: `${name} is still being scaffolded — the structure is in place but the through-line is incomplete.`,
    Emerging:     `${name} is beginning to operate — the first end-to-end path runs but the surrounding edges are still informal.`,
    Coordinated:  `${name} runs across its core path and is starting to coordinate with neighbouring domains.`,
    Operational:  `${name} runs reliably end-to-end across documented paths.`,
    Scaling:      `${name} is expanding into new cases while staying inside its established envelope.`,
    Stabilizing:  `${name} is mature; current work is refinement rather than addition.`,
  };
  const intro = lifecycleFraming[state];
  if (!description) return intro;
  return `${description.trim()} ${intro}`;
}

/**
 * AgentsSection — names each agent linked to this BP. Source paths come
 * from cap.linked_agents (always present). Role classifications come from
 * cap.agent_roles_cache.roles when the Tier-3 backfill has been run for
 * this project; otherwise we just show the file name.
 */
const AgentsSection: React.FC<{
  linkedAgents: string[];
  rolesCache: { roles?: Array<{ file: string; role?: string; confidence?: number }> } | null;
}> = ({ linkedAgents, rolesCache }) => {
  if (!linkedAgents || linkedAgents.length === 0) return null;

  // Build path → role map from cache (defensive: cache may be null/empty).
  const roleByPath = new Map<string, { role?: string; confidence?: number }>();
  for (const r of rolesCache?.roles || []) {
    if (r.file) roleByPath.set(r.file, { role: r.role, confidence: r.confidence });
  }

  return (
    <section style={{ marginBottom: '1.5rem' }}>
      <div style={{
        fontSize: 10.5, textTransform: 'uppercase', letterSpacing: '0.1em',
        color: 'var(--color-text-light)', fontWeight: 600, marginBottom: '0.65rem',
      }}>
        Agents ({linkedAgents.length})
      </div>
      <div style={{
        padding: '0.85rem 1rem',
        background: 'var(--color-bg-alt)',
        border: '1px solid var(--color-border)',
        borderRadius: 6,
      }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {linkedAgents.map(filePath => {
            const fileName = (filePath.split('/').pop() || filePath).replace(/\.(ts|js|tsx|jsx|py)$/i, '');
            const dirPath = filePath.includes('/')
              ? filePath.slice(0, filePath.lastIndexOf('/'))
              : '';
            const meta = roleByPath.get(filePath);
            return (
              <div key={filePath} style={{
                display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap',
                fontSize: 12, color: 'var(--color-text)', lineHeight: 1.5,
              }}>
                <span style={{ fontWeight: 600, fontFamily: 'var(--font-mono)', color: 'var(--color-primary)' }}>
                  {fileName}
                </span>
                {meta?.role && (
                  <span style={{
                    fontSize: 10, fontWeight: 600, textTransform: 'uppercase',
                    letterSpacing: '0.04em',
                    color: '#15803d', background: '#dcfce7',
                    padding: '1px 6px', borderRadius: 3,
                  }}>
                    role: {meta.role}
                  </span>
                )}
                {dirPath && (
                  <span style={{
                    fontSize: 10, color: 'var(--color-text-light)',
                    fontFamily: 'var(--font-mono)',
                  }}>
                    {dirPath}/
                  </span>
                )}
              </div>
            );
          })}
        </div>
        {(!rolesCache || !rolesCache.roles || rolesCache.roles.length === 0) && (
          <div style={{
            fontSize: 11, color: 'var(--color-text-light)', fontStyle: 'italic',
            marginTop: 10, paddingTop: 8, borderTop: '1px dashed var(--color-border)',
          }}>
            Role classification not yet populated for this project. Run
            <code style={{ background: 'white', padding: '0 4px', borderRadius: 3, margin: '0 4px' }}>
              backfillAgentRolesCache.js
            </code>
            to enrich each agent with a derived role (response, classifier, scheduler, etc.).
            Trigger detection is a follow-up sprint.
          </div>
        )}
      </div>
    </section>
  );
};

export default BPDetailV2;
