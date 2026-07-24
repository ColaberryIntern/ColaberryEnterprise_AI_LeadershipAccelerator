import React, { useEffect, useState } from 'react';
import api from '../../utils/api';

/**
 * KitConfigModal — the instructor's "control panel" for one session's Class
 * Kit: how many story beats show (and their content), whether Live Decision
 * Theater is on, whether Build Bay shows its extra rows, and which sources
 * back the readiness report's evidence ledger. Opens from Present ▾ →
 * Customize. Saving takes effect the next time the deck/outline/readiness is
 * opened — there is no separate "rebuild" step, the spec is built fresh
 * every time it renders.
 */

const SEGMENT_OPTIONS: { group: string; options: { value: string; label: string }[] }[] = [
  {
    group: 'Orientation', options: [
      { value: 'welcome', label: 'Welcome' },
      { value: 'big-picture', label: 'Big picture (Ali)' },
      { value: 'platform', label: 'Platform (Taiwo)' },
      { value: 'setup', label: 'Setup (Swati)' },
    ],
  },
  {
    group: 'Architecture Day (Monday)', options: [
      { value: 'cold-open', label: 'Cold open' },
      { value: 'checkin', label: 'Check-in / prediction' },
      { value: 'business-problem', label: 'Business problem' },
      { value: 'architecture', label: 'Architecture' },
      { value: 'deconstruct', label: 'Deconstruct example' },
      { value: 'micro-build', label: 'Micro-build' },
      { value: 'challenge', label: 'Architecture challenge' },
      { value: 'trivia', label: 'Knowledge check' },
      { value: 'trailer', label: 'Thursday trailer' },
    ],
  },
  {
    group: 'Build Day (Thursday)', options: [
      { value: 'result-preview', label: 'Result preview' },
      { value: 'readiness', label: 'Readiness check' },
      { value: 'build-map', label: 'Build map' },
      { value: 'guided-build', label: 'Guided build' },
      { value: 'failure', label: 'Failure injection' },
      { value: 'demos', label: 'Student demos' },
      { value: 'broadcast', label: 'Builder Broadcast' },
      { value: 'cta', label: 'Prove it / assignment' },
    ],
  },
];

const TONES = ['cherry', 'berry', 'amber', 'leaf', 'violet'] as const;
const SOURCE_TYPES = ['official-doc', 'research', 'company-report', 'interview', 'internal-verified', 'secondary-reporting'] as const;

interface StoryBeatOverride {
  segment: string; icon: string; eyebrow: string; title: string; body: string; punch: string; tone: typeof TONES[number];
}
interface EvidenceOverride {
  claim: string; publisher: string; sourceTitle: string; publicationDate: string; sourceType: string; note: string;
}
interface KitConfig {
  storyBeats: { enabled: boolean; max: number | null; overrides: StoryBeatOverride[] | null };
  theaterEnabled: boolean;
  buildBayDetail: boolean;
  evidenceOverrides: EvidenceOverride[] | null;
}

const blankBeat = (): StoryBeatOverride => ({ segment: 'business-problem', icon: '💡', eyebrow: '', title: '', body: '', punch: '', tone: 'berry' });
const blankEvidence = (): EvidenceOverride => ({ claim: '', publisher: '', sourceTitle: '', publicationDate: '', sourceType: 'research', note: '' });

interface Props {
  sessionId: string;
  sessionTitle: string;
  onClose: () => void;
  showToast: (msg: string, kind?: 'success' | 'error') => void;
}

const KitConfigModal: React.FC<Props> = ({ sessionId, sessionTitle, onClose, showToast }) => {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [config, setConfig] = useState<KitConfig | null>(null);

  useEffect(() => {
    let alive = true;
    api.get(`/api/admin/accelerator/sessions/${sessionId}/kit-config`)
      .then((res) => { if (alive) setConfig(res.data.config); })
      .catch(() => { if (alive) showToast('Could not load the current configuration — showing defaults', 'error'); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [sessionId, showToast]);

  const save = async () => {
    if (!config) return;
    setSaving(true);
    try {
      await api.put(`/api/admin/accelerator/sessions/${sessionId}/kit-config`, { config });
      showToast('Saved — the deck, outline, and readiness report will use this next time you open them', 'success');
      onClose();
    } catch { showToast('Failed to save', 'error'); }
    finally { setSaving(false); }
  };

  if (loading || !config) {
    return (
      <>
        <div className="modal-backdrop show" />
        <div className="modal show d-block" role="dialog" aria-modal="true">
          <div className="modal-dialog"><div className="modal-content p-4 text-center text-muted">Loading configuration…</div></div>
        </div>
      </>
    );
  }

  const beats = config.storyBeats.overrides ?? [];
  const evidence = config.evidenceOverrides ?? [];

  return (
    <>
      <div className="modal-backdrop show" />
      <div className="modal show d-block" role="dialog" aria-modal="true">
        <div className="modal-dialog modal-lg modal-dialog-scrollable">
          <div className="modal-content">
            <div className="modal-header">
              <h5 className="modal-title">⚙️ Customize — {sessionTitle}</h5>
              <button type="button" className="btn-close" onClick={onClose} />
            </div>
            <div className="modal-body">
              <p className="text-muted small">
                Controls how this session's deck, outline, and readiness report build. Defaults match what's already
                authored — turn things off, cap counts, or write your own examples and sources below. Saves apply the
                next time you open the deck (nothing to "rebuild" separately).
              </p>

              <h6 className="mt-3">Slide types</h6>
              <div className="form-check form-switch mb-2">
                <input className="form-check-input" type="checkbox" id="cfg-story-on" checked={config.storyBeats.enabled}
                  onChange={(e) => setConfig({ ...config, storyBeats: { ...config.storyBeats, enabled: e.target.checked } })} />
                <label className="form-check-label" htmlFor="cfg-story-on">Story Beats ("change of pace" examples/metaphors)</label>
              </div>
              {config.storyBeats.enabled && (
                <div className="mb-2 ms-4">
                  <label className="form-label small fw-medium">Max story beats in this deck</label>
                  <input type="number" min={0} className="form-control form-control-sm" style={{ maxWidth: 140 }}
                    value={config.storyBeats.max ?? ''} placeholder="No cap"
                    onChange={(e) => setConfig({ ...config, storyBeats: { ...config.storyBeats, max: e.target.value === '' ? null : Math.max(0, parseInt(e.target.value, 10) || 0) } })} />
                </div>
              )}
              <div className="form-check form-switch mb-2">
                <input className="form-check-input" type="checkbox" id="cfg-theater-on" checked={config.theaterEnabled}
                  onChange={(e) => setConfig({ ...config, theaterEnabled: e.target.checked })} />
                <label className="form-check-label" htmlFor="cfg-theater-on">Live Decision Theater (full-screen poll moments)</label>
              </div>
              <div className="form-check form-switch mb-3">
                <input className="form-check-input" type="checkbox" id="cfg-buildbay-on" checked={config.buildBayDetail}
                  onChange={(e) => setConfig({ ...config, buildBayDetail: e.target.checked })} />
                <label className="form-check-label" htmlFor="cfg-buildbay-on">Build Bay detail rows ("you should see" / "stop when")</label>
              </div>

              <hr />
              <div className="d-flex justify-content-between align-items-center">
                <h6 className="mb-0">Story Beat content</h6>
                <div className="form-check form-switch mb-0">
                  <input className="form-check-input" type="checkbox" id="cfg-story-custom"
                    checked={config.storyBeats.overrides != null}
                    onChange={(e) => setConfig({ ...config, storyBeats: { ...config.storyBeats, overrides: e.target.checked ? [blankBeat()] : null } })} />
                  <label className="form-check-label small" htmlFor="cfg-story-custom">Use my own instead of the authored defaults</label>
                </div>
              </div>
              {config.storyBeats.overrides == null ? (
                <p className="text-muted small mt-2">Using the authored default story beats for this class.</p>
              ) : (
                <div className="mt-2">
                  {beats.map((b, i) => (
                    <div key={i} className="border rounded p-2 mb-2">
                      <div className="row g-2 mb-2">
                        <div className="col-3">
                          <label className="form-label small">Icon</label>
                          <input className="form-control form-control-sm" value={b.icon} onChange={(e) => updateBeat(i, { icon: e.target.value })} />
                        </div>
                        <div className="col-5">
                          <label className="form-label small">Segment</label>
                          <select className="form-select form-select-sm" value={b.segment} onChange={(e) => updateBeat(i, { segment: e.target.value })}>
                            {SEGMENT_OPTIONS.map((g) => (
                              <optgroup key={g.group} label={g.group}>
                                {g.options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                              </optgroup>
                            ))}
                          </select>
                        </div>
                        <div className="col-4">
                          <label className="form-label small">Tone</label>
                          <select className="form-select form-select-sm" value={b.tone} onChange={(e) => updateBeat(i, { tone: e.target.value as StoryBeatOverride['tone'] })}>
                            {TONES.map((t) => <option key={t} value={t}>{t}</option>)}
                          </select>
                        </div>
                      </div>
                      <label className="form-label small">Eyebrow</label>
                      <input className="form-control form-control-sm mb-2" value={b.eyebrow} onChange={(e) => updateBeat(i, { eyebrow: e.target.value })} placeholder="Change of pace — …" />
                      <label className="form-label small">Title</label>
                      <input className="form-control form-control-sm mb-2" value={b.title} onChange={(e) => updateBeat(i, { title: e.target.value })} />
                      <label className="form-label small">Story (body)</label>
                      <textarea className="form-control form-control-sm mb-2" rows={3} value={b.body} onChange={(e) => updateBeat(i, { body: e.target.value })} />
                      <label className="form-label small">Punch line (optional)</label>
                      <input className="form-control form-control-sm mb-2" value={b.punch} onChange={(e) => updateBeat(i, { punch: e.target.value })} />
                      <button className="btn btn-outline-danger btn-sm" onClick={() => removeBeat(i)}>Remove</button>
                    </div>
                  ))}
                  <button className="btn btn-outline-secondary btn-sm" onClick={addBeat}>+ Add story beat</button>
                </div>
              )}

              <hr />
              <div className="d-flex justify-content-between align-items-center">
                <h6 className="mb-0">Readiness report sources</h6>
                <div className="form-check form-switch mb-0">
                  <input className="form-check-input" type="checkbox" id="cfg-evidence-custom"
                    checked={config.evidenceOverrides != null}
                    onChange={(e) => setConfig({ ...config, evidenceOverrides: e.target.checked ? [blankEvidence()] : null })} />
                  <label className="form-check-label small" htmlFor="cfg-evidence-custom">Use my own instead of the authored defaults</label>
                </div>
              </div>
              {config.evidenceOverrides == null ? (
                <p className="text-muted small mt-2">Using the authored default sources (aggregated from this class's teaching content).</p>
              ) : (
                <div className="mt-2">
                  {evidence.map((e, i) => (
                    <div key={i} className="border rounded p-2 mb-2">
                      <label className="form-label small">Claim / quote</label>
                      <textarea className="form-control form-control-sm mb-2" rows={2} value={e.claim} onChange={(ev) => updateEvidence(i, { claim: ev.target.value })} />
                      <div className="row g-2 mb-2">
                        <div className="col-6">
                          <label className="form-label small">Publisher</label>
                          <input className="form-control form-control-sm" value={e.publisher} onChange={(ev) => updateEvidence(i, { publisher: ev.target.value })} />
                        </div>
                        <div className="col-6">
                          <label className="form-label small">Source title</label>
                          <input className="form-control form-control-sm" value={e.sourceTitle} onChange={(ev) => updateEvidence(i, { sourceTitle: ev.target.value })} />
                        </div>
                      </div>
                      <div className="row g-2 mb-2">
                        <div className="col-4">
                          <label className="form-label small">Date</label>
                          <input className="form-control form-control-sm" value={e.publicationDate} onChange={(ev) => updateEvidence(i, { publicationDate: ev.target.value })} placeholder="2026" />
                        </div>
                        <div className="col-8">
                          <label className="form-label small">Type</label>
                          <select className="form-select form-select-sm" value={e.sourceType} onChange={(ev) => updateEvidence(i, { sourceType: ev.target.value })}>
                            {SOURCE_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                          </select>
                        </div>
                      </div>
                      <label className="form-label small">Note (optional — e.g. "projection", "reported paraphrase")</label>
                      <input className="form-control form-control-sm mb-2" value={e.note} onChange={(ev) => updateEvidence(i, { note: ev.target.value })} />
                      <button className="btn btn-outline-danger btn-sm" onClick={() => removeEvidence(i)}>Remove</button>
                    </div>
                  ))}
                  <button className="btn btn-outline-secondary btn-sm" onClick={addEvidence}>+ Add source</button>
                </div>
              )}
            </div>
            <div className="modal-footer">
              <button className="btn btn-outline-secondary btn-sm" onClick={onClose}>Cancel</button>
              <button className="btn btn-primary btn-sm" onClick={save} disabled={saving}>{saving ? 'Saving…' : 'Save'}</button>
            </div>
          </div>
        </div>
      </div>
    </>
  );

  function updateBeat(i: number, patch: Partial<StoryBeatOverride>) {
    if (!config) return;
    const next = beats.map((b, idx) => (idx === i ? { ...b, ...patch } : b));
    setConfig({ ...config, storyBeats: { ...config.storyBeats, overrides: next } });
  }
  function addBeat() {
    if (!config) return;
    setConfig({ ...config, storyBeats: { ...config.storyBeats, overrides: [...beats, blankBeat()] } });
  }
  function removeBeat(i: number) {
    if (!config) return;
    setConfig({ ...config, storyBeats: { ...config.storyBeats, overrides: beats.filter((_, idx) => idx !== i) } });
  }
  function updateEvidence(i: number, patch: Partial<EvidenceOverride>) {
    if (!config) return;
    const next = evidence.map((e, idx) => (idx === i ? { ...e, ...patch } : e));
    setConfig({ ...config, evidenceOverrides: next });
  }
  function addEvidence() {
    if (!config) return;
    setConfig({ ...config, evidenceOverrides: [...evidence, blankEvidence()] });
  }
  function removeEvidence(i: number) {
    if (!config) return;
    setConfig({ ...config, evidenceOverrides: evidence.filter((_, idx) => idx !== i) });
  }
};

export default KitConfigModal;
