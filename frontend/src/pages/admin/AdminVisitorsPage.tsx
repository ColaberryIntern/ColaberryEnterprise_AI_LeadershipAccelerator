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
  // intent fields
  intent_score?: number | null;
  intent_level?: string | null;
  intentScore?: {
    score: number;
    intent_level: string;
    signals_count: number;
    last_signal_at?: string;
    score_updated_at?: string;
  } | null;
}

interface BehavioralSignalData {
  id: string;
  signal_type: string;
  signal_strength: number;
  context?: Record<string, any>;
  detected_at: string;
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

interface ChatConversationData {
  id: string;
  visitor_id: string;
  status: string;
  started_at: string;
  ended_at?: string;
  message_count: number;
  visitor_message_count: number;
  page_url?: string;
  page_category?: string;
  trigger_type: string;
  summary?: string;
  visitor?: {
    id: string;
    fingerprint: string;
    lead?: { id: number; name: string; email: string; company?: string } | null;
  };
}

interface ChatMessageData2 {
  id: string;
  role: string;
  content: string;
  timestamp: string;
}

type TabKey = 'live' | 'all' | 'high_intent' | 'analytics' | 'sessions' | 'chat';

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

function IntentBadge({ score, level }: { score?: number | null; level?: string | null }) {
  if (score == null && !level) return <span className="text-muted small">-</span>;
  const displayScore = score ?? 0;
  const displayLevel = level || 'low';
  const badgeClass =
    displayLevel === 'very_high' ? 'bg-danger' :
    displayLevel === 'high' ? 'bg-warning text-dark' :
    displayLevel === 'medium' ? 'bg-info text-dark' :
    'bg-light text-dark';
  const labelText =
    displayLevel === 'very_high' ? 'Very High' :
    displayLevel === 'high' ? 'High' :
    displayLevel === 'medium' ? 'Medium' : 'Low';

  return (
    <span className={`badge ${badgeClass}`} title={`Intent Score: ${displayScore}/100`}>
      {displayScore} {labelText}
    </span>
  );
}

function getIntentScore(v: Visitor): number | null {
  return v.intent_score ?? v.intentScore?.score ?? null;
}

function getIntentLevel(v: Visitor): string | null {
  return v.intent_level ?? v.intentScore?.intent_level ?? null;
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

  /* --- High Intent --- */
  const [highIntentVisitors, setHighIntentVisitors] = useState<any[]>([]);

  /* --- Detail modal signals --- */
  const [visitorSignals, setVisitorSignals] = useState<BehavioralSignalData[]>([]);
  const [visitorIntentScore, setVisitorIntentScore] = useState<any>(null);

  /* --- Chat --- */
  const [chatConversations, setChatConversations] = useState<ChatConversationData[]>([]);
  const [chatTotal, setChatTotal] = useState(0);
  const [chatPage, setChatPage] = useState(1);
  const [chatTotalPages, setChatTotalPages] = useState(1);
  const [chatStats, setChatStats] = useState<{ total_conversations: number; active_conversations: number; today_conversations: number; avg_messages: number } | null>(null);
  const [selectedConversation, setSelectedConversation] = useState<ChatConversationData | null>(null);
  const [conversationMessages, setConversationMessages] = useState<ChatMessageData2[]>([]);

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

  const fetchHighIntent = useCallback(async () => {
    try {
      const res = await api.get('/api/admin/visitors/high-intent', { params: { threshold: 20, limit: 50 } });
      setHighIntentVisitors(res.data || []);
    } catch (err) {
      console.error('Failed to fetch high intent visitors:', err);
    }
  }, []);

  const fetchChat = useCallback(async () => {
    try {
      const [convRes, statsRes] = await Promise.all([
        api.get('/api/admin/chat/conversations', { params: { page: chatPage, limit: 25 } }),
        api.get('/api/admin/chat/stats'),
      ]);
      setChatConversations(convRes.data.conversations || []);
      setChatTotal(convRes.data.total || 0);
      setChatTotalPages(convRes.data.totalPages || 1);
      setChatStats(statsRes.data || null);
    } catch (err) {
      console.error('Failed to fetch chat data:', err);
    }
  }, [chatPage]);

  const fetchConversationDetail = async (conv: ChatConversationData) => {
    setSelectedConversation(conv);
    try {
      const res = await api.get(`/api/admin/chat/conversations/${conv.id}`);
      setConversationMessages(res.data?.messages || []);
    } catch (err) {
      console.error('Failed to fetch conversation detail:', err);
    }
  };

  const fetchVisitorDetail = async (visitor: Visitor) => {
    setSelectedVisitor(visitor);
    setVisitorSessions([]);
    setExpandedSession(null);
    setSessionEvents({});
    setVisitorSignals([]);
    setVisitorIntentScore(null);
    try {
      const [sessRes, intentRes] = await Promise.all([
        api.get(`/api/admin/visitors/${visitor.id}/sessions`),
        api.get(`/api/admin/visitors/${visitor.id}/intent`).catch(() => null),
      ]);
      setVisitorSessions(sessRes.data.sessions || sessRes.data || []);
      if (intentRes?.data) {
        setVisitorIntentScore(intentRes.data.intent);
        setVisitorSignals(intentRes.data.recent_signals || []);
      }
    } catch (err) {
      console.error('Failed to fetch visitor detail:', err);
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
    } else if (activeTab === 'high_intent') {
      fetchHighIntent().finally(() => setLoading(false));
    } else if (activeTab === 'analytics') {
      fetchAnalytics().finally(() => setLoading(false));
    } else if (activeTab === 'sessions') {
      fetchSessions().finally(() => setLoading(false));
    } else if (activeTab === 'chat') {
      fetchChat().finally(() => setLoading(false));
    }
  }, [activeTab, fetchLive, fetchStats, fetchAllVisitors, fetchHighIntent, fetchAnalytics, fetchSessions, fetchChat]);

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
                  <th>Intent</th>
                  <th>Current Page</th>
                  <th>Duration</th>
                  <th>Pages</th>
                  <th>Referrer</th>
                  <th>Device</th>
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
                      <td><IntentBadge score={getIntentScore(v)} level={getIntentLevel(v)} /></td>
                      <td className="small text-truncate" style={{ maxWidth: 200 }}>
                        {v.current_page || v.exit_page || '-'}
                      </td>
                      <td className="text-nowrap small">{formatDuration(v.session_duration || 0)}</td>
                      <td>{v.pageview_count ?? v.total_pageviews ?? 0}</td>
                      <td className="small">{v.referrer_domain || 'Direct'}</td>
                      <td><DeviceIcon type={v.device_type} /></td>
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
                  <th>Intent</th>
                  <th>Sessions</th>
                  <th>Pageviews</th>
                  <th>First Seen</th>
                  <th>Last Seen</th>
                  <th>Source</th>
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
                      <td><IntentBadge score={getIntentScore(v)} level={getIntentLevel(v)} /></td>
                      <td>{v.total_sessions ?? 0}</td>
                      <td>{v.total_pageviews ?? 0}</td>
                      <td className="text-nowrap small">{formatDate(v.first_seen_at)}</td>
                      <td className="text-nowrap small">{formatRelative(v.last_seen_at)}</td>
                      <td className="small">{v.utm_source || v.referrer_domain || 'Direct'}</td>
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

  const renderHighIntentTab = () => (
    <div className="card border-0 shadow-sm">
      <div className="card-header bg-white fw-semibold d-flex justify-content-between align-items-center">
        <span>High Intent Visitors ({highIntentVisitors.length})</span>
        <span className="text-muted small">Score 20+ (decayed over 7-day half-life)</span>
      </div>
      <div className="card-body p-0">
        <div className="table-responsive">
          <table className="table table-hover mb-0">
            <thead className="table-light">
              <tr>
                <th>Visitor</th>
                <th>Intent Score</th>
                <th>Intent Level</th>
                <th>Signals</th>
                <th>Last Signal</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {highIntentVisitors.length === 0 ? (
                <tr>
                  <td colSpan={6} className="text-center text-muted py-4">
                    No high-intent visitors detected yet. Signals accumulate as visitors browse.
                  </td>
                </tr>
              ) : (
                highIntentVisitors.map((item: any) => {
                  const visitor = item.visitor;
                  const lead = visitor?.lead;
                  return (
                    <tr
                      key={item.id}
                      style={{ cursor: 'pointer' }}
                      onClick={() => visitor && fetchVisitorDetail({
                        id: visitor.id,
                        fingerprint: visitor.fingerprint,
                        lead_id: lead?.id,
                        lead_name: lead?.name,
                        total_sessions: 0,
                        total_pageviews: 0,
                        first_seen_at: '',
                        last_seen_at: visitor.last_seen_at || '',
                      })}
                    >
                      <td>
                        <span className="fw-medium">{lead?.name || 'Anonymous'}</span>
                        {!lead && visitor?.fingerprint && (
                          <span className="ms-1 text-muted" style={{ fontSize: '0.75rem' }}>
                            {visitor.fingerprint.slice(0, 8)}
                          </span>
                        )}
                      </td>
                      <td>
                        <span className="fw-bold" style={{ fontSize: '1.1rem' }}>{item.score}</span>
                        <span className="text-muted small">/100</span>
                      </td>
                      <td><IntentBadge score={item.score} level={item.intent_level} /></td>
                      <td>{item.signals_count}</td>
                      <td className="text-nowrap small">
                        {item.last_signal_at ? formatRelative(item.last_signal_at) : '-'}
                      </td>
                      <td>
                        {lead ? (
                          <span className="badge bg-success">Known</span>
                        ) : (
                          <span className="badge bg-secondary">Anonymous</span>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );

  const renderChatTab = () => (
    <div>
      {/* Chat stats cards */}
      {chatStats && (
        <div className="row g-3 mb-4">
          <div className="col-6 col-lg-3">
            <div className="card border-0 shadow-sm">
              <div className="card-body p-3" style={{ borderLeft: '4px solid var(--color-primary, #1a365d)' }}>
                <div className="text-muted small">Total Conversations</div>
                <div className="h4 fw-bold mb-0">{chatStats.total_conversations}</div>
              </div>
            </div>
          </div>
          <div className="col-6 col-lg-3">
            <div className="card border-0 shadow-sm">
              <div className="card-body p-3" style={{ borderLeft: '4px solid #38a169' }}>
                <div className="text-muted small">Active Now</div>
                <div className="h4 fw-bold mb-0">{chatStats.active_conversations}</div>
              </div>
            </div>
          </div>
          <div className="col-6 col-lg-3">
            <div className="card border-0 shadow-sm">
              <div className="card-body p-3" style={{ borderLeft: '4px solid #2b6cb0' }}>
                <div className="text-muted small">Today</div>
                <div className="h4 fw-bold mb-0">{chatStats.today_conversations}</div>
              </div>
            </div>
          </div>
          <div className="col-6 col-lg-3">
            <div className="card border-0 shadow-sm">
              <div className="card-body p-3" style={{ borderLeft: '4px solid #e53e3e' }}>
                <div className="text-muted small">Avg Messages</div>
                <div className="h4 fw-bold mb-0">{chatStats.avg_messages}</div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Conversations table */}
      <div className="card border-0 shadow-sm">
        <div className="card-header bg-white fw-semibold">Chat Conversations</div>
        <div className="card-body p-0">
          <div className="table-responsive">
            <table className="table table-hover mb-0">
              <thead className="table-light">
                <tr>
                  <th>Visitor</th>
                  <th>Started</th>
                  <th>Messages</th>
                  <th>Page</th>
                  <th>Trigger</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {chatConversations.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="text-center text-muted py-4">No chat conversations yet.</td>
                  </tr>
                ) : (
                  chatConversations.map((conv) => (
                    <tr
                      key={conv.id}
                      onClick={() => fetchConversationDetail(conv)}
                      style={{ cursor: 'pointer' }}
                    >
                      <td className="fw-medium small">
                        {conv.visitor?.lead?.name || `Anonymous (${conv.visitor?.fingerprint?.slice(0, 8)}...)`}
                        {conv.visitor?.lead && (
                          <span className="badge bg-info ms-1" style={{ fontSize: '0.65rem' }}>Known</span>
                        )}
                      </td>
                      <td className="text-nowrap small">{formatRelative(conv.started_at)}</td>
                      <td>
                        <span className="badge bg-light text-dark">{conv.message_count}</span>
                      </td>
                      <td className="small">{conv.page_category || '-'}</td>
                      <td className="small">
                        <span className={`badge bg-${conv.trigger_type === 'proactive_behavioral' ? 'warning' : 'light'} text-dark`}>
                          {conv.trigger_type.replace(/_/g, ' ')}
                        </span>
                      </td>
                      <td>
                        <span className={`badge bg-${conv.status === 'active' ? 'success' : conv.status === 'escalated' ? 'danger' : 'secondary'}`}>
                          {conv.status}
                        </span>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
        {chatTotalPages > 1 && (
          <div className="card-footer bg-white">
            <Pagination
              page={chatPage}
              totalPages={chatTotalPages}
              onPageChange={setChatPage}
            />
          </div>
        )}
      </div>
    </div>
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

                {/* Intent Score + Signals */}
                {(visitorIntentScore || visitorSignals.length > 0) && (
                  <div className="mb-4">
                    <h6 className="fw-semibold mb-3" style={{ color: 'var(--color-primary)' }}>
                      Behavioral Intelligence
                    </h6>
                    {visitorIntentScore && (
                      <div className="d-flex align-items-center gap-3 mb-3">
                        <div>
                          <span className="text-muted small">Intent Score</span>
                          <div className="d-flex align-items-center gap-2">
                            <span className="h4 fw-bold mb-0">{visitorIntentScore.score ?? 0}</span>
                            <span className="text-muted">/100</span>
                            <IntentBadge score={visitorIntentScore.score} level={visitorIntentScore.intent_level} />
                          </div>
                        </div>
                        <div className="ms-4">
                          <span className="text-muted small">Signals</span>
                          <div className="fw-medium">{visitorIntentScore.signals_count ?? 0}</div>
                        </div>
                      </div>
                    )}
                    {visitorSignals.length > 0 && (
                      <div className="table-responsive">
                        <table className="table table-sm mb-0" style={{ fontSize: '0.8rem' }}>
                          <thead className="table-light">
                            <tr>
                              <th>Signal</th>
                              <th>Strength</th>
                              <th>Detected</th>
                            </tr>
                          </thead>
                          <tbody>
                            {visitorSignals.map((sig) => (
                              <tr key={sig.id}>
                                <td>
                                  <span className="fw-medium">{sig.signal_type.replace(/_/g, ' ')}</span>
                                </td>
                                <td>
                                  <div className="d-flex align-items-center gap-1">
                                    <div
                                      style={{
                                        width: 40,
                                        height: 6,
                                        background: '#e2e8f0',
                                        borderRadius: 3,
                                        overflow: 'hidden',
                                      }}
                                    >
                                      <div
                                        style={{
                                          width: `${Math.min(sig.signal_strength, 100)}%`,
                                          height: '100%',
                                          background:
                                            sig.signal_strength >= 40 ? '#e53e3e' :
                                            sig.signal_strength >= 25 ? '#dd6b20' :
                                            '#38a169',
                                          borderRadius: 3,
                                        }}
                                      />
                                    </div>
                                    <span className="text-muted">{sig.signal_strength}</span>
                                  </div>
                                </td>
                                <td className="text-muted text-nowrap">{formatRelative(sig.detected_at)}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                )}

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
            { key: 'high_intent' as TabKey, label: 'High Intent' },
            { key: 'analytics' as TabKey, label: 'Analytics' },
            { key: 'sessions' as TabKey, label: 'Sessions' },
            { key: 'chat' as TabKey, label: 'Chat' },
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
      {activeTab === 'high_intent' && renderHighIntentTab()}
      {activeTab === 'analytics' && renderAnalyticsTab()}
      {activeTab === 'sessions' && renderSessionsTab()}
      {activeTab === 'chat' && renderChatTab()}

      {/* Visitor detail modal */}
      {renderDetailModal()}

      {/* Conversation detail modal */}
      {selectedConversation && (
        <div className="modal show d-block" tabIndex={-1} role="dialog" aria-modal="true" style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}>
          <div className="modal-dialog modal-lg modal-dialog-scrollable">
            <div className="modal-content">
              <div className="modal-header">
                <h5 className="modal-title">
                  Conversation — {selectedConversation.visitor?.lead?.name || `Anonymous (${selectedConversation.visitor?.fingerprint?.slice(0, 8)}...)`}
                </h5>
                <button type="button" className="btn-close" onClick={() => { setSelectedConversation(null); setConversationMessages([]); }} />
              </div>
              <div className="modal-body">
                <div className="d-flex gap-3 mb-3 flex-wrap">
                  <span className={`badge bg-${selectedConversation.status === 'active' ? 'success' : 'secondary'}`}>{selectedConversation.status}</span>
                  <small className="text-muted">Started: {formatRelative(selectedConversation.started_at)}</small>
                  <small className="text-muted">Messages: {selectedConversation.message_count}</small>
                  <small className="text-muted">Trigger: {selectedConversation.trigger_type.replace(/_/g, ' ')}</small>
                  {selectedConversation.page_category && <small className="text-muted">Page: {selectedConversation.page_category}</small>}
                </div>
                {selectedConversation.summary && (
                  <div className="alert alert-light small mb-3">
                    <strong>Summary:</strong> {selectedConversation.summary}
                  </div>
                )}
                <div style={{ maxHeight: '400px', overflowY: 'auto' }}>
                  {conversationMessages.map((msg) => (
                    <div key={msg.id} className={`d-flex mb-2 ${msg.role === 'visitor' ? 'justify-content-end' : 'justify-content-start'}`}>
                      <div
                        className="px-3 py-2 rounded"
                        style={{
                          maxWidth: '80%',
                          backgroundColor: msg.role === 'visitor' ? '#e8f0fe' : msg.role === 'system' ? '#fff3cd' : '#f8f9fa',
                          border: '1px solid var(--color-border)',
                          fontSize: '13px',
                        }}
                      >
                        <div className="text-muted small mb-1">{msg.role === 'visitor' ? 'Visitor' : msg.role === 'system' ? 'System' : 'AI Assistant'}</div>
                        {msg.content}
                        <div className="text-muted small mt-1">{new Date(msg.timestamp).toLocaleTimeString()}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
              <div className="modal-footer">
                <button className="btn btn-secondary btn-sm" onClick={() => { setSelectedConversation(null); setConversationMessages([]); }}>Close</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

export default AdminVisitorsPage;
