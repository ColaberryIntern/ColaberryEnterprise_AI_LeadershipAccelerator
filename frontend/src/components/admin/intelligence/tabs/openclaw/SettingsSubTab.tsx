import { useState, useEffect } from 'react';
import {
  getOpenclawConfig,
  updateOpenclawConfig,
  saveLinkedInSession,
  getLinkedInSessionStatus,
  saveFacebookSession,
  getFacebookSessionStatus,
  getFacebookGroups,
  configureFacebookGroups,
  getConfiguredFacebookGroups,
  saveRedditSession,
  getRedditSessionStatus,
  FacebookGroup,
  FacebookGroupConfig,
} from '../../../../../services/openclawApi';
import { PLATFORM_COLORS, PLATFORM_STRATEGY, STRATEGY_BADGES } from './openclawUtils';

export default function SettingsSubTab() {
  // ── Governance Controls ──────────────────────────────────────────────────
  const [requireApproval, setRequireApproval] = useState(true);
  const [autoPostDevto, setAutoPostDevto] = useState(false);
  const [activePlatforms, setActivePlatforms] = useState<string[]>([
    'reddit', 'hackernews', 'devto', 'hashnode', 'discourse',
    'twitter', 'bluesky', 'youtube', 'producthunt', 'facebook_groups', 'linkedin_comments',
  ]);
  const [savingConfig, setSavingConfig] = useState<string | null>(null);

  // ── LinkedIn Session ─────────────────────────────────────────────────────
  const [liAtCookie, setLiAtCookie] = useState('');
  const [liLoggingIn, setLiLoggingIn] = useState(false);
  const [cookieResult, setCookieResult] = useState<{ success: boolean; message: string } | null>(null);
  const [linkedinSessionOk, setLinkedinSessionOk] = useState<boolean | null>(null);

  // ── Facebook Groups ──────────────────────────────────────────────────────
  const [fbCUser, setFbCUser] = useState('');
  const [fbXs, setFbXs] = useState('');
  const [fbSessionOk, setFbSessionOk] = useState<boolean | null>(null);
  const [fbSaving, setFbSaving] = useState(false);
  const [fbResult, setFbResult] = useState<{ success: boolean; message: string } | null>(null);
  const [fbGroups, setFbGroups] = useState<FacebookGroup[]>([]);
  const [fbConfiguredGroups, setFbConfiguredGroups] = useState<FacebookGroupConfig>({ target_groups: [], enabled: false });
  const [fbSelectedGroupIds, setFbSelectedGroupIds] = useState<Set<string>>(new Set());
  const [fbLoadingGroups, setFbLoadingGroups] = useState(false);

  // ── Reddit ───────────────────────────────────────────────────────────────
  const [redditSessionCookie, setRedditSessionCookie] = useState('');
  const [redditTokenV2, setRedditTokenV2] = useState('');
  const [redditSessionOk, setRedditSessionOk] = useState<boolean | null>(null);
  const [redditSaving, setRedditSaving] = useState(false);
  const [redditResult, setRedditResult] = useState<{ success: boolean; message: string } | null>(null);

  // ── Load initial state on mount ──────────────────────────────────────────
  useEffect(() => {
    // Governance config
    getOpenclawConfig().then(res => {
      const agents = res.data.agents || [];
      const content = agents.find((a: any) => a.agent_name === 'OpenclawContentResponseAgent');
      const worker = agents.find((a: any) => a.agent_name === 'OpenclawBrowserWorkerAgent');
      const scanner = agents.find((a: any) => a.agent_name === 'OpenclawMarketSignalAgent');
      if (content?.config?.require_approval !== undefined) setRequireApproval(content.config.require_approval);
      if (worker) setAutoPostDevto(worker.enabled);
      if (scanner?.config?.platforms) setActivePlatforms(scanner.config.platforms);
    }).catch(() => {});

    // LinkedIn session
    getLinkedInSessionStatus()
      .then(res => setLinkedinSessionOk(res.data.authenticated))
      .catch(() => {});

    // Facebook session + configured groups
    getFacebookSessionStatus()
      .then(res => setFbSessionOk(res.data.authenticated))
      .catch(() => {});

    getConfiguredFacebookGroups()
      .then(res => {
        setFbConfiguredGroups(res.data);
        setFbSelectedGroupIds(new Set(res.data.target_groups?.map((g: any) => g.id) || []));
      })
      .catch(() => {});

    // Reddit session
    getRedditSessionStatus()
      .then(res => setRedditSessionOk(res.data.authenticated))
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
    setSavingConfig(`platform-${platform}`);
    const updated = activePlatforms.includes(platform)
      ? activePlatforms.filter(p => p !== platform)
      : [...activePlatforms, platform];
    try {
      await updateOpenclawConfig({ agent_name: 'OpenclawMarketSignalAgent', config: { platforms: updated } });
      setActivePlatforms(updated);
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
        setLinkedinSessionOk(true);
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

  // ── Render ───────────────────────────────────────────────────────────────
  return (
    <div>
      {/* Governance Controls */}
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
          <div className="d-flex justify-content-between align-items-center mb-3">
            <div>
              <div className="fw-medium small">Auto-Post (Dev.to, Hashnode, Discourse)</div>
              <div className="text-muted" style={{ fontSize: '0.68rem' }}>When ON, approved responses are posted automatically via API to platforms with configured credentials.</div>
            </div>
            <div className="form-check form-switch ms-3">
              <input type="checkbox" className="form-check-input" role="switch" checked={autoPostDevto} onChange={handleToggleAutoPost} disabled={savingConfig === 'autopost'} />
            </div>
          </div>
          <hr className="my-2" />
          <div>
            <div className="fw-medium small mb-2">Active Scanning Platforms</div>
            <div className="text-muted mb-2" style={{ fontSize: '0.65rem' }}>
              Scan + Auto-Post: Dev.to, Hashnode, Discourse, Twitter, Bluesky, YouTube, Product Hunt, Facebook Groups, Reddit &bull; Manual Only: HN, LinkedIn Comments (no auto-posting)
            </div>
            <div className="d-flex gap-3 flex-wrap">
              {['reddit', 'hackernews', 'devto', 'hashnode', 'discourse', 'twitter', 'bluesky', 'youtube', 'producthunt', 'facebook_groups', 'linkedin_comments'].map(p => {
                const humanExec = ['hackernews', 'linkedin_comments', 'quora'].includes(p);
                const labelMap: Record<string, string> = { hackernews: 'Hacker News', devto: 'Dev.to', hashnode: 'Hashnode', discourse: 'Discourse Forums', twitter: 'Twitter/X', bluesky: 'Bluesky', youtube: 'YouTube', producthunt: 'Product Hunt', facebook_groups: 'Facebook Groups', linkedin_comments: 'LinkedIn Comments' };
                const label = labelMap[p] || p.charAt(0).toUpperCase() + p.slice(1);
                return (
                  <div className="form-check" key={p}>
                    <input type="checkbox" className="form-check-input" id={`platform-${p}`} checked={activePlatforms.includes(p)} onChange={() => handleTogglePlatform(p)} disabled={savingConfig === `platform-${p}`} />
                    <label className="form-check-label small" htmlFor={`platform-${p}`}>
                      {label}
                      {(() => { const s = PLATFORM_STRATEGY[p]; const b = s ? STRATEGY_BADGES[s] : null; return b ? <span className="badge ms-1" style={{ fontSize: '0.5rem', verticalAlign: 'middle', backgroundColor: b.bg, color: '#fff' }}>{b.label}</span> : null; })()}
                      {humanExec && <span className="badge bg-warning text-dark ms-1" style={{ fontSize: '0.5rem', verticalAlign: 'middle' }}>Manual</span>}
                    </label>
                  </div>
                );
              })}
              <div className="form-check">
                <input type="checkbox" className="form-check-input" disabled checked={false} />
                <label className="form-check-label small text-muted">Quora <span className="badge bg-secondary ms-1" style={{ fontSize: '0.55rem', verticalAlign: 'middle' }}>Manual Only</span></label>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* LinkedIn Session */}
      <div className="card border-0 shadow-sm mb-4">
        <div className="card-header bg-white fw-semibold small">
          LinkedIn Session
          <span className="badge ms-2" style={{ fontSize: '0.55rem', verticalAlign: 'middle', backgroundColor: '#0A66C2', color: '#fff' }}>LinkedIn</span>
          {linkedinSessionOk !== null && (
            <span className={`badge ms-2 bg-${linkedinSessionOk ? 'success' : 'danger'}`} style={{ fontSize: '0.55rem', verticalAlign: 'middle' }}>
              {linkedinSessionOk ? 'Connected' : 'Not Connected'}
            </span>
          )}
        </div>
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
      </div>

      {/* Facebook Groups Session & Config */}
      <div className="card border-0 shadow-sm mb-4">
        <div className="card-header bg-white fw-semibold small">
          Facebook Groups
          <span className="badge ms-2" style={{ fontSize: '0.55rem', verticalAlign: 'middle', backgroundColor: '#1877F2', color: '#fff' }}>Browser Auto-Post</span>
          {fbSessionOk !== null && (
            <span className={`badge ms-2 bg-${fbSessionOk ? 'success' : 'danger'}`} style={{ fontSize: '0.55rem', verticalAlign: 'middle' }}>
              {fbSessionOk ? 'Connected' : 'Not Connected'}
            </span>
          )}
        </div>
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
                    if (res.data.success) { setFbSessionOk(true); setFbCUser(''); setFbXs(''); }
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
          {fbSessionOk && (
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
      </div>

      {/* Reddit Session */}
      <div className="card border-0 shadow-sm mb-4">
        <div className="card-header bg-white fw-semibold small">
          Reddit
          <span className="badge ms-2" style={{ fontSize: '0.55rem', verticalAlign: 'middle', backgroundColor: '#FF4500', color: '#fff' }}>Browser Auto-Post</span>
          {redditSessionOk !== null && (
            <span className={`badge ms-2 bg-${redditSessionOk ? 'success' : 'danger'}`} style={{ fontSize: '0.55rem', verticalAlign: 'middle' }}>
              {redditSessionOk ? 'Session Saved' : 'Not Connected'}
            </span>
          )}
        </div>
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
                  setRedditSessionOk(true);
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
      </div>
    </div>
  );
}
