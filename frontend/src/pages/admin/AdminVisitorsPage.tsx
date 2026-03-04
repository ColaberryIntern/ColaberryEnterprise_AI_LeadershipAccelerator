import React, { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import api from '../../utils/api';
import Breadcrumb from '../../components/ui/Breadcrumb';
import Pagination from '../../components/ui/Pagination';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface Visitor {
  id: string;
  fingerprint: string;
  lead_id?: number;
  lead_name?: string;
  lead_email?: string;
  total_sessions: number;
  total_pageviews: number;
  first_seen_at: string;
  last_seen_at: string;
  utm_source?: string;
  referrer_domain?: string;
  device_type?: string;
  city?: string;
  region?: string;
  country?: string;
  // live-only fields
  current_page?: string;
  exit_page?: string;
  session_duration?: number;
  pageview_count?: number;
}

interface VisitorSession {
  id: string;
  started_at: string;
  ended_at?: string;
  duration: number;
  pageview_count: number;
  entry_page: string;
  exit_page: string;
  is_bounce: boolean;
  referrer_domain?: string;
  utm_source?: string;
  device_type?: string;
}

interface SessionEvent {
  id: string;
  event_type: string;
  page_url: string;
  created_at: string;
  payload?: any;
}

interface VisitorStats {
  liveCount: number;
  todaySessions: number;
  todayVisitors: number;
  visitors30d: number;
  sessions30d: number;
  avgDuration: number;
  bounceRate: number;
}

interface TopPage {
  page: string;
  views: number;
  unique_visitors: number;
}

interface TrafficSource {
  source: string;
  visitors: number;
  sessions: number;
}

type TabKey = 'live' | 'all' | 'analytics' | 'sessions';

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function formatDuration(seconds: number): string {
  if (!seconds || seconds < 0) return '0s';
  const m = Math.floor(seconds / 60);
  const s = Math.round(seconds % 60);
  return m > 0 ? `${m}m ${s}s` : `${s}s`;
}

function formatDate(dateStr: string): string {
  if (!dateStr) return '';
  return new Date(dateStr).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function formatRelative(dateStr: string): string {
  if (!dateStr) return '';
  const diff = (Date.now() - new Date(dateStr).getTime()) / 1000;
  if (diff < 60) return `${Math.round(diff)}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)} min ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)} hours ago`;
  if (diff < 172800) return 'Yesterday';
  return formatDate(dateStr);
}

function visitorLabel(v: Visitor): string {
  return v.lead_name || 'Anonymous';
}

function visitorSub(v: Visitor): string | null {
  return v.lead_name ? null : v.fingerprint?.slice(0, 8) ?? null;
}

/* Inline SVG icons */
const DesktopIcon = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
    <path d="M1 3a1 1 0 011-1h12a1 1 0 011 1v8a1 1 0 01-1 1H2a1 1 0 01-1-1V3zm1 0v8h12V3H2zm3 10h6v1H5v-1z" />
  </svg>
);
const MobileIcon = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
    <path d="M5 1a1 1 0 00-1 1v12a1 1 0 001 1h6a1 1 0 001-1V2a1 1 0 00-1-1H5zm0 1h6v12H5V2zm2 10h2v1H7v-1z" />
  </svg>
);
const TabletIcon = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
    <path d="M3 1a1 1 0 00-1 1v12a1 1 0 001 1h10a1 1 0 001-1V2a1 1 0 00-1-1H3zm0 1h10v12H3V2zm4 10h2v1H7v-1z" />
  </svg>
);

function DeviceIcon({ type }: { type?: string }) {
  if (type === 'mobile') return <MobileIcon />;
  if (type === 'tablet') return <TabletIcon />;
  return <DesktopIcon />;
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

function AdminVisitorsPage() {
  /* --- Tab state --- */
  const [activeTab, setActiveTab] = useState<TabKey>('live');

  /* --- Live visitors --- */
  const [liveVisitors, setLiveVisitors] = useState<Visitor[]>([]);
  const [loading, setLoading] = useState(true);

  /* --- All visitors --- */
  const [allVisitors, setAllVisitors] = useState<Visitor[]>([]);
  const [allTotal, setAllTotal] = useState(0);
  const [allPage, setAllPage] = useState(1);
  const [allTotalPages, setAllTotalPages] = useState(1);

  /* --- Analytics --- */
  const [stats, setStats] = useState<VisitorStats | null>(null);
  const [topPages, setTopPages] = useState<TopPage[]>([]);
  const [trafficSources, setTrafficSources] = useState<TrafficSource[]>([]);

  /* --- Sessions --- */
  const [sessions, setSessions] = useState<VisitorSession[]>([]);

  /* --- Detail modal --- */
  const [selectedVisitor, setSelectedVisitor] = useState<Visitor | null>(null);
  const [visitorSessions, setVisitorSessions] = useState<VisitorSession[]>([]);
  const [expandedSession, setExpandedSession] = useState<string | null>(null);
  const [sessionEvents, setSessionEvents] = useState<Record<string, SessionEvent[]>>({});

  /* --- Filters --- */
  const [filters, setFilters] = useState({
    search: '',
    identified: '',
    dateFrom: '',
    dateTo: '',
  });

  /* ---------------------------------------------------------------- */
  /*  Data fetchers                                                    */
  /* ---------------------------------------------------------------- */

  const fetchLive = useCallback(async () => {
    try {
      const res = await api.get('/api/admin/visitors/live');
      setLiveVisitors(res.data.visitors || []);
    } catch (err) {
      console.error('Failed to fetch live visitors:', err);
    }
  }, []);

  const fetchStats = useCallback(async () => {
    try {
      const res = await api.get('/api/admin/visitors/stats');
      setStats(res.data.stats || res.data);
    } catch (err) {
      console.error('Failed to fetch visitor stats:', err);
    }
  }, []);

  const fetchAllVisitors = useCallback(async () => {
    try {
      const params: Record<string, string> = { page: String(allPage), limit: '25' };
      if (filters.search) params.search = filters.search;
      if (filters.identified) params.identified = filters.identified;
      if (filters.dateFrom) params.dateFrom = filters.dateFrom;
      if (filters.dateTo) params.dateTo = filters.dateTo;
      const res = await api.get('/api/admin/visitors', { params });
      setAllVisitors(res.data.visitors || []);
      setAllTotal(res.data.total || 0);
      setAllTotalPages(res.data.totalPages || 1);
    } catch (err) {
      console.error('Failed to fetch visitors:', err);
    }
  }, [allPage, filters]);

  const fetchAnalytics = useCallback(async () => {
    try {
      const [trendRes, topRes, srcRes] = await Promise.all([
        api.get('/api/admin/visitors/trend'),
        api.get('/api/admin/visitors/stats'),
        api.get('/api/admin/visitors/stats'),
      ]);
      setTopPages(trendRes.data.topPages || []);
      setTrafficSources(trendRes.data.trafficSources || []);
      setStats(topRes.data.stats || topRes.data);
    } catch (err) {
      console.error('Failed to fetch analytics:', err);
    }
  }, []);

  const fetchSessions = useCallback(async () => {
    try {
      const res = await api.get('/api/admin/visitors/stats');
      // Sessions endpoint — fall back to stats sessions if separate endpoint not available
      const sessRes = await api.get('/api/admin/sessions', { params: { limit: '50' } }).catch(() => null);
      setSessions(sessRes?.data?.sessions || res.data.recentSessions || []);
    } catch (err) {
      console.error('Failed to fetch sessions:', err);
    }
  }, []);

  const fetchVisitorDetail = async (visitor: Visitor) => {
    setSelectedVisitor(visitor);
    setVisitorSessions([]);
    setExpandedSession(null);
    setSessionEvents({});
    try {
      const res = await api.get(`/api/admin/visitors/${visitor.id}/sessions`);
      setVisitorSessions(res.data.sessions || []);
    } catch (err) {
      console.error('Failed to fetch visitor sessions:', err);
    }
  };

  const fetchSessionEvents = async (sessionId: string) => {
    if (sessionEvents[sessionId]) {
      setExpandedSession(expandedSession === sessionId ? null : sessionId);
      return;
    }
    try {
      const res = await api.get(`/api/admin/sessions/${sessionId}/events`);
      setSessionEvents((prev) => ({ ...prev, [sessionId]: res.data.events || [] }));
      setExpandedSession(sessionId);
    } catch (err) {
      console.error('Failed to fetch session events:', err);
    }
  };

  /* ---------------------------------------------------------------- */
  /*  Effects                                                          */
  /* ---------------------------------------------------------------- */

  // Initial load + tab-based data fetching
  useEffect(() => {
    setLoading(true);
    if (activeTab === 'live') {
      Promise.all([fetchLive(), fetchStats()]).finally(() => setLoading(false));
    } else if (activeTab === 'all') {
      fetchAllVisitors().finally(() => setLoading(false));
    } else if (activeTab === 'analytics') {
      fetchAnalytics().finally(() => setLoading(false));
    } else if (activeTab === 'sessions') {
      fetchSessions().finally(() => setLoading(false));
    }
  }, [activeTab, fetchLive, fetchStats, fetchAllVisitors, fetchAnalytics, fetchSessions]);

  // Auto-refresh for live tab
  useEffect(() => {
    if (activeTab !== 'live') return;
    const interval = setInterval(() => {
      fetchLive();
      fetchStats();
    }, 30000);
    return () => clearInterval(interval);
  }, [activeTab, fetchLive, fetchStats]);

  /* ---------------------------------------------------------------- */
  /*  Filter helpers                                                   */
  /* ---------------------------------------------------------------- */

  const updateFilter = (key: string, value: string) => {
    setFilters((prev) => ({ ...prev, [key]: value }));
    setAllPage(1);
  };

  const clearFilters = () => {
    setFilters({ search: '', identified: '', dateFrom: '', dateTo: '' });
    setAllPage(1);
  };

  const hasFilters = filters.search || filters.identified || filters.dateFrom || filters.dateTo;

  /* ---------------------------------------------------------------- */
  /*  Render helpers                                                   */
  /* ---------------------------------------------------------------- */

  const renderVisitorCell = (v: Visitor) => (
    <div>
      <span className="fw-medium">{visitorLabel(v)}</span>
      {visitorSub(v) && (
        <span className="ms-1" style={{ color: 'var(--color-text-light)', fontSize: '0.75rem' }}>
          {visitorSub(v)}
        </span>
      )}
    </div>
  );

  const renderStatusBadge = (v: Visitor) =>
    v.lead_id ? (
      <span className="badge bg-success">Known</span>
    ) : (
      <span className="badge bg-secondary">Anonymous</span>
    );

  /* ---------------------------------------------------------------- */
  /*  Tab content                                                      */
  /* ---------------------------------------------------------------- */

  const renderLiveTab = () => (
    <>
      {/* Live stats row */}
      {stats && (
        <div className="row g-3 mb-4">
          <div className="col-sm-4">
            <div className="card border-0 shadow-sm">
              <div className="card-body p-3" style={{ borderLeft: '4px solid #38a169' }}>
                <div className="text-muted small d-flex align-items-center gap-1">
                  <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#38a169', display: 'inline-block' }} />
                  Live Now
                </div>
                <div className="h4 fw-bold mb-0">{stats.liveCount ?? liveVisitors.length}</div>
              </div>
            </div>
          </div>
          <div className="col-sm-4">
            <div className="card border-0 shadow-sm">
              <div className="card-body p-3" style={{ borderLeft: '4px solid #2b6cb0' }}>
                <div className="text-muted small">Sessions Today</div>
                <div className="h4 fw-bold mb-0">{stats.todaySessions ?? 0}</div>
              </div>
            </div>
          </div>
          <div className="col-sm-4">
            <div className="card border-0 shadow-sm">
              <div className="card-body p-3" style={{ borderLeft: '4px solid #1a365d' }}>
                <div className="text-muted small">Visitors Today</div>
                <div className="h4 fw-bold mb-0">{stats.todayVisitors ?? 0}</div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Live visitors table */}
      <div className="card border-0 shadow-sm">
        <div className="card-header bg-white fw-semibold d-flex justify-content-between align-items-center">
          <span>Active Visitors ({liveVisitors.length})</span>
          <span className="text-muted small">Auto-refreshes every 30s</span>
        </div>
        <div className="card-body p-0">
          <div className="table-responsive">
            <table className="table table-hover mb-0">
              <thead className="table-light">
                <tr>
                  <th>Visitor</th>
                  <th>Status</th>
                  <th>Current Page</th>
                  <th>Duration</th>
                  <th>Pages</th>
                  <th>Referrer</th>
                  <th>Device</th>
                  <th>City</th>
                </tr>
              </thead>
              <tbody>
                {liveVisitors.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="text-center text-muted py-4">
                      No visitors currently on the site.
                    </td>
                  </tr>
                ) : (
                  liveVisitors.map((v) => (
                    <tr
                      key={v.id}
                      style={{ cursor: 'pointer' }}
                      onClick={() => fetchVisitorDetail(v)}
                    >
                      <td>{renderVisitorCell(v)}</td>
                      <td>{renderStatusBadge(v)}</td>
                      <td className="small text-truncate" style={{ maxWidth: 200 }}>
                        {v.current_page || v.exit_page || '-'}
                      </td>
                      <td className="text-nowrap small">{formatDuration(v.session_duration || 0)}</td>
                      <td>{v.pageview_count ?? v.total_pageviews ?? 0}</td>
                      <td className="small">{v.referrer_domain || 'Direct'}</td>
                      <td><DeviceIcon type={v.device_type} /></td>
                      <td className="small">{v.city || '-'}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </>
  );

  const renderAllTab = () => (
    <>
      {/* Filters */}
      <div className="card border-0 shadow-sm mb-4">
        <div className="card-body">
          <div className="d-flex gap-2 mb-0 flex-wrap align-items-center">
            <input
              type="text"
              className="form-control form-control-sm"
              style={{ maxWidth: 220 }}
              placeholder="Search name, email, fingerprint..."
              value={filters.search}
              onChange={(e) => updateFilter('search', e.target.value)}
              aria-label="Search visitors"
            />
            <select
              className="form-select form-select-sm"
              style={{ maxWidth: 150 }}
              value={filters.identified}
              onChange={(e) => updateFilter('identified', e.target.value)}
            >
              <option value="">All Visitors</option>
              <option value="true">Known</option>
              <option value="false">Anonymous</option>
            </select>
            <input
              type="date"
              className="form-control form-control-sm"
              style={{ maxWidth: 150 }}
              value={filters.dateFrom}
              onChange={(e) => updateFilter('dateFrom', e.target.value)}
              aria-label="Date from"
            />
            <input
              type="date"
              className="form-control form-control-sm"
              style={{ maxWidth: 150 }}
              value={filters.dateTo}
              onChange={(e) => updateFilter('dateTo', e.target.value)}
              aria-label="Date to"
            />
            {hasFilters && (
              <button className="btn btn-sm btn-outline-secondary" onClick={clearFilters}>
                Clear
              </button>
            )}
          </div>
        </div>
      </div>

      {/* All visitors table */}
      <div className="card border-0 shadow-sm">
        <div className="card-header bg-white fw-semibold">
          Visitors ({allTotal})
        </div>
        <div className="card-body p-0">
          <div className="table-responsive">
            <table className="table table-hover mb-0">
              <thead className="table-light">
                <tr>
                  <th>Visitor</th>
                  <th>Status</th>
                  <th>Sessions</th>
                  <th>Pageviews</th>
                  <th>First Seen</th>
                  <th>Last Seen</th>
                  <th>Source</th>
                  <th>Device</th>
                </tr>
              </thead>
              <tbody>
                {allVisitors.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="text-center text-muted py-4">
                      {hasFilters ? 'No visitors match the current filters.' : 'No visitor data yet.'}
                    </td>
                  </tr>
                ) : (
                  allVisitors.map((v) => (
                    <tr
                      key={v.id}
                      style={{ cursor: 'pointer' }}
                      onClick={() => fetchVisitorDetail(v)}
                    >
                      <td>{renderVisitorCell(v)}</td>
                      <td>{renderStatusBadge(v)}</td>
                      <td>{v.total_sessions ?? 0}</td>
                      <td>{v.total_pageviews ?? 0}</td>
                      <td className="text-nowrap small">{formatDate(v.first_seen_at)}</td>
                      <td className="text-nowrap small">{formatRelative(v.last_seen_at)}</td>
                      <td className="small">{v.utm_source || v.referrer_domain || 'Direct'}</td>
                      <td><DeviceIcon type={v.device_type} /></td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
        <div className="card-footer bg-white d-flex justify-content-between align-items-center">
          <span className="text-muted small">Page {allPage} of {allTotalPages}</span>
          <Pagination page={allPage} totalPages={allTotalPages} onPageChange={setAllPage} />
        </div>
      </div>
    </>
  );

  const renderAnalyticsTab = () => (
    <>
      {/* Stats cards */}
      {stats && (
        <div className="row g-3 mb-4">
          <div className="col-6 col-lg-3">
            <div className="card border-0 shadow-sm">
              <div className="card-body p-3" style={{ borderLeft: '4px solid #1a365d' }}>
                <div className="text-muted small">Visitors (30d)</div>
                <div className="h4 fw-bold mb-0">{stats.visitors30d ?? 0}</div>
              </div>
            </div>
          </div>
          <div className="col-6 col-lg-3">
            <div className="card border-0 shadow-sm">
              <div className="card-body p-3" style={{ borderLeft: '4px solid #2b6cb0' }}>
                <div className="text-muted small">Sessions (30d)</div>
                <div className="h4 fw-bold mb-0">{stats.sessions30d ?? 0}</div>
              </div>
            </div>
          </div>
          <div className="col-6 col-lg-3">
            <div className="card border-0 shadow-sm">
              <div className="card-body p-3" style={{ borderLeft: '4px solid #38a169' }}>
                <div className="text-muted small">Avg Duration</div>
                <div className="h4 fw-bold mb-0">{formatDuration(stats.avgDuration ?? 0)}</div>
              </div>
            </div>
          </div>
          <div className="col-6 col-lg-3">
            <div className="card border-0 shadow-sm">
              <div className="card-body p-3" style={{ borderLeft: '4px solid #e53e3e' }}>
                <div className="text-muted small">Bounce Rate</div>
                <div className="h4 fw-bold mb-0">{stats.bounceRate != null ? `${stats.bounceRate}%` : '-'}</div>
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="row g-4">
        {/* Top Pages */}
        <div className="col-lg-6">
          <div className="card border-0 shadow-sm">
            <div className="card-header bg-white fw-semibold">Top Pages</div>
            <div className="card-body p-0">
              <div className="table-responsive">
                <table className="table table-hover mb-0">
                  <thead className="table-light">
                    <tr>
                      <th>Page</th>
                      <th>Views</th>
                      <th>Unique Visitors</th>
                    </tr>
                  </thead>
                  <tbody>
                    {topPages.length === 0 ? (
                      <tr>
                        <td colSpan={3} className="text-center text-muted py-3">No page data yet.</td>
                      </tr>
                    ) : (
                      topPages.map((p, i) => (
                        <tr key={i}>
                          <td className="small text-truncate" style={{ maxWidth: 250 }}>{p.page}</td>
                          <td>{p.views}</td>
                          <td>{p.unique_visitors}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>

        {/* Traffic Sources */}
        <div className="col-lg-6">
          <div className="card border-0 shadow-sm">
            <div className="card-header bg-white fw-semibold">Traffic Sources</div>
            <div className="card-body p-0">
              <div className="table-responsive">
                <table className="table table-hover mb-0">
                  <thead className="table-light">
                    <tr>
                      <th>Source</th>
                      <th>Visitors</th>
                      <th>Sessions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {trafficSources.length === 0 ? (
                      <tr>
                        <td colSpan={3} className="text-center text-muted py-3">No source data yet.</td>
                      </tr>
                    ) : (
                      trafficSources.map((s, i) => (
                        <tr key={i}>
                          <td className="small">{s.source || 'Direct'}</td>
                          <td>{s.visitors}</td>
                          <td>{s.sessions}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );

  const renderSessionsTab = () => (
    <div className="card border-0 shadow-sm">
      <div className="card-header bg-white fw-semibold">Recent Sessions</div>
      <div className="card-body p-0">
        <div className="table-responsive">
          <table className="table table-hover mb-0">
            <thead className="table-light">
              <tr>
                <th>Visitor</th>
                <th>Started</th>
                <th>Duration</th>
                <th>Pages</th>
                <th>Entry Page</th>
                <th>Exit Page</th>
                <th>Bounce</th>
                <th>Source</th>
              </tr>
            </thead>
            <tbody>
              {sessions.length === 0 ? (
                <tr>
                  <td colSpan={8} className="text-center text-muted py-4">No session data yet.</td>
                </tr>
              ) : (
                sessions.map((s) => (
                  <tr key={s.id}>
                    <td className="fw-medium small">
                      {(s as any).visitor_name || (s as any).lead_name || 'Anonymous'}
                    </td>
                    <td className="text-nowrap small">{formatDate(s.started_at)}</td>
                    <td className="text-nowrap small">{formatDuration(s.duration)}</td>
                    <td>{s.pageview_count}</td>
                    <td className="small text-truncate" style={{ maxWidth: 180 }}>{s.entry_page || '-'}</td>
                    <td className="small text-truncate" style={{ maxWidth: 180 }}>{s.exit_page || '-'}</td>
                    <td>
                      {s.is_bounce ? (
                        <span className="badge bg-warning text-dark">Yes</span>
                      ) : (
                        <span className="badge bg-light text-dark">No</span>
                      )}
                    </td>
                    <td className="small">{s.referrer_domain || 'Direct'}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );

  /* ---------------------------------------------------------------- */
  /*  Visitor Detail Modal                                             */
  /* ---------------------------------------------------------------- */

  const renderDetailModal = () => {
    if (!selectedVisitor) return null;
    const v = selectedVisitor;

    return (
      <>
        {/* Backdrop */}
        <div
          className="modal-backdrop show"
          style={{ zIndex: 1040 }}
          onClick={() => setSelectedVisitor(null)}
        />
        {/* Modal */}
        <div
          className="modal show d-block"
          style={{ zIndex: 1050 }}
          role="dialog"
          aria-modal="true"
          aria-label="Visitor detail"
          onClick={() => setSelectedVisitor(null)}
        >
          <div
            className="modal-dialog modal-lg modal-dialog-scrollable"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="modal-content">
              <div className="modal-header">
                <h5 className="modal-title fw-bold" style={{ color: 'var(--color-primary)' }}>
                  {v.lead_name || 'Anonymous Visitor'}
                </h5>
                <button
                  type="button"
                  className="btn-close"
                  onClick={() => setSelectedVisitor(null)}
                  aria-label="Close"
                />
              </div>
              <div className="modal-body">
                {/* Link to lead page if identified */}
                {v.lead_id && (
                  <div className="mb-3">
                    <Link
                      to={`/admin/leads/${v.lead_id}`}
                      className="btn btn-sm btn-outline-primary"
                    >
                      View Lead Profile
                    </Link>
                  </div>
                )}

                {/* Visitor info */}
                <div className="row g-3 mb-4">
                  <div className="col-sm-6">
                    <div className="small text-muted">First Seen</div>
                    <div className="fw-medium">{formatDate(v.first_seen_at)}</div>
                  </div>
                  <div className="col-sm-6">
                    <div className="small text-muted">Last Seen</div>
                    <div className="fw-medium">{formatRelative(v.last_seen_at)}</div>
                  </div>
                  <div className="col-sm-4">
                    <div className="small text-muted">Total Sessions</div>
                    <div className="fw-medium">{v.total_sessions ?? 0}</div>
                  </div>
                  <div className="col-sm-4">
                    <div className="small text-muted">Total Pageviews</div>
                    <div className="fw-medium">{v.total_pageviews ?? 0}</div>
                  </div>
                  <div className="col-sm-4">
                    <div className="small text-muted">Device</div>
                    <div className="fw-medium d-flex align-items-center gap-1">
                      <DeviceIcon type={v.device_type} />
                      {v.device_type || 'desktop'}
                    </div>
                  </div>
                  <div className="col-sm-6">
                    <div className="small text-muted">Location</div>
                    <div className="fw-medium">
                      {[v.city, v.region, v.country].filter(Boolean).join(', ') || '-'}
                    </div>
                  </div>
                  <div className="col-sm-6">
                    <div className="small text-muted">Source</div>
                    <div className="fw-medium">{v.utm_source || v.referrer_domain || 'Direct'}</div>
                  </div>
                </div>

                {/* Sessions list */}
                <h6 className="fw-semibold mb-3" style={{ color: 'var(--color-primary)' }}>
                  Sessions ({visitorSessions.length})
                </h6>
                {visitorSessions.length === 0 ? (
                  <p className="text-muted small">No sessions recorded.</p>
                ) : (
                  visitorSessions.map((s) => (
                    <div key={s.id} className="border rounded mb-2">
                      <div
                        className="d-flex justify-content-between align-items-center px-3 py-2"
                        style={{ cursor: 'pointer', background: expandedSession === s.id ? 'var(--color-bg-alt, #f7fafc)' : 'transparent' }}
                        onClick={() => fetchSessionEvents(s.id)}
                      >
                        <div className="small">
                          <span className="fw-medium">{formatDate(s.started_at)}</span>
                          <span className="text-muted ms-2">{formatDuration(s.duration)}</span>
                          <span className="text-muted ms-2">{s.pageview_count} pages</span>
                        </div>
                        <div className="small text-muted">
                          {s.entry_page}
                          <span className="mx-1">&rarr;</span>
                          {s.exit_page}
                        </div>
                      </div>
                      {/* Expanded events */}
                      {expandedSession === s.id && sessionEvents[s.id] && (
                        <div className="border-top px-3 py-2" style={{ background: 'var(--color-bg-alt, #f7fafc)' }}>
                          {sessionEvents[s.id].length === 0 ? (
                            <div className="text-muted small">No events recorded.</div>
                          ) : (
                            <table className="table table-sm mb-0" style={{ fontSize: '0.8rem' }}>
                              <thead>
                                <tr>
                                  <th className="border-0">Time</th>
                                  <th className="border-0">Event</th>
                                  <th className="border-0">Page</th>
                                </tr>
                              </thead>
                              <tbody>
                                {sessionEvents[s.id].map((evt) => (
                                  <tr key={evt.id}>
                                    <td className="text-muted text-nowrap">
                                      {new Date(evt.created_at).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                                    </td>
                                    <td>
                                      <span className="badge bg-light text-dark">{evt.event_type}</span>
                                    </td>
                                    <td className="text-truncate" style={{ maxWidth: 200 }}>
                                      {evt.page_url || '-'}
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          )}
                        </div>
                      )}
                    </div>
                  ))
                )}
              </div>
              <div className="modal-footer">
                <button className="btn btn-sm btn-outline-secondary" onClick={() => setSelectedVisitor(null)}>
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      </>
    );
  };

  /* ---------------------------------------------------------------- */
  /*  Main render                                                      */
  /* ---------------------------------------------------------------- */

  if (loading) {
    return (
      <>
        <Breadcrumb items={[{ label: 'Dashboard', to: '/admin/dashboard' }, { label: 'Visitors' }]} />
        <div className="text-center py-5">
          <div className="spinner-border text-primary" role="status">
            <span className="visually-hidden">Loading visitor data...</span>
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      <Breadcrumb items={[{ label: 'Dashboard', to: '/admin/dashboard' }, { label: 'Visitors' }]} />

      <div className="d-flex justify-content-between align-items-center mb-4">
        <h1 className="h3 fw-bold mb-0" style={{ color: 'var(--color-primary)' }}>
          Visitor Intelligence
        </h1>
      </div>

      {/* Tab navigation */}
      <nav>
        <ul className="nav nav-tabs mb-4">
          {([
            { key: 'live' as TabKey, label: 'Live Visitors' },
            { key: 'all' as TabKey, label: 'All Visitors' },
            { key: 'analytics' as TabKey, label: 'Analytics' },
            { key: 'sessions' as TabKey, label: 'Sessions' },
          ]).map((tab) => (
            <li className="nav-item" key={tab.key}>
              <button
                className={`nav-link${activeTab === tab.key ? ' active' : ''}`}
                onClick={() => setActiveTab(tab.key)}
                type="button"
              >
                {tab.label}
                {tab.key === 'live' && liveVisitors.length > 0 && (
                  <span className="badge bg-success ms-2">{liveVisitors.length}</span>
                )}
              </button>
            </li>
          ))}
        </ul>
      </nav>

      {/* Tab content */}
      {activeTab === 'live' && renderLiveTab()}
      {activeTab === 'all' && renderAllTab()}
      {activeTab === 'analytics' && renderAnalyticsTab()}
      {activeTab === 'sessions' && renderSessionsTab()}

      {/* Visitor detail modal */}
      {renderDetailModal()}
    </>
  );
}

export default AdminVisitorsPage;
