import React, { useEffect, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import api from '../../utils/api';
import { CategoryKey, InteractionPlacement, KitConfig, KitConfigDefaults } from '../../components/admin/kitConfig/types';
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
 * onJumpToCategory) opens that session's Customize modal, on the matching
 * category tab, in a NEW browser tab (`?customizeSessionId=&customizeCategory=`,
 * read by AdminAcceleratorPage) — this page itself stays open, untouched, in
 * the original tab. "Back to sessions" is a separate, plain same-tab
 * navigation that additionally requests the Sessions tab specifically
 * (`?tab=sessions`) rather than AdminAcceleratorPage's own default
 * (Participants — a deliberate fix for a different bug, left unchanged).
 */

interface RouteState { sessionTitle?: string }

/** Pure, exported so it's directly unit-testable without rendering the page
 * (this component owns its own data fetch, so a full render never reaches
 * past the loading state in `renderToStaticMarkup` — see
 * `AdminAcceleratorSessionTimelinePage.smoke.test.tsx`). */
export function buildCustomizeJumpUrl(sessionId: string, category: CategoryKey): string {
  const params = new URLSearchParams({ customizeSessionId: sessionId, customizeCategory: category });
  return `/admin/accelerator?${params.toString()}`;
}

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

  // Opens the Customize modal for THIS session, on the clicked card's category,
  // in a new tab — the Timeline page itself is untouched, not navigated away.
  const jumpToCategory = (key: CategoryKey) => {
    if (!sessionId) return;
    window.open(buildCustomizeJumpUrl(sessionId, key), '_blank');
  };

  return (
    <div className="container-fluid py-4">
      <div className="d-flex justify-content-between align-items-center mb-3">
        <div>
          <button className="btn btn-link ps-0 text-decoration-none small" onClick={() => navigate('/admin/accelerator?tab=sessions')}>← Back to sessions</button>
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
