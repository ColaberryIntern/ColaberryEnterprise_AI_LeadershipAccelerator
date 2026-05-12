/**
 * VisualWorkspacePage — Visual Engineering Workspace V1.
 *
 * Productized re-skin of the existing visual-review backend (sessions +
 * critiques + suggestions + decisions + generate-prompt). Three-pane
 * shell: sidebar (sections) · stage (iframe + pin overlay) · details
 * (selected critique). Sticky bottom action bar. Annotation modal opens
 * on stage click in annotate mode.
 *
 * Build Center routing: V1 stashes the compiled prompt in sessionStorage
 * keyed by `visualWorkspace:pendingBuildPrompt` and navigates to
 * `/portal/project/blueprint?build=visual-workspace`. When Build Center
 * lands as its own route in roadmap P3, that destination becomes
 * `/portal/build` and reads from the same key.
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import portalApi from '../../utils/portalApi';
import { useVisualReviewSession } from '../../hooks/useVisualReviewSession';

import WorkspaceSidebar, { type SidebarIssue } from './components/WorkspaceSidebar';
import VisualStage, { type StagePin } from './components/VisualStage';
import IssueDetailsPanel from './components/IssueDetailsPanel';
import ActionBar from './components/ActionBar';
import AnnotationModal from './components/AnnotationModal';
import PromptPreviewModal from './components/PromptPreviewModal';
import SessionPickerEmpty from './components/SessionPickerEmpty';

import { compilePromptLocally } from './lib/promptCompiler';
import type {
  PinCoordinate, CritiqueSeverity, IssueStatus, SidebarSectionCount,
  CritiqueKind,
} from './types';

import './styles.css';

interface SessionStub {
  id: string;
  bp_id: string | null;
  page_route: string;
  status: string;
  opened_at: string;
}

const DEFAULT_PREVIEW_ORIGIN =
  process.env.REACT_APP_VISUAL_WORKSPACE_ORIGIN ||
  process.env.REACT_APP_PREVIEW_ORIGIN ||
  (typeof window !== 'undefined' ? window.location.origin : 'http://localhost:8888');

const VisualWorkspacePage: React.FC = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();

  const [sessionId, setSessionId] = useState<string | null>(searchParams.get('session'));
  const [sessions, setSessions] = useState<SessionStub[]>([]);
  const [sessionsLoading, setSessionsLoading] = useState(false);

  const [previewOrigin, setPreviewOrigin] = useState<string>(DEFAULT_PREVIEW_ORIGIN);
  const [iframeKey, setIframeKey] = useState<number>(0);

  const [annotateMode, setAnnotateMode] = useState(false);
  const [draftPin, setDraftPin] = useState<PinCoordinate | null>(null);
  const [selectedCritiqueId, setSelectedCritiqueId] = useState<string | null>(null);

  const [promptModalOpen, setPromptModalOpen] = useState(false);
  const [promptText, setPromptText] = useState('');
  const [promptSource, setPromptSource] = useState<'backend' | 'local'>('backend');
  const [generating, setGenerating] = useState(false);

  const session = useVisualReviewSession(sessionId);

  /* --------------- session list --------------- */

  const refreshSessions = useCallback(async () => {
    setSessionsLoading(true);
    try {
      const r = await portalApi.get('/api/portal/project/visual-review/sessions');
      setSessions((r.data?.sessions || []) as SessionStub[]);
    } catch {
      /* silent — empty list is fine */
    } finally {
      setSessionsLoading(false);
    }
  }, []);

  useEffect(() => { void refreshSessions(); }, [refreshSessions]);

  useEffect(() => {
    // keep URL in sync with sessionId
    const current = searchParams.get('session');
    if (sessionId && current !== sessionId) {
      const next = new URLSearchParams(searchParams);
      next.set('session', sessionId);
      setSearchParams(next, { replace: true });
    } else if (!sessionId && current) {
      const next = new URLSearchParams(searchParams);
      next.delete('session');
      setSearchParams(next, { replace: true });
    }
  }, [sessionId, searchParams, setSearchParams]);

  const openNewSession = useCallback(async (route: string, origin: string) => {
    setPreviewOrigin(origin);
    try {
      const r = await portalApi.post('/api/portal/project/visual-review/session', { page_route: route });
      const id = r.data?.id;
      if (id) {
        setSessionId(id);
        await refreshSessions();
      }
    } catch {
      /* surfaced via session.error after pick */
    }
  }, [refreshSessions]);

  /* --------------- derived: page route --------------- */

  const pageRoute = session.data?.session?.page_route || '';

  const handlePageRouteChange = useCallback(async (newRoute: string) => {
    if (!sessionId) return;
    // V1: route updates require closing + reopening. Surface gently.
    setSessionId(null);
    setSelectedCritiqueId(null);
    await openNewSession(newRoute, previewOrigin);
  }, [sessionId, previewOrigin, openNewSession]);

  const previewSrc = useMemo(() => {
    const route = pageRoute || '/';
    return `${previewOrigin.replace(/\/$/, '')}${route.startsWith('/') ? route : `/${route}`}`;
  }, [previewOrigin, pageRoute]);

  /* --------------- derived: sidebar issues + pins --------------- */

  const critiques: any[] = session.data?.critiques || [];
  const suggestions: any[] = session.data?.suggestions || [];
  const decisions: any[] = session.data?.decisions || [];

  const acceptedSuggestionIds = useMemo(() => {
    const set = new Set<string>();
    decisions.forEach(d => { if (d.verdict === 'accepted' && d.suggestion_id) set.add(d.suggestion_id); });
    return set;
  }, [decisions]);

  const resolvedCritiqueIds = useMemo(() => {
    const set = new Set<string>();
    decisions.forEach(d => {
      if (d.verdict === 'accepted' && d.critique_id && !d.suggestion_id) set.add(d.critique_id);
    });
    return set;
  }, [decisions]);

  const indexedCritiques = useMemo(() => {
    return critiques.map((c, i) => ({ ...c, index: i + 1 }));
  }, [critiques]);

  const sidebarIssues: SidebarIssue[] = useMemo(() => {
    return indexedCritiques.map(c => {
      const csuggestions = suggestions.filter(s => s.critique_id === c.id);
      const hasAccepted = csuggestions.some(s => acceptedSuggestionIds.has(s.id));
      const isResolved = resolvedCritiqueIds.has(c.id);
      let status: IssueStatus = 'open';
      if (isResolved) status = 'resolved';
      else if (hasAccepted) status = 'ready';
      else if (csuggestions.length > 0) status = 'suggested';

      const region = c.region;
      const region_label = region
        ? `${(region.x * 100).toFixed(0)}% · ${(region.y * 100).toFixed(0)}%`
        : c.target_selector || undefined;

      return {
        id: c.id,
        index: c.index,
        title: c.title || (c.description || '').split('.')[0].slice(0, 80),
        kind: c.kind,
        severity: c.severity as CritiqueSeverity,
        status,
        region_label,
      };
    });
  }, [indexedCritiques, suggestions, acceptedSuggestionIds, resolvedCritiqueIds]);

  const counts: SidebarSectionCount = useMemo(() => {
    const c: SidebarSectionCount = { open: 0, suggested: 0, ready: 0, verifying: 0, resolved: 0, total: sidebarIssues.length };
    sidebarIssues.forEach(i => { c[i.status] += 1; });
    return c;
  }, [sidebarIssues]);

  const stagePins: StagePin[] = useMemo(() => {
    return indexedCritiques
      .filter(c => c.region)
      .map(c => ({
        id: c.id,
        index: c.index,
        pin: { x: c.region.x, y: c.region.y, width: c.region.width || 0, height: c.region.height || 0 },
        severity: c.severity as CritiqueSeverity,
        resolved: resolvedCritiqueIds.has(c.id),
        active: c.id === selectedCritiqueId,
      }));
  }, [indexedCritiques, resolvedCritiqueIds, selectedCritiqueId]);

  const selectedCritique = useMemo(() => {
    if (!selectedCritiqueId) return null;
    const c = indexedCritiques.find(x => x.id === selectedCritiqueId);
    if (!c) return null;
    return {
      id: c.id,
      index: c.index,
      title: c.title,
      description: c.description,
      kind: c.kind,
      severity: c.severity as CritiqueSeverity,
      target_selector: c.target_selector,
      expected_outcome: c.expected_outcome,
      region: c.region,
    };
  }, [selectedCritiqueId, indexedCritiques]);

  const selectedSuggestions = useMemo(() => {
    if (!selectedCritiqueId) return [];
    return suggestions.filter(s => s.critique_id === selectedCritiqueId);
  }, [selectedCritiqueId, suggestions]);

  /* --------------- handlers --------------- */

  const handleStageClick = useCallback((pin: PinCoordinate) => {
    setDraftPin(pin);
  }, []);

  const handlePinClick = useCallback((id: string) => {
    setSelectedCritiqueId(id);
    setAnnotateMode(false);
  }, []);

  const handleSaveAnnotation = useCallback(async (data: {
    title: string;
    description: string;
    kind: CritiqueKind;
    severity: CritiqueSeverity;
    expected_outcome: string;
    target_selector: string;
  }) => {
    if (!draftPin) return;
    await session.addCritique({
      kind: data.kind,
      severity: data.severity,
      description: data.description,
      region: { x: draftPin.x, y: draftPin.y, width: 0, height: 0 },
      target_selector: data.target_selector || null,
      expected_outcome: data.expected_outcome || null,
      // backend `addCritique` does not accept `title` directly — embed in
      // description's first line so it surfaces in the sidebar.
    } as any);
    setDraftPin(null);
    setAnnotateMode(false);
  }, [draftPin, session]);

  const acceptSuggestion = useCallback(async (id: string) => {
    await session.decide({ suggestion_id: id, verdict: 'accepted' });
  }, [session]);
  const rejectSuggestion = useCallback(async (id: string) => {
    await session.decide({ suggestion_id: id, verdict: 'rejected' });
  }, [session]);
  const deferSuggestion = useCallback(async (id: string) => {
    await session.decide({ suggestion_id: id, verdict: 'deferred' });
  }, [session]);

  const markCurrentResolved = useCallback(async () => {
    if (!selectedCritiqueId) return;
    await session.decide({ critique_id: selectedCritiqueId, verdict: 'accepted' });
  }, [selectedCritiqueId, session]);

  const compilePrompt = useCallback(async (selectedIds?: string[]) => {
    setGenerating(true);
    try {
      // Try backend first; fall back to local compiler if it returns empty.
      let text = '';
      let source: 'backend' | 'local' = 'backend';
      try {
        const r = await session.generatePrompt();
        text = (r?.generated_prompt || '').trim();
      } catch {
        text = '';
      }
      if (!text) {
        text = compilePromptLocally({
          page_route: pageRoute,
          preview_origin: previewOrigin,
          critiques,
          suggestions,
          decisions,
          selected_critique_ids: selectedIds,
        });
        source = 'local';
      }
      setPromptText(text);
      setPromptSource(source);
      setPromptModalOpen(true);
    } finally {
      setGenerating(false);
    }
  }, [session, pageRoute, previewOrigin, critiques, suggestions, decisions]);

  const sendToBuildCenter = useCallback(async () => {
    let text = promptText;
    if (!text) {
      // compile first if not already
      try {
        const r = await session.generatePrompt();
        text = (r?.generated_prompt || '').trim();
      } catch { /* ignore */ }
      if (!text) {
        text = compilePromptLocally({
          page_route: pageRoute,
          preview_origin: previewOrigin,
          critiques,
          suggestions,
          decisions,
        });
      }
    }
    sessionStorage.setItem('visualWorkspace:pendingBuildPrompt', text);
    sessionStorage.setItem('visualWorkspace:pendingBuildSourceRoute', pageRoute);
    // Workspace Presence Sprint, 2026-05-12 — write a timestamp the
    // OperationalHistoryStrip on Cory Home reads as "Last critique X ago".
    sessionStorage.setItem('visualWorkspace:lastSessionTouchedAt', new Date().toISOString());
    // Blueprint is the execution surface — Critique compiles the prompt
    // and hands off here. Blueprint surfaces the pending prompt as a
    // primary banner (see SystemBlueprint.tsx pendingCritiquePrompt).
    navigate('/portal/project/blueprint?build=visual-workspace');
  }, [promptText, session, pageRoute, previewOrigin, critiques, suggestions, decisions, navigate]);

  const markReadyForVerification = useCallback(() => {
    // V1: simple alert + status hint — verification workspace is roadmap P4.
    sessionStorage.setItem('visualWorkspace:verificationQueue', JSON.stringify({
      session_id: sessionId,
      page_route: pageRoute,
      issue_count: counts.total,
      ready_count: counts.ready,
      flagged_at: new Date().toISOString(),
    }));
    // light feedback — no toast system yet
    // eslint-disable-next-line no-alert
    alert(`Marked ${counts.total} issue(s) ready for verification. The dedicated Verification surface lands in the next sprint; until then, verify via Blueprint after the build completes.`);
  }, [sessionId, pageRoute, counts]);

  /* --------------- render --------------- */

  if (!sessionId) {
    return (
      <SessionPickerEmpty
        recent={sessions}
        loading={sessionsLoading}
        onPick={(id) => setSessionId(id)}
        onCreate={openNewSession}
      />
    );
  }

  return (
    <div className="vw-shell">
      <div className="vw-main">
        <WorkspaceSidebar
          pageRoute={pageRoute}
          previewOrigin={previewOrigin}
          onPreviewOriginChange={setPreviewOrigin}
          onPageRouteChange={handlePageRouteChange}
          issues={sidebarIssues}
          selectedId={selectedCritiqueId}
          onSelect={(id) => { setSelectedCritiqueId(id); setAnnotateMode(false); }}
          onCloseSession={() => { setSessionId(null); setSelectedCritiqueId(null); }}
          counts={counts}
        />

        <div className="vw-canvas">
          <div className="vw-canvas-toolbar">
            <span className="vw-url-display">{previewSrc}</span>
            {session.loading && <span className="badge bg-light text-dark">loading…</span>}
            {session.error && <span className="badge bg-warning text-dark" title={session.error}>session error</span>}
          </div>
          <VisualStage
            src={previewSrc}
            annotateMode={annotateMode}
            pins={stagePins}
            iframeKey={iframeKey}
            onPinClick={handlePinClick}
            onStageClick={handleStageClick}
          />
        </div>

        <IssueDetailsPanel
          critique={selectedCritique}
          suggestions={selectedSuggestions}
          decisions={decisions}
          onAcceptSuggestion={acceptSuggestion}
          onRejectSuggestion={rejectSuggestion}
          onDeferSuggestion={deferSuggestion}
          onMarkResolved={markCurrentResolved}
          onSendToBuildCenter={sendToBuildCenter}
          onGenerateForThisOne={() => selectedCritiqueId && compilePrompt([selectedCritiqueId])}
        />
      </div>

      <ActionBar
        annotateMode={annotateMode}
        onToggleAnnotate={() => setAnnotateMode(v => !v)}
        onReload={() => setIframeKey(k => k + 1)}
        onCompileAll={() => compilePrompt()}
        onSendToBuildCenter={sendToBuildCenter}
        onMarkReady={markReadyForVerification}
        totalIssues={counts.total}
        acceptedCount={counts.ready}
        generating={generating}
      />

      <AnnotationModal
        open={!!draftPin}
        pin={draftPin}
        onCancel={() => setDraftPin(null)}
        onSave={handleSaveAnnotation}
      />

      <PromptPreviewModal
        open={promptModalOpen}
        prompt={promptText}
        source={promptSource}
        onClose={() => setPromptModalOpen(false)}
        onOpenBuildCenter={() => { setPromptModalOpen(false); void sendToBuildCenter(); }}
      />
    </div>
  );
};

export default VisualWorkspacePage;
