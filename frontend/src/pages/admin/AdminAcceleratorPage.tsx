import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import api from '../../utils/api';
import { useToast } from '../../components/ui/ToastProvider';
import ConfirmModal from '../../components/ui/ConfirmModal';
import AdminCurriculumTab from './AdminCurriculumTab';
import { PageHeader, StatCard, StatusBadge, SectionCard } from '../../components/admin/shell';
import { TrustSignal } from '../../components/admin/shell/trust';
import PersonHistoryDrawer from '../../components/admin/PersonHistoryDrawer';
import ClassKitModal from '../../components/admin/ClassKitModal';
import KitConfigModal from '../../components/admin/KitConfigModal';
import { CategoryKey } from '../../components/admin/kitConfig/types';
import CohortManagementTab from './components/CohortManagementTab';
import ClassDashboardTab from './components/ClassDashboardTab';
import { resolveAcceleratorNav } from './utils/resolveAcceleratorNav';

interface Cohort {
  id: string;
  name: string;
  start_date: string;
  status: string;
  cohort_type?: string;
  // The parent Course this Cohort belongs to (Course -> Cohort -> Session
  // hierarchy) — null for cohorts with no program_id set (e.g. Explorer).
  program?: { id: string; name: string } | null;
}

interface LiveSession {
  id: string;
  cohort_id: string;
  session_number: number;
  title: string;
  description: string;
  session_date: string;
  start_time: string;
  end_time: string;
  session_type: 'core' | 'lab';
  meeting_link: string;
  status: 'scheduled' | 'live' | 'completed' | 'cancelled';
  recording_url: string;
  attendanceRecords?: AttendanceRecord[];
}

interface AttendanceRecord {
  id: string;
  enrollment_id: string;
  session_id: string;
  status: 'present' | 'absent' | 'excused' | 'late';
  join_time: string;
  leave_time: string;
  duration_minutes: number;
  notes: string;
  enrollment?: EnrollmentInfo;
}

interface EnrollmentInfo {
  id: string;
  full_name: string;
  email: string;
  company: string;
  title: string;
  readiness_score: number;
  prework_score: number;
  attendance_score: number;
  assignment_score: number;
  maturity_level: number;
  status: string;
  payment_status?: string;
  payment_method?: string;
  amount_paid?: number;
  paysimple_url?: string | null;
  subscription?: { plan: string; status: string; amount_cents: number; current_period_end?: string | null } | null;
  portal_enabled?: boolean;
  created_at?: string;
  enrollment_type?: string;
  notes?: string;
  // Acquisition/click attribution (from the matching Lead) — where they came from.
  lead_source?: string | null;
  form_type?: string | null;
  utm_source?: string | null;
  utm_campaign?: string | null;
  page_url?: string | null;
}

interface Submission {
  id: string;
  enrollment_id: string;
  session_id: string;
  assignment_type: string;
  title: string;
  content_json: any;
  file_path: string;
  file_name: string;
  status: string;
  score: number;
  reviewer_notes: string;
  submitted_at: string;
  enrollment?: EnrollmentInfo;
  session?: LiveSession;
}

interface DashboardData {
  cohort: Cohort;
  stats: {
    total_sessions: number;
    completed_sessions: number;
    total_enrollments: number;
    avg_readiness: number;
    avg_attendance: number;
  };
  next_session: LiveSession | null;
  sessions: LiveSession[];
  enrollments: EnrollmentInfo[];
}

// 'attendance', 'submissions', and 'readiness' are no longer standalone tabs —
// Attendance folds into the Sessions drill-down (session/group-level view),
// Submissions folds into the Participants drill-down (per-person view), and
// Readiness is absorbed into the new Class Dashboard (adds cohort-wide trend
// indicators the old flat table never had, rather than living alongside it).
type TabKey = 'cohorts' | 'sessions' | 'participants' | 'class-dashboard' | 'curriculum';

const TAB_ORDER: TabKey[] = ['cohorts', 'sessions', 'participants', 'class-dashboard', 'curriculum'];
// Everything except 'cohorts' (the home/landing view) is a cohort-scoped
// drill-down, rendered via the contextual sub-nav instead of an always-visible
// top tab bar — "let everything flow through the Cohorts tab."
const DRILLDOWN_TABS: TabKey[] = ['sessions', 'participants', 'class-dashboard', 'curriculum'];
const TAB_LABELS: Record<TabKey, string> = {
  cohorts: 'Cohorts',
  sessions: 'Sessions',
  participants: 'Participants',
  'class-dashboard': 'Class Dashboard',
  curriculum: 'Curriculum',
};

function AdminAcceleratorPage() {
  const { showToast } = useToast();
  const [cohorts, setCohorts] = useState<Cohort[]>([]);
  const [selectedCohortId, setSelectedCohortId] = useState('');
  // Cohorts is the default/home view — everything else is a drill-down reached
  // from a cohort row's quick-nav buttons or the contextual sub-nav below.
  const [activeTab, setActiveTab] = useState<TabKey>('cohorts');
  const [loading, setLoading] = useState(true);
  const [dashboard, setDashboard] = useState<DashboardData | null>(null);

  // Sessions state
  const [sessions, setSessions] = useState<LiveSession[]>([]);
  const [showSessionModal, setShowSessionModal] = useState(false);
  const [editingSession, setEditingSession] = useState<LiveSession | null>(null);
  // Session id whose Class Kit (QR + start-class panel) is open, else null.
  const [kitSessionId, setKitSessionId] = useState<string | null>(null);
  // Session id whose Present dropdown menu is open, else null.
  const [presentMenu, setPresentMenu] = useState<string | null>(null);
  // Session {id, title} whose Customize (Class Kit config) modal is open, else null.
  const [customizeTarget, setCustomizeTarget] = useState<{ id: string; title: string } | null>(null);
  // Which category tab the Customize modal should open on — set only via the
  // ?customizeCategory= deep link below; undefined otherwise (modal's own default).
  const [customizeCategory, setCustomizeCategory] = useState<CategoryKey | undefined>(undefined);
  // Session id whose Class Details (curriculum/blueprint) modal is open, else null.
  // Cohort days-off (dates a class was skipped) shown as removable chips above the table.
  const [skippedDates, setSkippedDates] = useState<string[]>([]);
  // Session pending a "mark as day off" confirm, else null.
  const [skipTarget, setSkipTarget] = useState<LiveSession | null>(null);
  // Date pending an "un-skip" (restore day off) confirm, else null.
  const [unskipTarget, setUnskipTarget] = useState<string | null>(null);
  const [sessionForm, setSessionForm] = useState({
    session_number: 1, title: '', description: '', session_date: '',
    start_time: '10:00', end_time: '11:30', session_type: 'core' as 'core' | 'lab',
  });

  // Attendance state
  const [selectedSessionId, setSelectedSessionId] = useState('');
  const [attendanceRecords, setAttendanceRecords] = useState<AttendanceRecord[]>([]);
  const [attendanceLoading, setAttendanceLoading] = useState(false);

  // Submissions state — person-scoped panel, opened from a Participants row.
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [submissionsLoading, setSubmissionsLoading] = useState(false);
  const [submissionsTarget, setSubmissionsTarget] = useState<{ id: string; name: string } | null>(null);

  // Enrollments for the current cohort, used by the Attendance modal roster and
  // passed to AdminCurriculumTab. Per-student scores now live in the
  // self-contained ClassDashboardTab, not here.
  const [enrollments, setEnrollments] = useState<EnrollmentInfo[]>([]);

  // Delete confirm
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);

  // Participants tab state
  const [cohortEnrollments, setCohortEnrollments] = useState<EnrollmentInfo[]>([]);
  const [enrollmentsLoading, setEnrollmentsLoading] = useState(false);
  const [portalFilter, setPortalFilter] = useState<'all' | 'enabled' | 'disabled'>('all');
  const [paymentFilter, setPaymentFilter] = useState<'all' | 'paid' | 'pending_invoice' | 'failed'>('all');
  const [historyTarget, setHistoryTarget] = useState<{ id: string; name: string } | null>(null);
  const [searchParams, setSearchParams] = useSearchParams();

  // Deep-link: /admin/accelerator?enrollment=<id>&name=<name> opens that student's
  // profile drawer directly (used by the Revenue page's per-row "Student" link). The
  // drawer fetches its own person-360 data by enrollment id, so no cohort context is
  // needed. Consume the params once so a refresh/close doesn't re-open it.
  useEffect(() => {
    const enrollmentId = searchParams.get('enrollment');
    if (!enrollmentId) return;
    setHistoryTarget({ id: enrollmentId, name: searchParams.get('name') || 'Student' });
    const next = new URLSearchParams(searchParams);
    next.delete('enrollment');
    next.delete('name');
    setSearchParams(next, { replace: true });
  }, [searchParams, setSearchParams]);

  // Deep-link: /admin/accelerator?customizeSessionId=<id>&customizeCategory=<key>
  // opens that session's Customize modal directly, on the given category tab —
  // used by the Timeline page's "click a card -> open Customize in a new tab"
  // flow (AdminAcceleratorSessionTimelinePage.tsx). Fetches the session's own
  // title via GET .../sessions/:id rather than requiring the `sessions` list
  // to already be loaded for the right cohort. Consumes both params once, same
  // pattern as the enrollment deep-link above. NOTE: this effect does NOT read
  // or clear `?tab=` — that param is owned exclusively by the `resolveAcceleratorNav`
  // effect below (a pre-existing, more robust deep-link mechanism that already
  // handles `?tab=sessions` — e.g. from the Timeline page's "Back to sessions"
  // link — correctly; duplicating that handling here would race the two effects
  // over which one clears the param first).
  useEffect(() => {
    const customizeSessionId = searchParams.get('customizeSessionId');
    if (!customizeSessionId) return;
    const customizeCategoryParam = searchParams.get('customizeCategory');

    api.get(`/api/admin/accelerator/sessions/${customizeSessionId}`)
      .then((res) => {
        const title = res.data?.session?.title || 'Session';
        setCustomizeTarget({ id: customizeSessionId, title });
        if (customizeCategoryParam) setCustomizeCategory(customizeCategoryParam as CategoryKey);
      })
      .catch(() => { /* invalid/missing session id — fail silently, no modal opens */ });

    const next = new URLSearchParams(searchParams);
    next.delete('customizeSessionId');
    next.delete('customizeCategory');
    setSearchParams(next, { replace: true });
  }, [searchParams, setSearchParams]);

  // Reusable so the new Cohorts management tab can refresh this (open-cohorts-only)
  // selector after a create/edit/delete, not just on first mount. Pure fetch —
  // deep-link (?tab=/?cohort=) resolution is handled separately below, by an
  // effect that reacts to searchParams changing at any point, not just at mount.
  const loadCohorts = useCallback(() => {
    return api.get('/api/admin/cohorts').then((res) => {
      const openCohorts: Cohort[] = (res.data.cohorts || []).filter((c: Cohort) => c.status === 'open');
      setCohorts((prev) => {
        // Preserve any individually-fetched deep-linked cohort (closed/completed,
        // so it's not part of the open list) already in state, so a resolved
        // deep link doesn't get silently dropped by a later refresh.
        const extra = prev.filter((c) => c.status !== 'open' && !openCohorts.some((o) => o.id === c.id));
        return [...extra, ...openCohorts];
      });
      setSelectedCohortId((prev) => (prev && openCohorts.some((c) => c.id === prev)) ? prev : (prev || openCohorts[0]?.id || ''));
    }).catch(() => showToast('Failed to load cohorts', 'error'));
  }, [showToast]);

  useEffect(() => {
    loadCohorts().finally(() => setLoading(false));
  }, []); // eslint-disable-line

  // Deep-link: /admin/accelerator?tab=<x>&cohort=<id> (used by the admin
  // dashboard's "Manage" link and the Cohorts tab's per-row quick-nav buttons).
  // Reacts to `searchParams`/`cohorts` changing at ANY point after mount, not just
  // once — the bug this fixes: a same-route <Link> click changes searchParams
  // without unmounting the page, so a mount-only effect (the original code here)
  // never re-ran on the second and subsequent clicks. Mirrors the "consume and
  // clear" pattern the `?enrollment=` deep link above already uses safely: after
  // acting on the params, they're removed from the URL, which is also what
  // prevents an infinite loop (the next render's searchParams.get() calls return
  // null, and resolveAcceleratorNav's early-return makes the effect a no-op).
  useEffect(() => {
    const result = resolveAcceleratorNav(
      { tab: searchParams.get('tab'), cohort: searchParams.get('cohort') },
      TAB_ORDER,
      cohorts.map((c) => c.id),
      activeTab,
      selectedCohortId
    );
    if (!result.consumedParams) return;

    if (result.nextTab) setActiveTab(result.nextTab as TabKey);
    if (result.nextCohortId) setSelectedCohortId(result.nextCohortId);
    if (result.needsCohortFetch) {
      const fetchId = result.needsCohortFetch;
      api.get(`/api/admin/cohorts/${fetchId}`).then((detail) => {
        if (detail.data?.cohort) {
          setCohorts((prev) => (prev.some((c) => c.id === fetchId) ? prev : [detail.data.cohort, ...prev]));
          setSelectedCohortId(fetchId);
        }
      }).catch(() => {
        // Deep-linked cohort id doesn't exist (deleted, bad link) — fall through
        // to whatever is already selected rather than blocking the page.
      });
    }

    const next = new URLSearchParams(searchParams);
    next.delete('tab');
    next.delete('cohort');
    setSearchParams(next, { replace: true });
  }, [searchParams, cohorts, activeTab, selectedCohortId]); // eslint-disable-line

  const loadDashboard = useCallback(async () => {
    if (!selectedCohortId) return;
    try {
      const res = await api.get(`/api/admin/accelerator/cohorts/${selectedCohortId}/dashboard`);
      setDashboard(res.data);
      setSessions(res.data.sessions || []);
      setEnrollments(res.data.enrollments || []);
      // Only overwrite skipped_dates when the response actually carries the field —
      // the dashboard endpoint may omit it, and we don't want to clobber the value
      // just set from a skip/unskip mutation response.
      if (Array.isArray(res.data.skipped_dates)) setSkippedDates(res.data.skipped_dates);
    } catch {
      showToast('Failed to load dashboard', 'error');
    }
  }, [selectedCohortId]); // eslint-disable-line

  useEffect(() => { loadDashboard(); }, [loadDashboard]);

  // Reset days-off chips when switching cohorts so one cohort's days off never bleed
  // into another. loadDashboard then repopulates them from the response (when present).
  useEffect(() => { setSkippedDates([]); }, [selectedCohortId]);

  // -- Session handlers --

  const handleCreateSession = async () => {
    try {
      await api.post(`/api/admin/accelerator/cohorts/${selectedCohortId}/sessions`, sessionForm);
      showToast('Session created', 'success');
      setShowSessionModal(false);
      resetSessionForm();
      loadDashboard();
    } catch { showToast('Failed to create session', 'error'); }
  };

  const handleUpdateSessionSubmit = async () => {
    if (!editingSession) return;
    try {
      await api.patch(`/api/admin/accelerator/sessions/${editingSession.id}`, sessionForm);
      showToast('Session updated', 'success');
      setShowSessionModal(false);
      setEditingSession(null);
      resetSessionForm();
      loadDashboard();
    } catch { showToast('Failed to update session', 'error'); }
  };

  const handleDeleteSession = async () => {
    if (!deleteTarget) return;
    try {
      await api.delete(`/api/admin/accelerator/sessions/${deleteTarget}`);
      showToast('Session deleted', 'success');
      setDeleteTarget(null);
      loadDashboard();
    } catch { showToast('Failed to delete session', 'error'); }
  };

  // Mark a session's date as a cohort day off: this class and every later one shift
  // forward one slot. The response carries the re-dated sessions + updated days-off
  // list, which we apply immediately; loadDashboard then refreshes the rest.
  const handleSkipSession = async () => {
    if (!skipTarget) return;
    try {
      const res = await api.post(`/api/admin/accelerator/sessions/${skipTarget.id}/skip`);
      if (Array.isArray(res.data?.sessions)) setSessions(res.data.sessions);
      if (Array.isArray(res.data?.skipped_dates)) setSkippedDates(res.data.skipped_dates);
      showToast('Day off marked — schedule shifted forward', 'success');
      setSkipTarget(null);
      loadDashboard();
    } catch { showToast('Failed to mark day off', 'error'); }
  };

  // Remove a cohort day off: later sessions compact back onto the freed date.
  const handleUnskip = async () => {
    if (!unskipTarget || !selectedCohortId) return;
    try {
      const res = await api.post(`/api/admin/accelerator/cohorts/${selectedCohortId}/unskip`, { date: unskipTarget });
      if (Array.isArray(res.data?.sessions)) setSessions(res.data.sessions);
      if (Array.isArray(res.data?.skipped_dates)) setSkippedDates(res.data.skipped_dates);
      showToast('Day off removed — schedule restored', 'success');
      setUnskipTarget(null);
      loadDashboard();
    } catch { showToast('Failed to remove day off', 'error'); }
  };

  const handleGenerateMeet = async (sessionId: string) => {
    try {
      const res = await api.post(`/api/admin/accelerator/sessions/${sessionId}/meet-link`);
      showToast(`Meet link generated: ${res.data.meeting_link}`, 'success');
      loadDashboard();
    } catch { showToast('Failed to generate Meet link', 'error'); }
  };

  // Open the full interactive Class Kit teaching deck in a new tab. The window is
  // opened synchronously (in the click gesture) to dodge popup blockers, then the
  // deck HTML — fetched with the admin JWT — is written into it.
  const handleOpenKitDeck = async (sessionId: string, mode: 'live' | 'rehearse' = 'live') => {
    const w = window.open('', '_blank');
    if (!w) { showToast('Allow pop-ups to open the Class Kit deck', 'error'); return; }
    const label = mode === 'rehearse' ? 'Rehearsal (live sync off)' : 'Class Kit';
    w.document.write(`<!doctype html><title>Loading…</title><body style="font-family:system-ui,sans-serif;padding:2rem;color:#334">Loading the ${label}…</body>`);
    try {
      const q = mode === 'rehearse' ? '?mode=rehearse' : '';
      const res = await api.get(`/api/admin/accelerator/sessions/${sessionId}/kit-doc${q}`, { responseType: 'text' });
      w.document.open();
      w.document.write(res.data as string);
      w.document.close();
    } catch {
      try { w.document.body.innerHTML = '<div style="font-family:system-ui,sans-serif;padding:2rem;color:#c00">Could not load the Class Kit. Close this tab and try again.</div>'; } catch { /* window may be gone */ }
      showToast('Failed to open the Class Kit deck', 'error');
    }
  };

  // Download the standalone (offline) class HTML.
  const handleDownloadKit = async (sessionId: string, title: string) => {
    try {
      const res = await api.get(`/api/admin/accelerator/sessions/${sessionId}/kit-doc?mode=standalone`, { responseType: 'text' });
      const blob = new Blob([res.data as string], { type: 'text/html' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `class-experience-${(title || 'session').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60)}.html`;
      a.click();
      showToast('Downloaded the standalone class file', 'success');
    } catch { showToast('Failed to download the class file', 'error'); }
  };

  // Open the instructor readiness report (prep + source ledger).
  const handleOpenReadiness = async (sessionId: string) => {
    const w = window.open('', '_blank');
    if (!w) { showToast('Allow pop-ups to open the readiness report', 'error'); return; }
    w.document.write('<!doctype html><title>Readiness…</title><body style="font-family:system-ui,sans-serif;padding:2rem;color:#334">Loading the readiness report…</body>');
    try {
      const res = await api.get(`/api/admin/accelerator/sessions/${sessionId}/readiness`, { responseType: 'text' });
      w.document.open(); w.document.write(res.data as string); w.document.close();
    } catch {
      try { w.document.body.innerHTML = '<div style="font-family:system-ui,sans-serif;padding:2rem;color:#c00">Could not load the readiness report.</div>'; } catch { /* window gone */ }
      showToast('Failed to open the readiness report', 'error');
    }
  };

  // Open the plain-language class outline (teaching plan) in a new tab.
  const handleOpenOutline = async (sessionId: string) => {
    const w = window.open('', '_blank');
    if (!w) { showToast('Allow pop-ups to open the outline', 'error'); return; }
    w.document.write('<!doctype html><title>Loading outline…</title><body style="font-family:system-ui,sans-serif;padding:2rem;color:#334">Loading the class outline…</body>');
    try {
      const res = await api.get(`/api/admin/accelerator/sessions/${sessionId}/outline`, { responseType: 'text' });
      w.document.open(); w.document.write(res.data as string); w.document.close();
    } catch {
      try { w.document.body.innerHTML = '<div style="font-family:system-ui,sans-serif;padding:2rem;color:#c00">Could not load the outline. Close this tab and try again.</div>'; } catch { /* window gone */ }
      showToast('Failed to open the outline', 'error');
    }
  };

  const handleStatusChange = async (sessionId: string, status: string) => {
    try {
      await api.patch(`/api/admin/accelerator/sessions/${sessionId}`, { status });
      showToast(`Session marked as ${status}`, 'success');
      loadDashboard();
    } catch { showToast('Failed to update status', 'error'); }
  };

  const resetSessionForm = () => {
    setSessionForm({
      session_number: (sessions.length || 0) + 1, title: '', description: '', session_date: '',
      start_time: '10:00', end_time: '11:30', session_type: 'core',
    });
  };

  const openEditSession = (s: LiveSession) => {
    setEditingSession(s);
    setSessionForm({
      session_number: s.session_number, title: s.title, description: s.description || '',
      session_date: s.session_date, start_time: s.start_time, end_time: s.end_time,
      session_type: s.session_type,
    });
    setShowSessionModal(true);
  };

  // -- Attendance handlers --

  const loadAttendance = async (sessionId: string) => {
    setAttendanceLoading(true);
    try {
      const res = await api.get(`/api/admin/accelerator/sessions/${sessionId}/attendance`);
      setAttendanceRecords(res.data.records || []);
    } catch { showToast('Failed to load attendance', 'error'); }
    setAttendanceLoading(false);
  };

  // Loads whenever the Attendance modal opens (selectedSessionId is set from a
  // session row's "Attendance" button) — no longer tied to a top-level tab.
  useEffect(() => {
    if (selectedSessionId) {
      loadAttendance(selectedSessionId);
    }
  }, [selectedSessionId]); // eslint-disable-line

  const handleAttendanceChange = async (enrollmentId: string, status: string) => {
    try {
      await api.post(`/api/admin/accelerator/sessions/${selectedSessionId}/attendance`, {
        enrollment_id: enrollmentId,
        status,
        marked_by: 'admin',
      });
      loadAttendance(selectedSessionId);
    } catch { showToast('Failed to update attendance', 'error'); }
  };

  const handleBulkAttendance = async (status: string) => {
    if (!enrollments.length) return;
    try {
      await api.post(`/api/admin/accelerator/sessions/${selectedSessionId}/attendance`, {
        records: enrollments.map((e) => ({ enrollment_id: e.id, status })),
      });
      showToast(`All marked as ${status}`, 'success');
      loadAttendance(selectedSessionId);
    } catch { showToast('Failed to bulk update', 'error'); }
  };

  // -- Submissions handlers — person-scoped (Submissions folds into
  // Participants: "you can see it for each person," not a standalone
  // session-scoped tab). Consumes the already-existing
  // GET .../enrollments/:id/submissions endpoint for the first time from the
  // frontend. `submissionsTarget` is the participant whose panel is open.
  const loadPersonSubmissions = async (enrollmentId: string) => {
    setSubmissionsLoading(true);
    try {
      const res = await api.get(`/api/admin/accelerator/enrollments/${enrollmentId}/submissions`);
      setSubmissions(res.data.submissions || []);
    } catch { showToast('Failed to load submissions', 'error'); }
    setSubmissionsLoading(false);
  };

  useEffect(() => {
    if (submissionsTarget) loadPersonSubmissions(submissionsTarget.id);
  }, [submissionsTarget]); // eslint-disable-line

  const handleReviewSubmission = async (subId: string, score: number, notes: string) => {
    try {
      await api.patch(`/api/admin/accelerator/submissions/${subId}`, {
        status: 'reviewed', score, reviewer_notes: notes,
      });
      showToast('Submission reviewed', 'success');
      if (submissionsTarget) loadPersonSubmissions(submissionsTarget.id);
    } catch { showToast('Failed to review submission', 'error'); }
  };

  // -- Participants / Enrollment handlers --

  const loadEnrollments = useCallback(async () => {
    if (!selectedCohortId) return;
    setEnrollmentsLoading(true);
    try {
      const res = await api.get(`/api/admin/accelerator/cohorts/${selectedCohortId}/enrollments`);
      setCohortEnrollments(res.data.enrollments || []);
    } catch { showToast('Failed to load enrollments', 'error'); }
    setEnrollmentsLoading(false);
  }, [selectedCohortId]); // eslint-disable-line

  useEffect(() => {
    if (activeTab === 'participants') {
      loadEnrollments();
    }
  }, [activeTab, loadEnrollments]);

  const handleTogglePortal = async (enrollmentId: string, enabled: boolean) => {
    try {
      await api.patch(`/api/admin/accelerator/enrollments/${enrollmentId}/portal-access`, { portal_enabled: enabled });
      showToast(enabled ? 'Portal access enabled' : 'Portal access revoked', 'success');
      loadEnrollments();
      loadDashboard();
    } catch (err: any) {
      showToast(err.response?.data?.error || 'Failed to update portal access', 'error');
    }
  };

  // Open the portal exactly as this participant sees it. Opens in a new tab; the
  // participant session lives under a separate token (participant_token) so it
  // does NOT log the admin out of this tab.
  const handleViewAsStudent = async (enrollmentId: string) => {
    try {
      // Read-only "View as": mints a read_only token so the admin observes the
      // student's portal without being able to change anything (server-enforced).
      const res = await api.get(`/api/admin/accelerator/enrollments/${enrollmentId}/view-as-token`);
      const url = res.data?.url;
      if (!url) { showToast('No portal link available', 'error'); return; }
      window.open(url, '_blank', 'noopener,noreferrer');
    } catch {
      showToast('Failed to open student portal', 'error');
    }
  };

  const filteredEnrollments = cohortEnrollments.filter((e) => {
    if (portalFilter === 'enabled' && !e.portal_enabled) return false;
    if (portalFilter === 'disabled' && e.portal_enabled) return false;
    if (paymentFilter !== 'all' && e.payment_status !== paymentFilter) return false;
    return true;
  });

  // -- Helpers --

  type BadgeTone = 'success' | 'danger' | 'warning' | 'info' | 'neutral' | 'primary';

  const statusBadge = (status: string) => {
    // Tones for labels the shared StatusBadge auto-mapper doesn't recognize.
    const tones: Record<string, BadgeTone> = {
      scheduled: 'info', live: 'danger', completed: 'success', cancelled: 'neutral',
      present: 'success', absent: 'danger', excused: 'warning', late: 'info',
      pending: 'warning', submitted: 'info', reviewed: 'success', flagged: 'danger',
      core: 'primary', lab: 'info',
    };
    return <StatusBadge label={status} tone={tones[status]} />;
  };

  const paymentBadge = (status: string) => {
    const tones: Record<string, BadgeTone> = {
      paid: 'success', pending_invoice: 'warning', failed: 'danger',
    };
    const labels: Record<string, string> = {
      paid: 'Paid', pending_invoice: 'Pending Invoice', failed: 'Failed',
    };
    return <StatusBadge label={labels[status] || status} tone={tones[status]} />;
  };

  const formatDate = (d: string) => d ? new Date(d + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '';
  // Compact label for day-off chips, e.g. "Jul 27".
  const formatDayOff = (d: string) => d ? new Date(d + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : d;
  // "18:30:00" -> "6:30 PM". Stored times are already Central wall-clock (no TZ math needed).
  const formatClock12 = (t: string) => {
    const m = /^(\d{1,2}):(\d{2})/.exec(t || '');
    if (!m) return t || '';
    let h = parseInt(m[1], 10);
    const min = m[2];
    const ampm = h >= 12 ? 'PM' : 'AM';
    h = h % 12 || 12;
    return `${h}:${min} ${ampm}`;
  };
  // "18:30:00", "20:30:00" -> "6:30 - 8:30 PM CT" (drops the repeated AM/PM when both share it).
  const formatTimeRange = (start: string, end: string) => {
    const s = formatClock12(start), e = formatClock12(end);
    const sAmPm = s.split(' ')[1], eAmPm = e.split(' ')[1];
    const sLabel = sAmPm && sAmPm === eAmPm ? s.replace(` ${sAmPm}`, '') : s;
    return `${sLabel} - ${e} CT`;
  };
  const formatDateTime = (d: string) => d ? new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '';

  // "3 days ago" style relative label for when someone registered.
  const timeAgo = (iso?: string) => {
    if (!iso) return '';
    const then = new Date(iso).getTime();
    if (Number.isNaN(then)) return '';
    const secs = Math.max(0, Math.floor((Date.now() - then) / 1000));
    const mins = Math.floor(secs / 60), hrs = Math.floor(mins / 60), days = Math.floor(hrs / 24);
    if (secs < 60) return 'just now';
    if (mins < 60) return `${mins}m ago`;
    if (hrs < 24) return `${hrs}h ago`;
    if (days < 30) return `${days}d ago`;
    const months = Math.floor(days / 30);
    if (months < 12) return `${months}mo ago`;
    return `${Math.floor(days / 365)}y ago`;
  };

  // Where a prospect registered from: prefer the actual landing page's host, then
  // the lead source, then a label derived from the enrollment note. Returns a
  // human label + the raw page URL (if any) to link to, and a details tooltip.
  const sourceInfo = (e: EnrollmentInfo): { label: string; href?: string; tooltip: string } => {
    let label = '';
    if (e.page_url) {
      try { label = new URL(e.page_url).hostname.replace(/^www\./, ''); } catch { label = e.page_url; }
    }
    if (!label && e.lead_source) {
      label = e.lead_source.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
    }
    if (!label && e.notes) {
      if (/open house/i.test(e.notes)) label = 'Open House';
      else if (/training/i.test(e.notes)) label = 'Training signup';
    }
    if (!label) label = '—';
    const parts: string[] = [];
    if (e.lead_source) parts.push(`source: ${e.lead_source}`);
    if (e.form_type) parts.push(`form: ${e.form_type}`);
    if (e.utm_source) parts.push(`utm_source: ${e.utm_source}`);
    if (e.utm_campaign) parts.push(`utm_campaign: ${e.utm_campaign}`);
    if (e.page_url) parts.push(`page: ${e.page_url}`);
    if (e.notes) parts.push(e.notes);
    return { label, href: e.page_url || undefined, tooltip: parts.join('\n') || 'No acquisition data captured' };
  };

  // Per-page trust signal — declared before any early return so hook order is stable.
  const trust: TrustSignal = useMemo(() => ({
    level: 'live',
    source: 'accelerator program',
    updatedAt: new Date().toISOString(),
    summary: 'Live cohort sessions, attendance, submissions, and readiness scores.',
    href: '/admin/trust',
    pillars: [
      { name: 'Freshness', status: 'live', evidence: [{ label: 'Window', value: 'real-time' }] },
    ],
  }), []);

  if (loading) {
    return (
      <div className="text-center py-5">
        <div className="spinner-border text-primary" role="status">
          <span className="visually-hidden">Loading...</span>
        </div>
      </div>
    );
  }

  return (
    <>
      <PageHeader
        title="Accelerator"
        icon="graduation-cap-line"
        subtitle="Cohort sessions, attendance, submissions, and executive readiness."
        breadcrumb={[{ label: 'Admin', to: '/admin/dashboard' }, { label: 'Accelerator' }]}
        trust={trust}
        actions={
          activeTab !== 'cohorts' ? (
            <select
              className="form-select form-select-sm"
              style={{ width: 'auto' }}
              value={selectedCohortId}
              onChange={(e) => setSelectedCohortId(e.target.value)}
              aria-label="Select cohort"
            >
              {cohorts.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          ) : undefined
        }
      >
        {activeTab !== 'cohorts' && (
          <div className="small text-muted mb-2">
            <i className="ri-stack-line" aria-hidden="true" />{' '}
            Course: <strong>{dashboard?.cohort?.program?.name || 'No parent course set'}</strong>
            {' '}&rsaquo;{' '}
            Cohort: <strong>{dashboard?.cohort?.name || '—'}</strong>
            {activeTab === 'sessions' && (
              <span> — sessions belong to this cohort within its course; attendance is tracked per session.</span>
            )}
          </div>
        )}
        {dashboard && activeTab !== 'cohorts' && (
          <div className="row g-3">
            <div className="col-6 col-lg-3">
              <StatCard
                label="Sessions"
                value={`${dashboard.stats.completed_sessions}/${dashboard.stats.total_sessions}`}
                icon="calendar-check-line"
                tone="primary"
                hint="completed"
              />
            </div>
            <div className="col-6 col-lg-3">
              <StatCard
                label="Enrollments"
                value={dashboard.stats.total_enrollments}
                icon="group-line"
                tone="info"
                hint="active"
              />
            </div>
            <div className="col-6 col-lg-3">
              <StatCard
                label="Avg Readiness"
                value={`${dashboard.stats.avg_readiness}%`}
                icon="shield-check-line"
                tone="success"
                hint="score"
              />
            </div>
            <div className="col-6 col-lg-3">
              <StatCard
                label="Avg Attendance"
                value={`${dashboard.stats.avg_attendance}%`}
                icon="user-follow-line"
                tone="warning"
                hint="rate"
              />
            </div>
          </div>
        )}
      </PageHeader>

      {/* Contextual sub-nav — only shown once a cohort drill-down is active.
          Cohorts itself has no tab bar; it IS the home view. */}
      {activeTab !== 'cohorts' && (
        <div className="d-flex align-items-center gap-2 mb-4 flex-wrap">
          <button className="btn btn-sm btn-outline-secondary" onClick={() => setActiveTab('cohorts')}>
            <i className="ri-arrow-left-line" aria-hidden="true" /> All Cohorts
          </button>
          <ul className="nav nav-pills mb-0">
            {DRILLDOWN_TABS.map((tab) => (
              <li key={tab} className="nav-item">
                <button
                  className={`nav-link${activeTab === tab ? ' active' : ''}`}
                  onClick={() => setActiveTab(tab)}
                >
                  {TAB_LABELS[tab]}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Tab Content */}
      {activeTab === 'cohorts' && (
        <CohortManagementTab onCohortsChanged={loadCohorts} />
      )}

      {activeTab === 'sessions' && (
        <SectionCard
          title={`Sessions (${sessions.length})`}
          padded={false}
          actions={
            <button
              className="btn btn-primary btn-sm"
              onClick={() => { resetSessionForm(); setEditingSession(null); setShowSessionModal(true); }}
            >
              <i className="ri-add-line" aria-hidden="true" /> Add Session
            </button>
          }
        >
            {skippedDates.length > 0 && (
              <div className="d-flex flex-wrap align-items-center gap-2 px-3 pt-3">
                <span className="text-muted small fw-medium">Days off:</span>
                {skippedDates.map((d) => (
                  <span key={d} className="badge rounded-pill text-bg-light text-dark border d-inline-flex align-items-center gap-1" style={{ fontSize: 12.5, fontWeight: 500, paddingRight: 6 }}>
                    <span aria-hidden="true">📅</span> {formatDayOff(d)}
                    <button
                      type="button"
                      className="btn-close ms-1"
                      style={{ fontSize: 9, width: 9, height: 9 }}
                      aria-label={`Remove day off ${formatDayOff(d)}`}
                      title="Un-skip this day — later sessions compact back"
                      onClick={() => setUnskipTarget(d)}
                    />
                  </span>
                ))}
              </div>
            )}
            <div className="table-responsive">
              <table className="table table-hover mb-0">
                <thead className="table-light">
                  <tr>
                    <th>#</th>
                    <th>Title</th>
                    <th>Date</th>
                    <th>Time</th>
                    <th>Type</th>
                    <th>Status</th>
                    <th>Meet</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {sessions.length === 0 ? (
                    <tr><td colSpan={8} className="text-center text-muted py-4">No sessions yet</td></tr>
                  ) : sessions.map((s) => (
                    <tr key={s.id}>
                      <td>{s.session_number}</td>
                      <td className="fw-medium">
                        <button
                          className="btn btn-link p-0 fw-medium text-start text-decoration-none align-baseline"
                          onClick={() => handleOpenOutline(s.id)}
                          title="Open the class outline — the minute-by-minute teaching plan. Use ▶ Present to run the slides."
                        >
                          {s.title}
                        </button>
                      </td>
                      <td>{formatDate(s.session_date)}</td>
                      <td className="small">{formatTimeRange(s.start_time, s.end_time)}</td>
                      <td>{statusBadge(s.session_type)}</td>
                      <td>{statusBadge(s.status)}</td>
                      <td>
                        {s.meeting_link ? (
                          <a href={s.meeting_link} target="_blank" rel="noopener noreferrer" className="btn btn-outline-success btn-sm">
                            Join
                          </a>
                        ) : (
                          <button className="btn btn-outline-primary btn-sm" onClick={() => handleGenerateMeet(s.id)}>
                            Generate
                          </button>
                        )}
                      </td>
                      <td>
                        <div className="d-flex gap-1">
                          <div className="btn-group" style={{ position: 'relative' }}>
                            <button className="btn btn-primary btn-sm" onClick={() => handleOpenKitDeck(s.id)} title="Open the interactive Class Kit teaching deck in a new tab — share this on screen to run the class. The check-in QR is on the first slides.">▶ Present</button>
                            <button className="btn btn-primary btn-sm dropdown-toggle dropdown-toggle-split" onClick={() => setPresentMenu(presentMenu === s.id ? null : s.id)} title="More: Rehearse · Download · Readiness"><span className="visually-hidden">More</span></button>
                            {presentMenu === s.id && (
                              <div className="dropdown-menu show" style={{ position: 'absolute', top: '100%', right: 0, zIndex: 1050, display: 'block' }}>
                                <button className="dropdown-item" onClick={() => { setPresentMenu(null); handleOpenKitDeck(s.id, 'rehearse'); }}>🎓 Rehearse (live off)</button>
                                <button className="dropdown-item" onClick={() => { setPresentMenu(null); handleDownloadKit(s.id, s.title); }}>⬇️ Download standalone HTML</button>
                                <button className="dropdown-item" onClick={() => { setPresentMenu(null); handleOpenReadiness(s.id); }}>📋 Readiness report</button>
                                <div className="dropdown-divider" />
                                <button className="dropdown-item" onClick={() => { setPresentMenu(null); setCustomizeTarget({ id: s.id, title: s.title }); }}>⚙️ Customize</button>
                              </div>
                            )}
                          </div>
                          <button className="btn btn-outline-secondary btn-sm" onClick={() => setKitSessionId(s.id)} title="Printable check-in QR + Start Class + roster (a paper backup — the deck already shows the QR)">QR</button>
                          <button className="btn btn-outline-secondary btn-sm" onClick={() => openEditSession(s)}>Edit</button>
                          <button className="btn btn-outline-secondary btn-sm" onClick={() => setSelectedSessionId(s.id)} title="Mark attendance for this session's whole roster">Attendance</button>
                          <button className="btn btn-outline-warning btn-sm" onClick={() => setSkipTarget(s)} title="Mark this date as a day off — this class and all later ones shift forward one slot">Skip</button>
                          {s.status === 'scheduled' && (
                            <button className="btn btn-outline-danger btn-sm" onClick={() => handleStatusChange(s.id, 'completed')}>Complete</button>
                          )}
                          {s.status === 'completed' && (
                            <button className="btn btn-outline-secondary btn-sm" onClick={() => handleStatusChange(s.id, 'scheduled')} title="Revert to scheduled — e.g. it was marked complete for testing before the class actually ran">↩ Reopen</button>
                          )}
                          <button className="btn btn-outline-danger btn-sm" onClick={() => setDeleteTarget(s.id)}>Del</button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
        </SectionCard>
      )}

      {activeTab === 'participants' && (
        <SectionCard
          title={`Enrollments (${filteredEnrollments.length})`}
          padded={false}
          actions={
            <div className="d-flex gap-2 align-items-center">
              <select className="form-select form-select-sm" style={{ width: 'auto' }} value={paymentFilter} onChange={(e) => setPaymentFilter(e.target.value as any)}>
                <option value="all">All Payments</option>
                <option value="paid">Paid</option>
                <option value="pending_invoice">Pending Invoice</option>
                <option value="failed">Failed</option>
              </select>
              <select className="form-select form-select-sm" style={{ width: 'auto' }} value={portalFilter} onChange={(e) => setPortalFilter(e.target.value as any)}>
                <option value="all">All Portal</option>
                <option value="enabled">Portal Enabled</option>
                <option value="disabled">Portal Disabled</option>
              </select>
            </div>
          }
        >
            {enrollmentsLoading ? (
              <div className="text-center py-4"><div className="spinner-border spinner-border-sm" role="status"><span className="visually-hidden">Loading...</span></div></div>
            ) : (
              <div className="table-responsive">
                <table className="table table-hover mb-0">
                  <thead className="table-light">
                    <tr>
                      <th>Name</th>
                      <th>Email</th>
                      <th>Source</th>
                      <th>Payment</th>
                      <th>Portal</th>
                      <th>Registered</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredEnrollments.length === 0 ? (
                      <tr><td colSpan={6} className="text-center text-muted py-4">No enrollments found</td></tr>
                    ) : filteredEnrollments.map((e) => {
                      const src = sourceInfo(e);
                      return (
                      <tr key={e.id}>
                        <td className="fw-medium">
                          <button
                            className="btn btn-link p-0 fw-medium text-start text-decoration-none align-baseline"
                            onClick={() => setHistoryTarget({ id: e.id, name: e.full_name })}
                            title="View full history & activity"
                          >
                            {e.full_name}
                          </button>
                          {e.company && e.company !== 'Prospect' && (
                            <div className="text-muted small fw-normal">{e.company}</div>
                          )}
                        </td>
                        <td className="small">{e.email}</td>
                        <td className="small" title={src.tooltip}>
                          {src.href ? (
                            <a href={src.href} target="_blank" rel="noopener noreferrer" className="text-decoration-none">
                              {src.label} <i className="ri-external-link-line" aria-hidden="true"></i>
                            </a>
                          ) : (
                            <span>{src.label}</span>
                          )}
                          {e.utm_campaign && <div className="text-muted" style={{ fontSize: '0.72rem' }}>{e.utm_campaign}</div>}
                        </td>
                        <td>
                          {paymentBadge(e.payment_status || 'failed')}
                          {typeof e.amount_paid === 'number' && e.amount_paid > 0 ? (
                            <div className="text-muted" style={{ fontSize: '0.72rem' }}>
                              ${e.amount_paid.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 })} paid
                            </div>
                          ) : null}
                          {e.subscription && e.subscription.status === 'active' ? (
                            <div style={{ fontSize: '0.72rem', marginTop: 2 }}>
                              <span className={`badge ${e.subscription.plan === 'comp' ? 'bg-info' : 'bg-success'}`}>
                                {e.subscription.plan === 'annual' ? 'Annual' : e.subscription.plan === 'monthly' ? 'Monthly' : e.subscription.plan === 'comp' ? 'Comp' : e.subscription.plan} subscription
                              </span>
                            </div>
                          ) : null}
                          {e.paysimple_url ? (
                            <div style={{ fontSize: '0.72rem', marginTop: 2 }}>
                              <a href={e.paysimple_url} target="_blank" rel="noopener noreferrer">
                                Payment info <i className="ri-external-link-line" aria-hidden="true"></i>
                              </a>
                            </div>
                          ) : null}
                        </td>
                        <td>
                          <div className="d-flex gap-1 align-items-center">
                            {e.portal_enabled ? (
                              <button className="btn btn-outline-danger btn-sm" onClick={() => handleTogglePortal(e.id, false)}>
                                <i className="ri-lock-line me-1" aria-hidden="true"></i>Revoke
                              </button>
                            ) : (
                              <button className="btn btn-success btn-sm" onClick={() => handleTogglePortal(e.id, true)}>
                                <i className="ri-lock-unlock-line me-1" aria-hidden="true"></i>Enable
                              </button>
                            )}
                            <button
                              className="btn btn-outline-primary btn-sm"
                              onClick={() => handleViewAsStudent(e.id)}
                              title="Open the portal as this participant sees it (new tab)"
                            >
                              <i className="ri-eye-line me-1" aria-hidden="true"></i>View as student
                            </button>
                            <button
                              className="btn btn-outline-secondary btn-sm"
                              onClick={() => setSubmissionsTarget({ id: e.id, name: e.full_name })}
                              title="This participant's submissions across the whole cohort"
                            >
                              <i className="ri-file-list-3-line me-1" aria-hidden="true"></i>Submissions
                            </button>
                          </div>
                        </td>
                        <td className="small">
                          {formatDateTime(e.created_at || '')}
                          {e.created_at && <div className="text-muted" style={{ fontSize: '0.72rem' }}>{timeAgo(e.created_at)}</div>}
                        </td>
                      </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
        </SectionCard>
      )}

      {/* Attendance modal — opened from a session row in the Sessions drill-down
          (group/session-level view: an admin picks a session, sees its whole
          roster). Replaces the old standalone Attendance tab; same handlers/
          endpoints, relocated. */}
      {selectedSessionId && (
        <>
          <div className="modal-backdrop show" />
          <div className="modal show d-block" role="dialog" aria-modal="true">
            <div className="modal-dialog modal-lg">
              <div className="modal-content">
                <div className="modal-header">
                  <h5 className="modal-title">
                    Attendance — {sessions.find((s) => s.id === selectedSessionId)?.title || 'Session'}
                  </h5>
                  <button type="button" className="btn-close" onClick={() => setSelectedSessionId('')} />
                </div>
                <div className="modal-body">
                  <div className="d-flex justify-content-end gap-2 mb-3">
                    <button className="btn btn-success btn-sm" onClick={() => handleBulkAttendance('present')}>All Present</button>
                    <button className="btn btn-outline-danger btn-sm" onClick={() => handleBulkAttendance('absent')}>All Absent</button>
                  </div>
                  {attendanceLoading ? (
                    <div className="text-center py-4"><div className="spinner-border spinner-border-sm" role="status"><span className="visually-hidden">Loading...</span></div></div>
                  ) : (
                    <div className="table-responsive">
                      <table className="table table-hover mb-0">
                        <thead className="table-light">
                          <tr>
                            <th>Participant</th>
                            <th>Company</th>
                            <th>Status</th>
                          </tr>
                        </thead>
                        <tbody>
                          {enrollments.map((e) => {
                            const record = attendanceRecords.find((r) => r.enrollment_id === e.id);
                            return (
                              <tr key={e.id}>
                                <td className="fw-medium">{e.full_name}</td>
                                <td>{e.company}</td>
                                <td>
                                  <select
                                    className="form-select form-select-sm"
                                    style={{ width: 'auto' }}
                                    value={record?.status || 'absent'}
                                    onChange={(ev) => handleAttendanceChange(e.id, ev.target.value)}
                                  >
                                    <option value="present">Present</option>
                                    <option value="absent">Absent</option>
                                    <option value="late">Late</option>
                                    <option value="excused">Excused</option>
                                  </select>
                                </td>
                              </tr>
                            );
                          })}
                          {enrollments.length === 0 && (
                            <tr><td colSpan={3} className="text-center text-muted py-4">No enrollments in this cohort</td></tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
                <div className="modal-footer">
                  <button className="btn btn-outline-secondary btn-sm" onClick={() => setSelectedSessionId('')}>Close</button>
                </div>
              </div>
            </div>
          </div>
        </>
      )}

      {/* Submissions panel — opened from a Participants row (person-level view:
          this person's submissions across the whole cohort, not one session's
          submissions across all participants). Replaces the old standalone
          Submissions tab; reuses the existing review action unchanged. */}
      {submissionsTarget && (
        <>
          <div className="modal-backdrop show" />
          <div className="modal show d-block" role="dialog" aria-modal="true">
            <div className="modal-dialog modal-lg">
              <div className="modal-content">
                <div className="modal-header">
                  <h5 className="modal-title">Submissions — {submissionsTarget.name}</h5>
                  <button type="button" className="btn-close" onClick={() => setSubmissionsTarget(null)} />
                </div>
                <div className="modal-body">
                  {submissionsLoading ? (
                    <div className="text-center py-4"><div className="spinner-border spinner-border-sm" role="status"><span className="visually-hidden">Loading...</span></div></div>
                  ) : (
                    <div className="table-responsive">
                      <table className="table table-hover mb-0">
                        <thead className="table-light">
                          <tr>
                            <th>Assignment</th>
                            <th>Session</th>
                            <th>Type</th>
                            <th>Status</th>
                            <th>Score</th>
                            <th>Submitted</th>
                            <th>Actions</th>
                          </tr>
                        </thead>
                        <tbody>
                          {submissions.length === 0 ? (
                            <tr><td colSpan={7} className="text-center text-muted py-4">No submissions yet</td></tr>
                          ) : submissions.map((sub) => (
                            <tr key={sub.id}>
                              <td className="fw-medium">{sub.title}</td>
                              <td className="small">{sub.session ? `#${sub.session.session_number} ${sub.session.title}` : '—'}</td>
                              <td><StatusBadge label={sub.assignment_type.replace(/_/g, ' ')} tone="neutral" /></td>
                              <td>{statusBadge(sub.status)}</td>
                              <td>{sub.score != null ? `${sub.score}/100` : '-'}</td>
                              <td className="small">{sub.submitted_at ? new Date(sub.submitted_at).toLocaleDateString() : '-'}</td>
                              <td>
                                {sub.status === 'submitted' && (
                                  <button
                                    className="btn btn-outline-success btn-sm"
                                    onClick={() => handleReviewSubmission(sub.id, 80, 'Reviewed')}
                                  >
                                    Review
                                  </button>
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
                <div className="modal-footer">
                  <button className="btn btn-outline-secondary btn-sm" onClick={() => setSubmissionsTarget(null)}>Close</button>
                </div>
              </div>
            </div>
          </div>
        </>
      )}

      {activeTab === 'class-dashboard' && selectedCohortId && (
        <ClassDashboardTab cohortId={selectedCohortId} />
      )}

      {activeTab === 'curriculum' && (
        <AdminCurriculumTab
          cohortId={selectedCohortId}
          enrollments={enrollments.map((e) => ({ id: e.id, full_name: e.full_name, email: e.email, company: e.company }))}
          showToast={showToast}
        />
      )}

      {/* Class Kit — projector-friendly QR + start-class panel for a session */}
      {kitSessionId && (
        <ClassKitModal sessionId={kitSessionId} onClose={() => setKitSessionId(null)} />
      )}

      {/* Customize — instructor controls for story beats, Theater, Build Bay detail, evidence */}
      {customizeTarget && (
        <KitConfigModal
          sessionId={customizeTarget.id}
          sessionTitle={customizeTarget.title}
          initialCategory={customizeCategory}
          onClose={() => { setCustomizeTarget(null); setCustomizeCategory(undefined); }}
          showToast={showToast}
        />
      )}

      {/* Class Details — curriculum / week-blueprint for a session (opened from Title) */}

      {/* Session Create/Edit Modal */}
      {showSessionModal && (
        <>
          <div className="modal-backdrop show" />
          <div className="modal show d-block" role="dialog" aria-modal="true">
            <div className="modal-dialog">
              <div className="modal-content">
                <div className="modal-header">
                  <h5 className="modal-title">{editingSession ? 'Edit Session' : 'Add Session'}</h5>
                  <button type="button" className="btn-close" onClick={() => { setShowSessionModal(false); setEditingSession(null); }} />
                </div>
                <div className="modal-body">
                  <div className="mb-3">
                    <label className="form-label small fw-medium">Session Number</label>
                    <input type="number" className="form-control form-control-sm" value={sessionForm.session_number}
                      onChange={(e) => setSessionForm({ ...sessionForm, session_number: parseInt(e.target.value) || 1 })} />
                  </div>
                  <div className="mb-3">
                    <label className="form-label small fw-medium">Title</label>
                    <input type="text" className="form-control form-control-sm" value={sessionForm.title}
                      onChange={(e) => setSessionForm({ ...sessionForm, title: e.target.value })} placeholder="e.g. AI Governance Foundations" />
                  </div>
                  <div className="mb-3">
                    <label className="form-label small fw-medium">Description</label>
                    <textarea className="form-control form-control-sm" rows={2} value={sessionForm.description}
                      onChange={(e) => setSessionForm({ ...sessionForm, description: e.target.value })} />
                  </div>
                  <div className="row g-2 mb-3">
                    <div className="col">
                      <label className="form-label small fw-medium">Date</label>
                      <input type="date" className="form-control form-control-sm" value={sessionForm.session_date}
                        onChange={(e) => setSessionForm({ ...sessionForm, session_date: e.target.value })} />
                    </div>
                    <div className="col">
                      <label className="form-label small fw-medium">Type</label>
                      <select className="form-select form-select-sm" value={sessionForm.session_type}
                        onChange={(e) => setSessionForm({ ...sessionForm, session_type: e.target.value as 'core' | 'lab' })}>
                        <option value="core">Core</option>
                        <option value="lab">Lab</option>
                      </select>
                    </div>
                  </div>
                  <div className="row g-2 mb-3">
                    <div className="col">
                      <label className="form-label small fw-medium">Start Time (CT)</label>
                      <input type="time" className="form-control form-control-sm" value={sessionForm.start_time.slice(0, 5)}
                        onChange={(e) => setSessionForm({ ...sessionForm, start_time: e.target.value })} />
                    </div>
                    <div className="col">
                      <label className="form-label small fw-medium">End Time (CT)</label>
                      <input type="time" className="form-control form-control-sm" value={sessionForm.end_time.slice(0, 5)}
                        onChange={(e) => setSessionForm({ ...sessionForm, end_time: e.target.value })} />
                    </div>
                  </div>
                </div>
                <div className="modal-footer">
                  <button className="btn btn-outline-secondary btn-sm" onClick={() => { setShowSessionModal(false); setEditingSession(null); }}>Cancel</button>
                  <button className="btn btn-primary btn-sm" onClick={editingSession ? handleUpdateSessionSubmit : handleCreateSession}>
                    {editingSession ? 'Update' : 'Create'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </>
      )}

      {/* Person 360 drill-down drawer */}
      {historyTarget && (
        <PersonHistoryDrawer
          enrollmentId={historyTarget.id}
          name={historyTarget.name}
          onClose={() => setHistoryTarget(null)}
          onViewAsStudent={handleViewAsStudent}
        />
      )}

      {/* Delete Confirm */}
      <ConfirmModal
        show={!!deleteTarget}
        title="Delete Session"
        message="Are you sure you want to delete this session? All attendance records and submissions for this session will also be deleted."
        confirmLabel="Delete"
        confirmVariant="danger"
        onConfirm={handleDeleteSession}
        onCancel={() => setDeleteTarget(null)}
      />

      {/* Skip (day off) Confirm */}
      <ConfirmModal
        show={!!skipTarget}
        title="Mark Day Off"
        message={skipTarget
          ? `Mark ${formatDate(skipTarget.session_date)} as a day off? This class and all later ones shift forward one slot. You can un-skip later.`
          : ''}
        confirmLabel="Mark Day Off"
        confirmVariant="warning"
        onConfirm={handleSkipSession}
        onCancel={() => setSkipTarget(null)}
      />

      {/* Un-skip (restore day off) Confirm */}
      <ConfirmModal
        show={!!unskipTarget}
        title="Remove Day Off"
        message={unskipTarget
          ? `Remove the ${formatDate(unskipTarget)} day off? Later sessions compact back onto that date.`
          : ''}
        confirmLabel="Remove Day Off"
        confirmVariant="primary"
        onConfirm={handleUnskip}
        onCancel={() => setUnskipTarget(null)}
      />
    </>
  );
}

export default AdminAcceleratorPage;
