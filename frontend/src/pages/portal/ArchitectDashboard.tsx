import React, { useEffect, useState } from 'react';
import portalApi from '../../utils/portalApi';
import {
  StudentQueueSection,
  RunMyDayMode,
  type StudentQueueItem,
} from './CoryHomeParts';

interface DayMetrics {
  tasks_completed_today: number;
  tasks_remaining: number;
  total_active: number;
  completion_pct: number;
  date: string;
  project_id: string | null;
}

const METRIC_TILES = (m: DayMetrics) => [
  { label: 'Completed today', value: String(m.tasks_completed_today), color: '#10b981', icon: 'bi-check-circle-fill' },
  { label: 'Remaining',       value: String(m.tasks_remaining),        color: '#3b82f6', icon: 'bi-list-task' },
  { label: 'Progress',        value: `${m.completion_pct}%`,           color: '#FB2832', icon: 'bi-speedometer2' },
];

const ArchitectDashboard: React.FC = () => {
  const [metrics, setMetrics] = useState<DayMetrics | null>(null);
  const [studentQueue, setStudentQueue] = useState<StudentQueueItem[]>([]);
  const [sqLoading, setSqLoading] = useState(true);
  const [sqError, setSqError] = useState<string | null>(null);
  const [sqExpandedId, setSqExpandedId] = useState<string | null>(null);
  const [sqCopiedId, setSqCopiedId] = useState<string | null>(null);
  const [sqDecidingId, setSqDecidingId] = useState<string | null>(null);
  const [walkMode, setWalkMode] = useState(false);
  const [walkIndex, setWalkIndex] = useState(0);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setSqLoading(true);
      setSqError(null);
      try {
        const [queueRes, metricsRes] = await Promise.all([
          portalApi.get<{ items: StudentQueueItem[] }>('/api/portal/student-ops/my-queue'),
          portalApi.get<DayMetrics>('/api/portal/student-ops/metrics/today').catch(() => ({ data: null })),
        ]);
        if (!cancelled) {
          setStudentQueue(queueRes.data.items || []);
          if (metricsRes.data) setMetrics(metricsRes.data);
        }
      } catch (err: any) {
        if (!cancelled) setSqError(err?.response?.data?.error || err?.message || 'Failed to load queue');
      } finally {
        if (!cancelled) setSqLoading(false);
      }
    };
    void load();
    return () => { cancelled = true; };
  }, []);

  const handleSqToggle = (id: string) =>
    setSqExpandedId((prev) => (prev === id ? null : id));

  const handleSqDone = async (id: string) => {
    setSqDecidingId(id);
    try {
      await portalApi.post('/api/portal/student-ops/decide', { requirement_id: id, decision: 'done' });
      setStudentQueue((prev) => prev.filter((q) => q.id !== id));
      if (walkMode && walkIndex >= studentQueue.length - 1) setWalkIndex(Math.max(0, studentQueue.length - 2));
    } catch { /* fail silently — queue item stays; user can retry */ } finally {
      setSqDecidingId(null);
    }
  };

  const handleSqDefer = (id: string) => {
    setStudentQueue((prev) => {
      const idx = prev.findIndex((q) => q.id === id);
      if (idx < 0) return prev;
      const next = [...prev];
      const [item] = next.splice(idx, 1);
      next.push({ ...item, rank: next.length + 1 });
      return next.map((q, i) => ({ ...q, rank: i + 1 }));
    });
  };

  const handleSqFlagBlocker = async (id: string) => {
    setSqDecidingId(id);
    try {
      await portalApi.post('/api/portal/student-ops/decide', { requirement_id: id, decision: 'flag_blocker' });
      setStudentQueue((prev) => prev.map((q) => (q.id === id ? { ...q, status: 'unmatched' } : q)));
    } catch { /* fail silently */ } finally {
      setSqDecidingId(null);
      setSqExpandedId(null);
    }
  };

  const handleSqCopyPrompt = (prompt: string, id?: string) => {
    try { navigator.clipboard.writeText(prompt); } catch { /* ignore */ }
    const targetId = id ?? sqExpandedId;
    if (targetId) {
      setSqCopiedId(targetId);
      setTimeout(() => setSqCopiedId(null), 2000);
    }
  };

  // Keyboard nav for Run My Day walk mode
  useEffect(() => {
    if (!walkMode) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight') setWalkIndex((i) => Math.min(studentQueue.length - 1, i + 1));
      else if (e.key === 'ArrowLeft') setWalkIndex((i) => Math.max(0, i - 1));
      else if (e.key === 'Escape') setWalkMode(false);
      else if (e.key === ' ') {
        e.preventDefault();
        const item = studentQueue[walkIndex];
        if (item) handleSqCopyPrompt(item.claude_code_prompt, item.id);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [walkMode, walkIndex, studentQueue]); // eslint-disable-line

  return (
    <div style={{ maxWidth: 900, margin: '0 auto', padding: '1.5rem 1rem 3rem' }}>

      <header className="mb-4">
        <h1 className="h4 fw-bold mb-1" style={{ color: '#1e293b' }}>
          <i className="bi bi-cpu me-2" style={{ color: '#FB2832' }}></i>
          AI Systems Architect
        </h1>
        <p className="text-muted small mb-0">
          Your build queue, ranked by urgency. Copy a prompt and start building.
        </p>
      </header>

      {/* Today's metrics — soft-fail: hidden when unavailable */}
      {metrics && (
        <div className="row g-3 mb-4">
          {METRIC_TILES(metrics).map((tile) => (
            <div className="col-4" key={tile.label}>
              <div className="card border-0 shadow-sm h-100">
                <div className="card-body text-center py-3">
                  <div
                    className="d-inline-flex align-items-center justify-content-center rounded-circle mb-2"
                    style={{ width: 40, height: 40, background: `${tile.color}18` }}
                  >
                    <i className={`bi ${tile.icon}`} style={{ fontSize: 18, color: tile.color }}></i>
                  </div>
                  <div className="fw-bold" style={{ fontSize: 26, color: tile.color }}>
                    {tile.value}
                  </div>
                  <div className="text-muted small">{tile.label}</div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <StudentQueueSection
        items={studentQueue}
        loading={sqLoading}
        error={sqError}
        expandedId={sqExpandedId}
        onToggle={handleSqToggle}
        onDone={handleSqDone}
        onDefer={handleSqDefer}
        onFlagBlocker={handleSqFlagBlocker}
        onCopyPrompt={(prompt) => handleSqCopyPrompt(prompt)}
        copiedId={sqCopiedId}
        decidingId={sqDecidingId}
        onEnterWalkMode={() => { setWalkIndex(0); setWalkMode(true); }}
      />

      {walkMode && studentQueue.length > 0 && (
        <RunMyDayMode
          items={studentQueue}
          currentIndex={walkIndex}
          onNav={(delta) => setWalkIndex((i) => Math.max(0, Math.min(studentQueue.length - 1, i + delta)))}
          onExit={() => setWalkMode(false)}
          onDone={(id) => {
            void handleSqDone(id);
            if (walkIndex >= studentQueue.length - 1) setWalkMode(false);
          }}
          onDefer={(id) => {
            handleSqDefer(id);
            if (walkIndex >= studentQueue.length - 1) setWalkIndex(Math.max(0, studentQueue.length - 2));
          }}
          onCopyPrompt={handleSqCopyPrompt}
          copiedId={sqCopiedId}
          decidingId={sqDecidingId}
        />
      )}
    </div>
  );
};

export default ArchitectDashboard;
