import { useState, useEffect, useRef } from 'react';
import {
  getOpenclawConfig,
  updateOpenclawConfig,
  saveLinkedInSession,
  saveFacebookSession,
  getFacebookGroups,
  configureFacebookGroups,
  getConfiguredFacebookGroups,
  saveRedditSession,
  getPlatformStatus,
  FacebookGroup,
  FacebookGroupConfig,
  PlatformStatus,
} from '../../../../../services/openclawApi';
import { PLATFORM_COLORS, STRATEGY_BADGES } from './openclawUtils';

const PLATFORM_LABELS: Record<string, string> = {
  linkedin: 'LinkedIn',
  devto: 'Dev.to',
  hashnode: 'Hashnode',
  twitter: 'Twitter/X',
  bluesky: 'Bluesky',
  reddit: 'Reddit',
  facebook_groups: 'Facebook Groups',
  discourse: 'Discourse',
  youtube: 'YouTube',
  producthunt: 'Product Hunt',
  medium: 'Medium',
  linkedin_comments: 'LinkedIn Comments',
  hackernews: 'Hacker News',
  quora: 'Quora',
};

const PLATFORM_ORDER = [
  'linkedin', 'devto', 'hashnode', 'twitter', 'bluesky', 'reddit',
  'facebook_groups', 'discourse', 'youtube', 'producthunt', 'medium',
  'linkedin_comments', 'hackernews', 'quora',
];

const METHOD_LABELS: Record<string, string> = {
  api: 'API',
  browser: 'Browser',
  manual: 'Manual',
};

export default function SettingsSubTab() {
  // ── Governance Controls ──────────────────────────────────────────────────
  const [requireApproval, setRequireApproval] = useState(true);
  const [autoPostDevto, setAutoPostDevto] = useState(false);
  const [savingConfig, setSavingConfig] = useState<string | null>(null);

  // ── Platform Status ────────────────────────────────────────────────────
  const [platforms, setPlatforms] = useState<Record<string, PlatformStatus> | null>(null);
  const [statusLoading, setStatusLoading] = useState(true);

  // ── LinkedIn Session ─────────────────────────────────────────────────────
  const [liAtCookie, setLiAtCookie] = useState('');
  const [liLoggingIn, setLiLoggingIn] = useState(false);
  const [cookieResult, setCookieResult] = useState<{ success: boolean; message: string } | null>(null);
  const [showLinkedinSetup, setShowLinkedinSetup] = useState(false);

  // ── Facebook Groups ──────────────────────────────────────────────────────
  const [fbCUser, setFbCUser] = useState('');
  const [fbXs, setFbXs] = useState('');
  const [fbSaving, setFbSaving] = useState(false);
  const [fbResult, setFbResult] = useState<{ success: boolean; message: string } | null>(null);
  const [fbGroups, setFbGroups] = useState<FacebookGroup[]>([]);
  const [fbConfiguredGroups, setFbConfiguredGroups] = useState<FacebookGroupConfig>({ target_groups: [], enabled: false });
  const [fbSelectedGroupIds, setFbSelectedGroupIds] = useState<Set<string>>(new Set());
  const [fbLoadingGroups, setFbLoadingGroups] = useState(false);
  const [showFbSetup, setShowFbSetup] = useState(false);

  // ── Reddit ───────────────────────────────────────────────────────────────
  const [redditSessionCookie, setRedditSessionCookie] = useState('');
  const [redditTokenV2, setRedditTokenV2] = useState('');
  const [redditSaving, setRedditSaving] = useState(false);
  const [redditResult, setRedditResult] = useState<{ success: boolean; message: string } | null>(null);
  const [showRedditSetup, setShowRedditSetup] = useState(false);

  // Refs for scrolling
  const linkedinRef = useRef<HTMLDivElement>(null);
  const fbRef = useRef<HTMLDivElement>(null);
  const redditRef = useRef<HTMLDivElement>(null);

  // ── Load initial state on mount ──────────────────────────────────────────
  useEffect(() => {
    // Governance config
    getOpenclawConfig().then(res => {
      const agents = res.data.agents || [];
      const content = agents.find((a: any) => a.agent_name === 'OpenclawContentResponseAgent');
      const worker = agents.find((a: any) => a.agent_name === 'OpenclawBrowserWorkerAgent');
      if (content?.config?.require_approval !== undefined) setRequireApproval(content.config.require_approval);
      if (worker) setAutoPostDevto(worker.enabled);
    }).catch(() => {});

    // Platform status (replaces 3 separate session checks)
    setStatusLoading(true);
    getPlatformStatus()
      .then(res => {
        setPlatforms(res.data.platforms);
        // Auto-expand setup sections for platforms that need it
        if (!res.data.platforms.linkedin?.ready) setShowLinkedinSetup(true);
        if (!res.data.platforms.facebook_groups?.ready) setShowFbSetup(true);
        if (!res.data.platforms.reddit?.ready) setShowRedditSetup(true);
      })
      .catch(() => {})
      .finally(() => setStatusLoading(false));

    // Facebook configured groups
    getConfiguredFacebookGroups()
      .then(res => {
        setFbConfiguredGroups(res.data);
        setFbSelectedGroupIds(new Set(res.data.target_groups?.map((g: any) => g.id) || []));
      })
      .catch(() => {});
  }, []);

  // ── Governance Handlers ──────────────────────────────────────────────────
  const handleToggleApproval = async () => {
    setSavingConfig('approval');
    try {
      await updateOpenclawConfig({ agent_name: 'OpenclawContentResponseAgent', config: { require_approval: !requireApproval } });
      setRequireApproval(!requireApproval);
    } catch { /* ignore */ }
    setSavingConfig(null);
  };

  const handleToggleAutoPost = async () => {
    setSavingConfig('autopost');
    try {
      await updateOpenclawConfig({ agent_name: 'OpenclawBrowserWorkerAgent', enabled: !autoPostDevto });
      setAutoPostDevto(!autoPostDevto);
    } catch { /* ignore */ }
    setSavingConfig(null);
  };

  const handleTogglePlatform = async (platform: string) => {
    if (!platforms) return;
    setSavingConfig(`platform-${platform}`);
    const currentActive = Object.entries(platforms).filter(([, s]) => s.active).map(([p]) => p);
    const updated = currentActive.includes(platform)
      ? currentActive.filter(p => p !== platform)
      : [...currentActive, platform];
    try {
      await updateOpenclawConfig({ agent_name: 'OpenclawMarketSignalAgent', config: { platforms: updated } });
      setPlatforms(prev => prev ? { ...prev, [platform]: { ...prev[platform], active: !prev[platform].active } } : prev);
    } catch { /* ignore */ }
    setSavingConfig(null);
  };

  // ── LinkedIn Session Handler ─────────────────────────────────────────────
  const handleSaveLiCookie = async () => {
    if (liAtCookie.trim().startsWith('http')) {
      setCookieResult({ success: false, message: 'This looks like a URL, not a cookie. The li_at cookie is a long alphanumeric string (starts with AQE...). See the steps above.' });
      return;
    }
    setLiLoggingIn(true);
    setCookieResult(null);
    try {
      const res = await saveLinkedInSession(liAtCookie.trim());
      if (res.data.success) {
        setPlatforms(prev => prev ? { ...prev, linkedin: { ...prev.linkedin, ready: true, details: 'Session connected' } } : prev);
        setLiAtCookie('');
        setCookieResult({ success: true, message: 'LinkedIn session connected successfully.' });
      } else {
        setCookieResult({ success: false, message: res.data.message || 'Failed to save session' });
      }
    } catch (err: any) {
      setCookieResult({ success: false, message: err?.response?.data?.error || 'Failed to save LinkedIn session' });
    }
    setLiLoggingIn(false);
  };

  const scrollToSetup = (platform: string) => {
    if (platform === 'linkedin') { setShowLinkedinSetup(true); setTimeout(() => linkedinRef.current?.scrollIntoView({ behavior: 'smooth' }), 100); }
    if (platform === 'facebook_groups') { setShowFbSetup(true); setTimeout(() => fbRef.current?.scrollIntoView({ behavior: 'smooth' }), 100); }
    if (platform === 'reddit') { setShowRedditSetup(true); setTimeout(() => redditRef.current?.scrollIntoView({ behavior: 'smooth' }), 100); }
  };

  // ── Summary counts ───────────────────────────────────────────────────────
  const readyCount = platforms ? Object.values(platforms).filter(p => p.ready).length : 0;
  const totalCount = platforms ? Object.keys(platforms).length : 0;

  // ── Render ───────────────────────────────────────────────────────────────
  return (
    <div>
      {/* ══ Platform Readiness Dashboard ════════════════════════════════════ */}
      <div className="card border-0 shadow-sm mb-4">
        <div className="card-header bg-white fw-semibold small d-flex justify-content-between align-items-center">
          <span>Platform Readiness</span>
          {platforms && (
            <span className={`badge bg-${readyCount === totalCount ? 'success' : readyCount > totalCount / 2 ? 'info' : 'warning'}`} style={{ fontSize: '0.6rem' }}>
              {readyCount} of {totalCount} Ready
            </span>
          )}
        </div>
        <div className="card-body p-3">
          {statusLoading ? (
            <div className="text-center py-4">
              <div className="spinner-border spinner-border-sm text-primary" role="status">
                <span className="visually-hidden">Loading platform status...</span>
              </div>
            </div>
          ) : platforms ? (
            <div className="table-responsive">
              <table className="table table-hover mb-0" style={{ fontSize: '0.78rem' }}>
                <thead className="table-light">
                  <tr>
                    <th>Platform</th>
                    <th>Strategy</th>
                    <th>Method</th>
                    <th>Status</th>
                    <th style={{ width: 60 }}>Scan</th>
                    <th style={{ width: 90 }}>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {PLATFORM_ORDER.filter(p => platforms[p]).map(p => {
                    const s = platforms[p];
                    const stratBadge = STRATEGY_BADGES[s.strategy];
                    const needsSetup = !s.ready && s.method !== 'manual';
                    return (
                      <tr key={p} className={needsSetup ? 'table-danger bg-opacity-10' : ''}>
                        <td>
                          <span
                            className="d-inline-block rounded-circle me-2"
                            style={{ width: 8, height: 8, backgroundColor: PLATFORM_COLORS[p] || '#6c757d', verticalAlign: 'middle' }}
                          />
                          <span className="fw-medium">{PLATFORM_LABELS[p] || p}</span>
                        </td>
                        <td>
                          {stratBadge && (
                            <span className="badge" style={{ fontSize: '0.55rem', backgroundColor: stratBadge.bg, color: '#fff' }}>
                              {stratBadge.label}
                            </span>
                          )}
                        </td>
                        <td>
                          <span className="text-muted">{METHOD_LABELS[s.method] || s.method}</span>
                        </td>
                        <td>
                          {s.method === 'manual' ? (
                            <span className="badge bg-warning text-dark" style={{ fontSize: '0.6rem' }} title="Content is auto-generated. Copy and paste to post.">
                              Manual Posting
                            </span>
                          ) : s.ready ? (
                            <span className="badge bg-success" style={{ fontSize: '0.6rem' }}>Ready</span>
                          ) : (
                            <span className="badge bg-danger" style={{ fontSize: '0.6rem' }}>Setup Required</span>
                          )}
                        </td>
                        <td>
                          <div className="form-check form-switch mb-0">
                            <input
                              type="checkbox"
                              className="form-check-input"
                              checked={s.active}
                              onChange={() => handleTogglePlatform(p)}
                              disabled={savingConfig === `platform-${p}`}
                            />
                          </div>
                        </td>
                        <td>
                          {needsSetup && ['linkedin', 'facebook_groups', 'reddit'].includes(p) && (
                            <button
                              className="btn btn-sm btn-outline-danger py-0 px-2"
                              style={{ fontSize: '0.6rem' }}
                              onClick={() => scrollToSetup(p)}
                            >
                              Configure
                            </button>
                          )}
                          {needsSetup && !['linkedin', 'facebook_groups', 'reddit'].includes(p) && (
                            <span className="text-muted" style={{ fontSize: '0.6rem' }}>Set env vars</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="text-muted small mb-0">Failed to load platform status</p>
          )}
          <div className="text-muted mt-2" style={{ fontSize: '0.62rem' }}>
            <strong>Manual Posting</strong> platforms auto-generate content — find it in the Task Queue tab to copy &amp; paste.
          </div>
        </div>
      </div>

      {/* ══ Governance Controls ═════════════════════════════════════════════ */}
      <div className="card border-0 shadow-sm mb-4">
        <div className="card-header bg-white fw-semibold small">Governance Controls</div>
        <div className="card-body py-3 px-3">
          <div className="d-flex justify-content-between align-items-center mb-3">
            <div>
              <div className="fw-medium small">Require Manual Approval</div>
              <div className="text-muted" style={{ fontSize: '0.68rem' }}>When ON, all generated responses start as drafts requiring admin approval before posting.</div>
            </div>
            <div className="form-check form-switch ms-3">
              <input type="checkbox" className="form-check-input" role="switch" checked={requireApproval} onChange={handleToggleApproval} disabled={savingConfig === 'approval'} />
            </div>
          </div>
          <hr className="my-2" />
          <div className="d-flex justify-content-between align-items-center">
            <div>
              <div className="fw-medium small">Auto-Post (Dev.to, Hashnode, Discourse)</div>
              <div className="text-muted" style={{ fontSize: '0.68rem' }}>When ON, approved responses are posted automatically via API to platforms with configured credentials.</div>
            </div>
            <div className="form-check form-switch ms-3">
              <input type="checkbox" className="form-check-input" role="switch" checked={autoPostDevto} onChange={handleToggleAutoPost} disabled={savingConfig === 'autopost'} />
            </div>
          </div>
        </div>
      </div>

      {/* ══ LinkedIn Session Setup (collapsible) ═══════════════════════════ */}
      <div ref={linkedinRef} className="card border-0 shadow-sm mb-4">
        <div
          className="card-header bg-white fw-semibold small d-flex justify-content-between align-items-center"
          style={{ cursor: 'pointer' }}
          onClick={() => setShowLinkedinSetup(!showLinkedinSetup)}
        >
          <span>
            LinkedIn Session
            <span className="badge ms-2" style={{ fontSize: '0.55rem', verticalAlign: 'middle', backgroundColor: '#0A66C2', color: '#fff' }}>LinkedIn</span>
            {platforms?.linkedin && (
              <span className={`badge ms-2 bg-${platforms.linkedin.ready ? 'success' : 'danger'}`} style={{ fontSize: '0.55rem', verticalAlign: 'middle' }}>
                {platforms.linkedin.ready ? 'Connected' : 'Not Connected'}
              </span>
            )}
          </span>
          <i className={`bi bi-chevron-${showLinkedinSetup ? 'up' : 'down'}`} />
        </div>
        {showLinkedinSetup && (
          <div className="card-body py-3 px-3">
            <div className="text-muted mb-2" style={{ fontSize: '0.68rem' }}>
              Paste your LinkedIn <code>li_at</code> session cookie to enable comment scraping and reply generation.
              Open LinkedIn in Chrome &rarr; DevTools (F12) &rarr; Application &rarr; Cookies &rarr; linkedin.com &rarr; copy the <code>li_at</code> value (starts with <code>AQE...</code>).
            </div>
            <div className="d-flex gap-2">
              <input
                type="password"
                className="form-control form-control-sm"
                placeholder="Paste li_at cookie value (AQE...)"
                value={liAtCookie}
                onChange={e => setLiAtCookie(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && liAtCookie.trim() && !liLoggingIn && handleSaveLiCookie()}
              />
              <button
                className="btn btn-sm btn-primary text-nowrap"
                onClick={handleSaveLiCookie}
                disabled={!liAtCookie.trim() || liLoggingIn}
              >
                {liLoggingIn ? 'Saving...' : 'Save Session'}
              </button>
            </div>
            {cookieResult && (
              <div className={`alert alert-${cookieResult.success ? 'success' : 'danger'} mt-2 py-1 px-2 small mb-0`}>
                {cookieResult.message}
              </div>
            )}
          </div>
        )}
      </div>

      {/* ══ Facebook Groups Session & Config (collapsible) ═════════════════ */}
      <div ref={fbRef} className="card border-0 shadow-sm mb-4">
        <div
          className="card-header bg-white fw-semibold small d-flex justify-content-between align-items-center"
          style={{ cursor: 'pointer' }}
          onClick={() => setShowFbSetup(!showFbSetup)}
        >
          <span>
            Facebook Groups
            <span className="badge ms-2" style={{ fontSize: '0.55rem', verticalAlign: 'middle', backgroundColor: '#1877F2', color: '#fff' }}>Browser Auto-Post</span>
            {platforms?.facebook_groups && (
              <span className={`badge ms-2 bg-${platforms.facebook_groups.ready ? 'success' : 'danger'}`} style={{ fontSize: '0.55rem', verticalAlign: 'middle' }}>
                {platforms.facebook_groups.ready ? 'Connected' : 'Not Connected'}
              </span>
            )}
          </span>
          <i className={`bi bi-chevron-${showFbSetup ? 'up' : 'down'}`} />
        </div>
        {showFbSetup && (
          <div className="card-body py-3 px-3">
            <div className="text-muted mb-2" style={{ fontSize: '0.68rem' }}>
              Paste your Facebook cookies to enable browser auto-posting to your groups. Open Facebook in Chrome &rarr; DevTools (F12) &rarr; Application &rarr; Cookies &rarr; facebook.com &rarr; copy <code>c_user</code> and <code>xs</code> values.
            </div>
            <div className="d-flex gap-2 mb-2">
              <div className="flex-grow-1">
                <label className="form-label small fw-medium mb-1">c_user</label>
                <input type="text" className="form-control form-control-sm" placeholder="e.g. 100012345678901" value={fbCUser} onChange={e => setFbCUser(e.target.value)} />
              </div>
              <div className="flex-grow-1">
                <label className="form-label small fw-medium mb-1">xs</label>
                <input type="text" className="form-control form-control-sm" placeholder="e.g. 28:aB3cDe..." value={fbXs} onChange={e => setFbXs(e.target.value)} />
              </div>
              <div className="d-flex align-items-end">
                <button
                  className="btn btn-sm btn-primary text-nowrap"
                  disabled={!fbCUser.trim() || !fbXs.trim() || fbSaving}
                  onClick={async () => {
                    setFbSaving(true);
                    setFbResult(null);
                    try {
                      const res = await saveFacebookSession(fbCUser.trim(), fbXs.trim());
                      setFbResult({ success: res.data.success, message: res.data.message });
                      if (res.data.success) {
                        setPlatforms(prev => prev ? { ...prev, facebook_groups: { ...prev.facebook_groups, ready: true, details: 'Session connected' } } : prev);
                        setFbCUser(''); setFbXs('');
                      }
                    } catch (err: any) {
                      setFbResult({ success: false, message: err?.response?.data?.error || 'Failed to save session' });
                    }
                    setFbSaving(false);
                  }}
                >
                  {fbSaving ? 'Saving...' : 'Save Session'}
                </button>
              </div>
            </div>
            {fbResult && (<div className={`alert alert-${fbResult.success ? 'success' : 'danger'} py-1 px-2 small mb-2`}>{fbResult.message}</div>)}

            {/* Group Selection */}
            {platforms?.facebook_groups?.ready && (
              <>
                <hr className="my-2" />
                <div className="d-flex justify-content-between align-items-center mb-2">
                  <div className="fw-medium small">Target Groups</div>
                  <button
                    className="btn btn-sm btn-outline-primary py-0 px-2"
                    style={{ fontSize: '0.7rem' }}
                    disabled={fbLoadingGroups}
                    onClick={async () => {
                      setFbLoadingGroups(true);
                      try {
                        const res = await getFacebookGroups();
                        setFbGroups(res.data.groups || []);
                      } catch { /* ignore */ }
                      setFbLoadingGroups(false);
                    }}
                  >
                    {fbLoadingGroups ? 'Loading...' : 'Load My Groups'}
                  </button>
                </div>
                {fbConfiguredGroups.target_groups.length > 0 && fbGroups.length === 0 && (
                  <div className="text-muted small mb-2" style={{ fontSize: '0.68rem' }}>
                    {fbConfiguredGroups.target_groups.length} group(s) configured. Click "Load My Groups" to modify.
                  </div>
                )}
                {fbGroups.length > 0 && (
                  <>
                    <div className="border rounded p-2 mb-2" style={{ maxHeight: 200, overflowY: 'auto' }}>
                      {fbGroups.map(g => (
                        <div key={g.id} className="form-check small">
                          <input
                            type="checkbox"
                            className="form-check-input"
                            id={`fb-group-${g.id}`}
                            checked={fbSelectedGroupIds.has(g.id)}
                            onChange={() => {
                              setFbSelectedGroupIds(prev => {
                                const next = new Set(prev);
                                if (next.has(g.id)) next.delete(g.id); else next.add(g.id);
                                return next;
                              });
                            }}
                          />
                          <label className="form-check-label" htmlFor={`fb-group-${g.id}`}>
                            {g.name} {g.member_count && <span className="text-muted">({g.member_count} members)</span>}
                          </label>
                        </div>
                      ))}
                    </div>
                    <button
                      className="btn btn-sm btn-success"
                      onClick={async () => {
                        const selectedGroups = fbGroups.filter(g => fbSelectedGroupIds.has(g.id)).map(g => ({ id: g.id, name: g.name, url: g.url }));
                        try {
                          await configureFacebookGroups(selectedGroups, true);
                          setFbConfiguredGroups({ target_groups: selectedGroups, enabled: true });
                          setFbResult({ success: true, message: `Saved ${selectedGroups.length} groups for auto-posting.` });
                        } catch (err: any) {
                          setFbResult({ success: false, message: err?.response?.data?.error || 'Failed to save configuration' });
                        }
                      }}
                    >
                      Save Group Selection ({fbSelectedGroupIds.size})
                    </button>
                  </>
                )}
              </>
            )}
          </div>
        )}
      </div>

      {/* ══ Reddit Session (collapsible) ═══════════════════════════════════ */}
      <div ref={redditRef} className="card border-0 shadow-sm mb-4">
        <div
          className="card-header bg-white fw-semibold small d-flex justify-content-between align-items-center"
          style={{ cursor: 'pointer' }}
          onClick={() => setShowRedditSetup(!showRedditSetup)}
        >
          <span>
            Reddit
            <span className="badge ms-2" style={{ fontSize: '0.55rem', verticalAlign: 'middle', backgroundColor: '#FF4500', color: '#fff' }}>Browser Auto-Post</span>
            {platforms?.reddit && (
              <span className={`badge ms-2 bg-${platforms.reddit.ready ? 'success' : 'danger'}`} style={{ fontSize: '0.55rem', verticalAlign: 'middle' }}>
                {platforms.reddit.ready ? 'Session Saved' : 'Not Connected'}
              </span>
            )}
          </span>
          <i className={`bi bi-chevron-${showRedditSetup ? 'up' : 'down'}`} />
        </div>
        {showRedditSetup && (
          <div className="card-body py-3 px-3">
            <div className="text-muted mb-2" style={{ fontSize: '0.68rem' }}>
              Paste your Reddit session cookie for browser-based comment posting. Open <a href="https://www.reddit.com" target="_blank" rel="noreferrer">reddit.com</a> while logged in &rarr; DevTools (F12) &rarr; Application &rarr; Cookies &rarr; <code>reddit.com</code> &rarr; copy the <code>reddit_session</code> value. Optionally copy <code>token_v2</code> as well.
            </div>
            <div className="row g-2 mb-2">
              <div className="col-md-8">
                <label className="form-label small fw-medium mb-1">reddit_session <span className="text-danger">*</span></label>
                <input type="password" className="form-control form-control-sm" placeholder="Paste reddit_session cookie value" value={redditSessionCookie} onChange={e => setRedditSessionCookie(e.target.value)} />
              </div>
              <div className="col-md-4">
                <label className="form-label small fw-medium mb-1">token_v2 <span className="text-muted">(optional)</span></label>
                <input type="password" className="form-control form-control-sm" placeholder="Paste token_v2 value" value={redditTokenV2} onChange={e => setRedditTokenV2(e.target.value)} />
              </div>
            </div>
            <button
              className="btn btn-sm btn-primary"
              disabled={!redditSessionCookie.trim() || redditSaving}
              onClick={async () => {
                setRedditSaving(true);
                setRedditResult(null);
                try {
                  const res = await saveRedditSession(redditSessionCookie.trim(), redditTokenV2.trim() || undefined);
                  setRedditResult({ success: res.data.success, message: res.data.message });
                  if (res.data.success) {
                    setPlatforms(prev => prev ? { ...prev, reddit: { ...prev.reddit, ready: true, details: 'Session saved' } } : prev);
                    setRedditSessionCookie(''); setRedditTokenV2('');
                  }
                } catch (err: any) {
                  setRedditResult({ success: false, message: err?.response?.data?.error || 'Failed to save session' });
                }
                setRedditSaving(false);
              }}
            >
              {redditSaving ? 'Saving...' : 'Save Session'}
            </button>
            {redditResult && (<div className={`alert alert-${redditResult.success ? 'success' : 'danger'} mt-2 py-1 px-2 small mb-0`}>{redditResult.message}</div>)}
          </div>
        )}
      </div>
    </div>
  );
}
