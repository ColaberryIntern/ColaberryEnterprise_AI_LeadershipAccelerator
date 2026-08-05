/**
 * SkillDetailDrawer — CAPE Phase 5 (design doc §11 "AI Architecture Skills
 * radar" click-through, §16 Phase 5). Extends the Phase 0-1 radar rather than
 * replacing it: current placement/verified level, evidence history, next
 * recommended proof, "Practice this skill" / "Test out" actions. Same
 * scrim/panel/Escape-key/body-scroll-lock pattern as `CardDetailDrawer.tsx`.
 */
import React, { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  fetchSkillEvidenceHistory, fetchDiagnosticForSkill, submitDiagnosticForSkill,
  type SkillEvidenceHistory, type DiagnosticStartResult, type DiagnosticSubmitResult,
} from '../../../services/capeApi';

interface Props {
  skillId: string | null;
  skillName: string | null;
  /** Placement/verified for THIS skill, sourced from the already-fetched
   * `capeProfile` the caller (TodayShell) owns — no extra network call needed
   * for these two numbers, per the design doc's explicit steer. `evidence`/
   * `next_recommended_proof` still require their own fetch (this data isn't
   * part of the lightweight skill-profile response). */
  placement: number;
  verified: number;
  onClose: () => void;
}

const SkillDetailDrawer: React.FC<Props> = ({ skillId, skillName, placement, verified, onClose }) => {
  const [history, setHistory] = useState<SkillEvidenceHistory | null>(null);
  const [diagnostic, setDiagnostic] = useState<DiagnosticStartResult | null>(null);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [result, setResult] = useState<DiagnosticSubmitResult | null>(null);
  const [busy, setBusy] = useState(false);
  // Focus-return: capture whatever had focus (the triggering radar axis) the
  // moment the drawer opens, restore it the moment it closes — keyboard/
  // screen-reader users land back where they started, not at the top of the page.
  const triggerRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!skillId) { setHistory(null); setDiagnostic(null); setAnswers({}); setResult(null); return; }
    triggerRef.current = document.activeElement as HTMLElement | null;
    let alive = true;
    fetchSkillEvidenceHistory(skillId).then((h) => { if (alive) setHistory(h); }).catch(() => { if (alive) setHistory(null); });
    return () => {
      alive = false;
      triggerRef.current?.focus?.();
    };
  }, [skillId]);

  useEffect(() => {
    if (!skillId) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { window.removeEventListener('keydown', onKey); document.body.style.overflow = prevOverflow; };
  }, [skillId, onClose]);

  if (!skillId) return null;

  const startTestOut = async () => {
    if (busy) return;
    setBusy(true);
    setResult(null);
    setAnswers({});
    try { setDiagnostic(await fetchDiagnosticForSkill(skillId)); }
    catch { /* best-effort — the button simply stays clickable to retry */ }
    finally { setBusy(false); }
  };

  const submit = async () => {
    if (!diagnostic || busy) return;
    setBusy(true);
    try {
      const payload = diagnostic.items.map((it) => ({ item_id: it.id, selected_option: answers[it.id] }));
      setResult(await submitDiagnosticForSkill(skillId, diagnostic.attempt_id, payload, 'test_out'));
    } catch { /* best-effort — the form stays open so the learner can retry */ }
    finally { setBusy(false); }
  };

  const allAnswered = diagnostic ? diagnostic.items.every((it) => answers[it.id]) : false;

  return (
    <div className="tl-de" style={{ display: 'contents' }}>
      <div className="tld-scrim" onClick={onClose}>
        <aside className="tld-panel" role="dialog" aria-modal="true" aria-label={`${skillName || 'Skill'} details`} onClick={(e) => e.stopPropagation()}>
          <div style={{ padding: '20px 22px' }}>
            <div className="d-flex justify-content-between align-items-start mb-3">
              <h3 style={{ margin: 0 }}>{skillName || skillId}</h3>
              <button type="button" className="btn-close" aria-label="Close" onClick={onClose} />
            </div>

            <div className="d-flex gap-4 mb-3">
              <div><span className="tl-small">Placement</span><div style={{ fontSize: 20, fontWeight: 700 }}>{Math.round(placement)}%</div></div>
              <div><span className="tl-small">Verified</span><div style={{ fontSize: 20, fontWeight: 700 }}>{Math.round(verified)}%</div></div>
            </div>

            {history && (
              <>
                <h4 style={{ fontSize: 13, textTransform: 'uppercase', letterSpacing: '.04em', opacity: 0.7 }}>Evidence history</h4>
                {history.evidence.length === 0 ? (
                  <p className="tl-small">Nothing verified here yet — completing cards for this skill will show up below.</p>
                ) : (
                  <ul style={{ paddingLeft: 18 }}>
                    {history.evidence.slice(0, 10).map((row, i) => (
                      <li key={i} className="tl-small">{row.band} · +{row.credit} · {row.source} · {new Date(row.created_at).toLocaleDateString()}</li>
                    ))}
                  </ul>
                )}

                {history.next_recommended_proof && (
                  <p className="tl-small" style={{ marginTop: 8 }}><strong>Next up:</strong> {history.next_recommended_proof}</p>
                )}
              </>
            )}

            <div className="d-flex gap-2 mt-3">
              <Link className="btn btn-outline-primary btn-sm" to="/portal/path" onClick={onClose}>Practice this skill</Link>
              {!diagnostic && (
                <button type="button" className="btn btn-primary btn-sm" disabled={busy} onClick={() => void startTestOut()}>
                  {busy ? '…' : 'Test out'}
                </button>
              )}
            </div>

            {diagnostic && !result && (
              <div className="mt-3">
                {diagnostic.items.map((it) => (
                  <div key={it.id} className="mb-2">
                    <div className="tl-small" style={{ fontWeight: 600 }}>{it.prompt}</div>
                    {it.options.map((opt) => (
                      <label key={opt.id} className="d-block tl-small" style={{ marginLeft: 8 }}>
                        <input
                          type="radio"
                          name={it.id}
                          value={opt.id}
                          checked={answers[it.id] === opt.id}
                          onChange={() => setAnswers((prev) => ({ ...prev, [it.id]: opt.id }))}
                        /> {opt.label}
                      </label>
                    ))}
                  </div>
                ))}
                <button type="button" className="btn btn-primary btn-sm" disabled={!allAnswered || busy} onClick={() => void submit()}>
                  {busy ? '…' : 'Submit'}
                </button>
              </div>
            )}

            {result && (
              <p className="tl-small mt-3" role="status">
                {result.outcome === 'confirmed' && 'Confirmed — your placement for this skill has advanced.'}
                {result.outcome === 'partial' && 'Partially confirmed — a short bridge lesson will help close the gap.'}
                {result.outcome === 'not_confirmed' && "Not confirmed yet — we'll start this skill from the foundations."}
              </p>
            )}
          </div>
        </aside>
      </div>
    </div>
  );
};

export default SkillDetailDrawer;
