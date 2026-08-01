import React, { useEffect, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import api from '../../utils/api';
import { InteractionPlacement, KitConfig, KitConfigDefaults } from '../../components/admin/kitConfig/types';
import TimelineBuilderPanel from '../../components/admin/kitConfig/TimelineBuilderPanel';

/**
 * AdminAcceleratorSessionTimelinePage — the Timeline Builder as its own
 * full-page route, reached from the Customize modal's "Timeline" entry
 * (`KitConfigModal.tsx`). The Timeline needed more room than `modal-xl`
 * could give it (Dhee: "Running out of space... maybe it should be its
 * own page") — this page reuses the exact same `TimelineBuilderPanel` the
 * modal used to render in-place, just at full page width, and the exact
 * same `GET/PUT .../kit-config` calls the modal already uses, so saving
 * here and saving from the modal are the same operation.
 *
 * Registered inside the same ProtectedRoute → AdminLayout nesting every
 * other admin route uses (see routes/adminRoutes.tsx) — auth-gated like
 * the rest of /admin, not a bare route.
 *
 * "Click a card to open its full editor" (TimelineBuilderPanel's
 * onJumpToCategory) navigates back to the session list rather than deep-
 * linking into a specific Customize tab from a different page — wiring
 * that would mean AdminAcceleratorPage reading cross-page navigation state
 * to auto-open its modal at a given tab, which is out of this page's scope.
 */

interface RouteState { sessionTitle?: string }

const AdminAcceleratorSessionTimelinePage: React.FC = () => {
  const { sessionId } = useParams<{ sessionId: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const routeState = (location.state ?? {}) as RouteState;

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [config, setConfig] = useState<KitConfig | null>(null);
  const [defaults, setDefaults] = useState<KitConfigDefaults | null>(null);

  useEffect(() => {
    if (!sessionId) return;
    let alive = true;
    api.get(`/api/admin/accelerator/sessions/${sessionId}/kit-config`)
      .then((res) => { if (alive) { setConfig(res.data.config); setDefaults(res.data.defaults); } })
      .catch(() => { if (alive) setError('Could not load this session\'s configuration.'); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [sessionId]);

  const save = async () => {
    if (!config || !sessionId) return;
    setSaving(true);
    setError('');
    try {
      await api.put(`/api/admin/accelerator/sessions/${sessionId}/kit-config`, { config });
    } catch {
      setError('Failed to save.');
    } finally {
      setSaving(false);
    }
  };

  const generateQuestion = async (segment: string, instruction?: string): Promise<InteractionPlacement> => {
    const res = await api.post(`/api/admin/accelerator/sessions/${sessionId}/kit-config/generate-question`, { segment, instruction });
    return res.data.question;
  };

  if (loading || !config || !defaults) {
    return <div className="container-fluid py-4"><p className="text-muted">{error || 'Loading timeline…'}</p></div>;
  }

  const promptsApplyHere = defaults.dayKind === 'build' && defaults.teach.length === 0;
  const jumpToCategory = () => navigate('/admin/accelerator');

  return (
    <div className="container-fluid py-4">
      <div className="d-flex justify-content-between align-items-center mb-3">
        <div>
          <button className="btn btn-link ps-0 text-decoration-none small" onClick={() => navigate('/admin/accelerator')}>← Back to sessions</button>
          <h4 className="mb-0">🗓️ Timeline — {routeState.sessionTitle || 'Session'}</h4>
        </div>
        <div className="d-flex align-items-center gap-2">
          {error && <span className="text-danger small">{error}</span>}
          <button className="btn btn-primary btn-sm" disabled={saving} onClick={save}>{saving ? 'Saving…' : 'Save'}</button>
        </div>
      </div>
      <TimelineBuilderPanel
        dayKind={defaults.dayKind} segments={defaults.segments}
        checkpoints={defaults.checkpoints} breakSegment={defaults.breakSegment}
        storyBeats={{ config: config.storyBeats, defaults: defaults.storyBeats }}
        teach={{ config: config.teach, defaults: defaults.teach }}
        prompts={{ config: config.prompts, defaults: defaults.prompts }}
        interactions={{ config: config.interactions, defaults: defaults.interactions }}
        onChangeStoryBeats={(next) => setConfig({ ...config, storyBeats: next })}
        onChangeTeach={(next) => setConfig({ ...config, teach: next })}
        onChangePrompts={(next) => setConfig({ ...config, prompts: next })}
        onChangeInteractions={(next) => setConfig({ ...config, interactions: next })}
        onJumpToCategory={jumpToCategory}
        onGenerateQuestion={generateQuestion}
        promptsApplyHere={promptsApplyHere} />
    </div>
  );
};

export default AdminAcceleratorSessionTimelinePage;
