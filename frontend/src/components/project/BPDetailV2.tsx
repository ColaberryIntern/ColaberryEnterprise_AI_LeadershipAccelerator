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
import { lifecycleStateFor, type LifecycleState, type BPLike } from '../../utils/bpDomainClassifier';
import { educationalQuestionsFor, type EducationalQuestion } from '../../utils/bpEducationalQuestions';
import { walkthroughStepsFor, type WalkthroughStep } from '../../utils/bpStepWalkthrough';
import { useCoryAsk } from '../../hooks/useCoryAsk';
import { useCoryAvailable } from '../../hooks/useCoryAvailable';
import SuggestedAgents from './SuggestedAgents';

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

// Improvement-target definitions live in `frontend/src/utils/bpStepWalkthrough.ts`
// now. The walkthrough util produces the prose + step keys; `handleGenerate`
// below dispatches on the same `key` values the legacy array used.

function toast(msg: string) {
  const el = document.createElement('div');
  el.innerHTML = `<div style="position:fixed;top:20px;left:50%;transform:translateX(-50%);z-index:99999;background:#1a365d;color:#fff;padding:11px 18px;border-radius:8px;box-shadow:0 4px 20px rgba(0,0,0,0.2);font-size:13px"><i class="bi bi-clipboard-check me-2"></i>${msg}</div>`;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 2800);
}

const BPDetailV2: React.FC<Props> = ({ processId, onClose, onUpdate }) => {
  const navigate = useNavigate();
  const askCory = useCoryAsk();
  // Cory deeplink surfaces (chip strip + per-step "Ask Cory" link) only
  // render for operators who can actually reach the widget. Without this
  // gate, non-authorized operators see chips/links that silently no-op
  // because GlobalCoryWidget early-returns null for them.
  const coryAvailable = useCoryAvailable();
  // Asking Cory must also close THIS modal. The BP modal renders at
  // z-index 99990 (SystemViewV2) while the Cory chat panel opens at 10001 —
  // so without closing the modal, Cory expands silently *behind* it and the
  // click looks dead. Dispatch the deeplink first (synchronous window event,
  // received before this component unmounts), then close.
  const askCoryAndClose = (query: string, source: string) => {
    askCory(query, source);
    onClose();
  };
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
    // 2026-05-21: pre-fill the visual workspace's session picker via URL
    // params, matching the dlBp/dlRoute deep-link contract that
    // VisualWorkspacePage already reads. The old sessionStorage writes
    // (critique:autoOpenRoute, critique:autoOpenBpId) were dead code —
    // nothing on the workspace side consumed them, so clicking
    // "Critique this page" landed the operator on a blank "/" picker
    // with no cap context.
    onClose();
    const qs = new URLSearchParams({ bp: processId, route }).toString();
    navigate(`/portal/visual-workspace?${qs}`);
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

  // 2026-05-21: Education + walkthrough — both pure derivations from cap
  // shape. Recomputed only when `p` changes, never on every render. The
  // educational chip strip renders between Agents and Maturity; the
  // walkthrough cards replace the legacy 3-button Next-steps row.
  const educationalQuestions: EducationalQuestion[] = educationalQuestionsFor(p as BPLike);
  const walkthroughSteps: WalkthroughStep[] = walkthroughStepsFor(p as BPLike);
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

      {/* ─── Agents (2026-05-20) — surfaces LLM agent-attribution
            classification per cap. Each agent shows decision +
            confidence + reasoning + one-click confirm/reject override.
            Reads agent_roles_cache.classifications[] populated by
            agentAttributionClassifier. ─── */}
      <AgentsSection
        capId={p.id}
        linkedAgents={(p as any).linked_agents || []}
        rolesCache={(p as any).agent_roles_cache || null}
        onReload={onUpdate}
      />

      {/* ─── Suggested Agents (Plan C, 2026-05-26) — inline import-graph
            suggestions for this BP. Renders nothing when there are no
            suggestions. One-click Attach writes to capability_agent_maps
            and triggers onUpdate so the agent shows in the Confirmed list
            above. ─── */}
      <SuggestedAgents capId={p.id} onUpdate={onUpdate} />

      {/* ─── Learn about this BP — Cory deeplink chips ───
            Gated on coryAvailable: chips fire `cory:ask` events, but the
            widget is hidden for non-authorized operators, so rendering
            them there would create silent dead UI. ─── */}
      {coryAvailable && educationalQuestions.length > 0 && (
        <section style={{ marginBottom: '1.5rem' }}>
          <div style={{
            fontSize: 10.5, textTransform: 'uppercase', letterSpacing: '0.1em',
            color: 'var(--color-text-light)', fontWeight: 700, marginBottom: '0.5rem',
            paddingLeft: 8, borderLeft: '3px solid var(--color-primary-light)',
            lineHeight: 1.4,
          }}>
            Learn about this BP
          </div>
          <div style={{
            background: 'rgba(59,130,246,0.06)',
            border: '1px solid rgba(59,130,246,0.18)',
            borderRadius: 6,
            padding: '0.65rem 0.85rem',
          }}>
            <div style={{
              fontSize: 11, color: 'var(--color-text-light)',
              fontStyle: 'italic', marginBottom: '0.5rem',
            }}>
              Click any question to ask Cory — opens the assistant with the
              question prefilled and sent.
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {educationalQuestions.map(q => (
                <button
                  key={q.id}
                  type="button"
                  onClick={() => askCoryAndClose(q.text, `bp-detail:${q.source}`)}
                  title={`Ask Cory: ${q.text}`}
                  style={{
                    display: 'inline-flex', alignItems: 'center', gap: 5,
                    padding: '5px 11px',
                    background: 'white',
                    border: '1px solid rgba(59,130,246,0.30)',
                    borderRadius: 999,
                    color: 'var(--color-primary)',
                    fontSize: 12, fontWeight: 500,
                    cursor: 'pointer', lineHeight: 1.35,
                    textAlign: 'left',
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(59,130,246,0.10)'; }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = 'white'; }}
                >
                  <span aria-hidden="true" style={{ fontSize: 11, opacity: 0.8 }}>{q.glyph}</span>
                  <span>{q.text}</span>
                </button>
              ))}
            </div>
          </div>
        </section>
      )}

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

      {/* ─── Next-step walkthrough ─── */}
      <section style={{
        marginBottom: '0.5rem', paddingTop: '1.25rem',
        borderTop: '2px solid var(--color-border)',
      }}>
        <div style={{
          fontSize: 10.5, textTransform: 'uppercase', letterSpacing: '0.1em',
          color: 'var(--color-text-light)', fontWeight: 700, marginBottom: '0.4rem',
          paddingLeft: 8, borderLeft: '3px solid var(--color-primary-light)',
          lineHeight: 1.4,
        }}>
          Next-step walkthrough
        </div>
        <div style={{ fontSize: 11.5, color: 'var(--color-text-light)', fontStyle: 'italic', marginBottom: '0.85rem' }}>
          {walkthroughSteps.length} concrete next move{walkthroughSteps.length === 1 ? '' : 's'} for this BP.
          Each step drafts a Claude Code prompt and copies it to the clipboard.
          Nothing executes from here.
        </div>
        {walkthroughSteps.map((step, idx) => (
          <div
            key={step.key}
            style={{
              background: '#fafafa', border: '1px solid var(--color-border)',
              borderLeft: '3px solid var(--color-primary-light)',
              borderRadius: 6, padding: '0.85rem 1rem',
              marginBottom: '0.65rem',
            }}
          >
            <div style={{
              fontSize: 13.5, fontWeight: 700, color: 'var(--color-primary)',
              marginBottom: '0.4rem',
            }}>
              {idx + 1} · {step.title}
            </div>
            <div style={{ fontSize: 12.5, color: 'var(--color-text)', lineHeight: 1.55, marginBottom: '0.35rem' }}>
              <span style={{
                fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.08em',
                fontWeight: 700, color: 'var(--color-text-light)', marginRight: 5,
              }}>
                What this does:
              </span>
              {step.whatItDoes}
            </div>
            <div style={{ fontSize: 12.5, color: 'var(--color-text)', lineHeight: 1.55, marginBottom: '0.6rem' }}>
              <span style={{
                fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.08em',
                fontWeight: 700, color: 'var(--color-text-light)', marginRight: 5,
              }}>
                Why it matters for this BP:
              </span>
              {step.whyItMatters}
            </div>
            <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
              <button
                type="button"
                disabled={!!generating}
                onClick={() => handleGenerate(step.key)}
                style={{
                  background: 'var(--color-primary)', color: 'white',
                  border: 'none', padding: '0.4rem 0.85rem', borderRadius: 4,
                  fontSize: 12, fontWeight: 600, cursor: generating ? 'wait' : 'pointer',
                  opacity: generating && generating !== step.key ? 0.5 : 1,
                  minHeight: 30,
                }}
              >
                {generating === step.key
                  ? <><span className="spinner-border spinner-border-sm me-1" style={{ width: 11, height: 11 }} /> Drafting…</>
                  : step.ctaLabel}
              </button>
              {coryAvailable && (
                <button
                  type="button"
                  onClick={() => askCoryAndClose(step.askPrefill, `bp-detail:step:${step.key}`)}
                  style={{
                    background: 'transparent', border: 'none',
                    color: 'var(--color-primary-light)', cursor: 'pointer',
                    fontSize: 11.5, fontWeight: 500, padding: '2px 0',
                    display: 'inline-flex', alignItems: 'center', gap: 4,
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.textDecoration = 'underline'; }}
                  onMouseLeave={(e) => { e.currentTarget.style.textDecoration = 'none'; }}
                  title="Open Cory with a question about this step prefilled"
                >
                  💬 Ask Cory about this step →
                </button>
              )}
            </div>
          </div>
        ))}
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
 * AgentsSection — surfaces LLM-classified agent attribution per cap.
 *
 * 2026-05-20: rewired to read from agent_roles_cache.classifications[]
 * (populated by agentAttributionClassifier). Three groups:
 *   • Confirmed (decision='confirmed' OR operator confirmed) — green
 *   • Uncertain (decision='uncertain' AND no override) — amber
 *   • Rejected (decision='rejected' OR operator rejected) — gray, collapsed
 *
 * Each row shows confidence + role + one-line reasoning + per-row
 * confirm/reject buttons that hit the override endpoint.
 */
interface AgentClassification {
  agent_path: string;
  confidence: number;
  role: string;
  reasoning: string;
  decision: 'confirmed' | 'uncertain' | 'rejected';
  operator_override?: 'confirm' | 'reject' | null;
}

const AgentsSection: React.FC<{
  capId: string;
  linkedAgents: string[];
  rolesCache: { classifications?: AgentClassification[]; classified_at?: string } | null;
  onReload: () => void;
}> = ({ capId, linkedAgents, rolesCache, onReload }) => {
  const classifications = rolesCache?.classifications || [];

  // If the classifier hasn't run yet for this cap, fall back to the raw
  // file list so the operator at least sees what brownfield discovered.
  if (classifications.length === 0 && linkedAgents.length === 0) return null;
  if (classifications.length === 0) {
    return (
      <section style={{ marginBottom: '1.5rem' }}>
        <div style={{ fontSize: 10.5, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--color-text-light)', fontWeight: 600, marginBottom: '0.65rem' }}>
          Agents (unclassified)
        </div>
        <div style={{ padding: '0.85rem 1rem', background: 'var(--color-bg-alt)', border: '1px solid var(--color-border)', borderRadius: 6 }}>
          <div style={{ fontSize: 11.5, color: 'var(--color-text-light)', fontStyle: 'italic', marginBottom: 8 }}>
            Brownfield discovery attached {linkedAgents.length} candidate agent file(s) by keyword match.
            They have not yet been validated by the LLM classifier.
          </div>
          {linkedAgents.map(p => (
            <div key={p} style={{ fontSize: 11.5, fontFamily: 'var(--font-mono)', color: 'var(--color-text-light)' }}>
              · {p}
            </div>
          ))}
        </div>
      </section>
    );
  }

  // Effective decision: operator override always wins.
  const effective = (c: AgentClassification) =>
    c.operator_override === 'confirm' ? 'confirmed'
    : c.operator_override === 'reject' ? 'rejected'
    : c.decision;
  const confirmed = classifications.filter(c => effective(c) === 'confirmed');
  const uncertain = classifications.filter(c => effective(c) === 'uncertain');
  const rejected = classifications.filter(c => effective(c) === 'rejected');

  return (
    <section style={{ marginBottom: '1.5rem' }}>
      <div style={{ fontSize: 10.5, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--color-text-light)', fontWeight: 600, marginBottom: '0.65rem' }}>
        Agents — {confirmed.length} confirmed · {uncertain.length} uncertain · {rejected.length} rejected
      </div>
      <div style={{ padding: '0.85rem 1rem', background: 'var(--color-bg-alt)', border: '1px solid var(--color-border)', borderRadius: 6 }}>
        {confirmed.length === 0 && uncertain.length === 0 && (
          <div style={{ fontSize: 12, color: 'var(--color-text-light)', fontStyle: 'italic' }}>
            No agents serve this cap. (LLM rejected {rejected.length} keyword-attributed candidate{rejected.length === 1 ? '' : 's'}.)
          </div>
        )}
        {confirmed.map(c => (
          <AgentRow key={c.agent_path + '-c'} cap={capId} c={c} tone="confirmed" onReload={onReload} />
        ))}
        {uncertain.map(c => (
          <AgentRow key={c.agent_path + '-u'} cap={capId} c={c} tone="uncertain" onReload={onReload} />
        ))}
        {rejected.length > 0 && (
          <details style={{ marginTop: 10 }}>
            <summary style={{ fontSize: 11, color: 'var(--color-text-light)', cursor: 'pointer' }}>
              Show {rejected.length} rejected candidate{rejected.length === 1 ? '' : 's'} (keyword false positives)
            </summary>
            <div style={{ marginTop: 8 }}>
              {rejected.map(c => (
                <AgentRow key={c.agent_path + '-r'} cap={capId} c={c} tone="rejected" onReload={onReload} />
              ))}
            </div>
          </details>
        )}
      </div>
    </section>
  );
};

const TONE_STYLES = {
  confirmed: { bg: '#dcfce7', border: '#bbf7d0', fg: '#15803d', label: 'CONFIRMED' },
  uncertain: { bg: '#fef3c7', border: '#fde68a', fg: '#b45309', label: 'UNCERTAIN' },
  rejected:  { bg: '#f3f4f6', border: '#e5e7eb', fg: '#6b7280', label: 'REJECTED' },
} as const;

const AgentRow: React.FC<{
  cap: string;
  c: AgentClassification;
  tone: 'confirmed' | 'uncertain' | 'rejected';
  onReload: () => void;
}> = ({ cap, c, tone, onReload }) => {
  const [saving, setSaving] = React.useState<'confirm' | 'reject' | null>(null);
  const fileName = (c.agent_path.split('/').pop() || c.agent_path).replace(/\.(ts|tsx|js|jsx|py)$/i, '');
  const dirPath = c.agent_path.includes('/') ? c.agent_path.slice(0, c.agent_path.lastIndexOf('/')) : '';
  const style = TONE_STYLES[tone];

  const override = async (decision: 'confirm' | 'reject') => {
    setSaving(decision);
    try {
      // Lazy import to avoid pulling axios into this file when not needed
      const { default: portalApi } = await import('../../utils/portalApi');
      await portalApi.patch(
        `/api/portal/project/capabilities/${encodeURIComponent(cap)}/agents/${encodeURIComponent(fileName)}/override`,
        { decision },
      );
      onReload();
    } catch (err) {
      // eslint-disable-next-line no-alert
      alert('Failed to update — try again');
    } finally {
      setSaving(null);
    }
  };

  return (
    <div style={{
      padding: '8px 10px',
      background: 'white',
      border: `1px solid ${style.border}`,
      borderLeft: `3px solid ${style.fg}`,
      borderRadius: 4,
      marginBottom: 6,
      fontSize: 12,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <span style={{ fontWeight: 600, fontFamily: 'var(--font-mono)', color: 'var(--color-primary)' }}>
          {fileName}
        </span>
        <span style={{ fontSize: 9.5, fontWeight: 700, color: style.fg, background: style.bg, padding: '1px 5px', borderRadius: 3, letterSpacing: '0.04em' }}>
          {style.label}
        </span>
        <span style={{ fontSize: 10, color: 'var(--color-text-light)' }}>
          conf {(c.confidence * 100).toFixed(0)}%
        </span>
        {c.role && (
          <span style={{ fontSize: 10, color: 'var(--color-text-light)' }}>
            role: {c.role}
          </span>
        )}
        {c.operator_override && (
          <span style={{ fontSize: 9.5, fontWeight: 700, color: '#1d4ed8', background: 'rgba(37,99,235,0.10)', padding: '1px 5px', borderRadius: 3, letterSpacing: '0.04em' }}>
            OPERATOR {c.operator_override.toUpperCase()}
          </span>
        )}
      </div>
      {dirPath && (
        <div style={{ fontSize: 10, color: 'var(--color-text-light)', fontFamily: 'var(--font-mono)', marginTop: 3 }}>
          {dirPath}/
        </div>
      )}
      {c.reasoning && (
        <div style={{ fontSize: 11.5, color: 'var(--color-text)', marginTop: 5, fontStyle: 'italic', lineHeight: 1.4 }}>
          {c.reasoning}
        </div>
      )}
      <div style={{ marginTop: 6, display: 'flex', gap: 6 }}>
        {tone !== 'confirmed' && (
          <button type="button" disabled={saving !== null} onClick={() => override('confirm')}
            className="btn btn-sm btn-outline-success" style={{ fontSize: 10, padding: '2px 8px' }}>
            {saving === 'confirm' ? 'Saving…' : 'Confirm'}
          </button>
        )}
        {tone !== 'rejected' && (
          <button type="button" disabled={saving !== null} onClick={() => override('reject')}
            className="btn btn-sm btn-outline-secondary" style={{ fontSize: 10, padding: '2px 8px' }}>
            {saving === 'reject' ? 'Saving…' : 'Reject'}
          </button>
        )}
      </div>
    </div>
  );
};

export default BPDetailV2;
