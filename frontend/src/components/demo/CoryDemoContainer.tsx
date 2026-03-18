import React, { useState, useCallback, useEffect, useRef, lazy, Suspense } from 'react';
import { DEMO_DEPARTMENTS, getKpisForDepartment, getExecutiveSummary } from './demoData';
import DepartmentMapDemo from './DepartmentMapDemo';
import CoryLoadingAnimation from './CoryLoadingAnimation';
import DepartmentReportPanel from './DepartmentReportPanel';
import AskCoryInput from './AskCoryInput';
import KpiOverviewRow from './KpiOverviewRow';
import ExecutiveSummaryPanel from './ExecutiveSummaryPanel';
import InsightCharts from './InsightCharts';
import { useAdminUser } from '../../hooks/useAdminUser';
import { STANDARD_CTAS } from '../../config/programSchedule';

// Lazy-load the graph (heavy dependency: reactflow)
const DepartmentGraphDemo = lazy(() => import('./DepartmentGraphDemo'));

// Deterministic sequence derived from data source
const DEMO_SEQUENCE = DEMO_DEPARTMENTS.map((d) => d.id);

interface CoryDemoContainerProps {
  onOpenBooking: () => void;
  onDepartmentChange?: (deptId: string) => void;
}

export default function CoryDemoContainer({ onOpenBooking, onDepartmentChange }: CoryDemoContainerProps) {
  const [selectedId, setSelectedId] = useState<string>('strategy');
  const [loading, setLoading] = useState(false);
  const [reportDeptId, setReportDeptId] = useState<string>('strategy');

  // Demo mode state
  const [demoActive, setDemoActive] = useState(false);
  const [demoPaused, setDemoPaused] = useState(false);
  const demoIndexRef = useRef(0);

  // Cinematic zoom state
  const [demoZoomTarget, setDemoZoomTarget] = useState<string | null>(null);
  const [isZoomedIn, setIsZoomedIn] = useState(false);

  // Ali user detection — demo never auto-starts for admin users
  const adminUser = useAdminUser();
  const isAdminUser = adminUser?.email === 'ali@colaberry.com' || adminUser?.role === 'super_admin';

  const selectedDept = DEMO_DEPARTMENTS.find((d) => d.id === selectedId);
  const reportDept = DEMO_DEPARTMENTS.find((d) => d.id === reportDeptId);
  const kpis = getKpisForDepartment(reportDeptId);
  const execSummary = getExecutiveSummary(reportDeptId);

  const handleSelect = useCallback(
    (id: string) => {
      if (id === selectedId && !loading) return;
      setSelectedId(id);
      setLoading(true);
      onDepartmentChange?.(id);
    },
    [selectedId, loading, onDepartmentChange],
  );

  const handleLoadingComplete = useCallback(() => {
    setLoading(false);
    setReportDeptId(selectedId);
  }, [selectedId]);

  const scrollToDownload = useCallback(() => {
    document.getElementById('download-overview')?.scrollIntoView({ behavior: 'smooth' });
  }, []);

  // ─── Demo Mode: Stop on user interaction ───────────────────────────
  const stopDemo = useCallback(() => {
    setDemoActive(false);
    setDemoPaused(true);
    setIsZoomedIn(false);
    setDemoZoomTarget(null);
  }, []);

  // User-initiated selection: stop demo + select department
  const handleUserSelect = useCallback(
    (id: string) => {
      stopDemo();
      handleSelect(id);
    },
    [stopDemo, handleSelect],
  );

  // ─── Demo Mode: Auto-start after 5s for non-admin visitors ────────
  useEffect(() => {
    if (isAdminUser || demoPaused) return;
    const timeout = setTimeout(() => {
      setDemoActive(true);
    }, 5000);
    return () => clearTimeout(timeout);
  }, [isAdminUser, demoPaused]);

  // ─── Demo Mode: Core cycling engine with cinematic zoom ────────────
  useEffect(() => {
    if (!demoActive || demoPaused) return;

    // Select + zoom into current department immediately on activation
    const currentId = DEMO_SEQUENCE[demoIndexRef.current];
    setSelectedId(currentId);
    setReportDeptId(currentId);
    setDemoZoomTarget(currentId);
    setIsZoomedIn(true);
    onDepartmentChange?.(currentId);

    // Schedule zoom-out at 4s mark (2s before next department)
    let zoomOutTimeout = setTimeout(() => {
      setIsZoomedIn(false);
    }, 4000);

    const interval = setInterval(() => {
      demoIndexRef.current = (demoIndexRef.current + 1) % DEMO_SEQUENCE.length;
      const nextId = DEMO_SEQUENCE[demoIndexRef.current];

      // Select department + zoom in
      setSelectedId(nextId);
      setReportDeptId(nextId);
      setDemoZoomTarget(nextId);
      setIsZoomedIn(true);
      onDepartmentChange?.(nextId);

      // Schedule zoom-out at 4s into this cycle
      clearTimeout(zoomOutTimeout);
      zoomOutTimeout = setTimeout(() => {
        setIsZoomedIn(false);
      }, 4000);
    }, 6000);

    return () => {
      clearInterval(interval);
      clearTimeout(zoomOutTimeout);
    };
  }, [demoActive, demoPaused, onDepartmentChange]);

  const isDemoRunning = demoActive && !demoPaused;

  // Dynamic department glow — the section border/glow reflects the active department
  const activeDept = DEMO_DEPARTMENTS.find(d => d.id === selectedId);
  const deptColor = activeDept?.color || 'transparent';

  return (
    <section
      className="section-alt py-5"
      aria-label="AI Intelligence System Demo"
      onClick={isDemoRunning ? stopDemo : undefined}
      style={{
        border: `2px solid ${deptColor}`,
        borderRadius: '12px',
        boxShadow: `0 0 24px ${deptColor}40, 0 0 48px ${deptColor}20`,
        transition: 'border-color 0.3s ease, box-shadow 0.3s ease, border 0.3s ease',
      }}
    >
      <div className="container">
        {/* Context Label + Heading */}
        <div className="text-center mb-4">
          <span
            className="badge rounded-pill px-3 py-2 mb-3 d-inline-block"
            style={{
              background: 'var(--color-bg-alt)',
              color: 'var(--color-text-light)',
              fontSize: '0.8rem',
              border: '1px solid var(--color-border)',
            }}
          >
            Example AI Operations Intelligence System
          </span>
          <h2 className="mb-2">See an AI Organization in Action</h2>
          <p className="text-muted mb-1" style={{ maxWidth: '680px', margin: '0 auto' }}>
            This is a simplified demonstration of the type of AI intelligence systems
            participants design and deploy during the accelerator.
          </p>
          <p className="fs-5 fw-semibold mb-0" style={{ color: 'var(--color-primary)' }}>
            {isDemoRunning
              ? 'Click anywhere to take control.'
              : 'Click any department to explore its analysis.'}
          </p>
        </div>

        {/* Admin-style layout: Graph LEFT, Intelligence Panel RIGHT */}
        <div className="row g-4">
          {/* LEFT COLUMN: Department Graph */}
          <div className="col-lg-5">
            {/* Desktop: Zoomable Graph */}
            <div className="d-none d-md-block" style={{ position: 'sticky', top: 24 }}>
              {/* Live Demo indicator */}
              {isDemoRunning && (
                <span
                  className="position-absolute badge"
                  style={{
                    top: 8,
                    right: 8,
                    zIndex: 10,
                    background: 'rgba(26,54,93,0.85)',
                    color: '#fff',
                    fontSize: '0.7rem',
                    padding: '4px 10px',
                    borderRadius: 12,
                    animation: 'fadeIn 0.3s ease',
                  }}
                >
                  &#9654; Live Demo
                </span>
              )}
              <Suspense
                fallback={
                  <div
                    className="placeholder-glow rounded"
                    style={{ height: 520, background: 'var(--color-bg-alt)' }}
                  >
                    <span className="placeholder col-12 h-100" />
                  </div>
                }
              >
                <DepartmentGraphDemo
                  selectedId={selectedId}
                  onSelect={handleUserSelect}
                  demoZoomTarget={isDemoRunning ? demoZoomTarget : null}
                  isZoomedIn={isDemoRunning && isZoomedIn}
                />
              </Suspense>
            </div>

            {/* Mobile: Card Grid Fallback */}
            <div className="d-md-none">
              <DepartmentMapDemo
                departments={DEMO_DEPARTMENTS}
                selectedId={selectedId}
                onSelect={handleUserSelect}
              />
            </div>
          </div>

          {/* RIGHT COLUMN: KPIs → Summary → Report → Charts (stacked) */}
          <div className="col-lg-7">
            {/* KPI Dashboard Row */}
            <KpiOverviewRow kpis={kpis} />

            {/* Executive Summary */}
            <ExecutiveSummaryPanel summary={execSummary} />

            {/* Report Panel or Loading */}
            {loading && selectedDept ? (
              <div className="card border-0 shadow-sm d-flex align-items-center justify-content-center" style={{ minHeight: 300 }}>
                <CoryLoadingAnimation
                  agentNames={selectedDept.agentNames}
                  onComplete={handleLoadingComplete}
                />
              </div>
            ) : reportDept ? (
              <>
                <DepartmentReportPanel department={reportDept} />

                {/* Insight Charts (Radar + Bar) — stacked under report */}
                <InsightCharts department={reportDept} />

                <AskCoryInput onNavigate={scrollToDownload} />
              </>
            ) : (
              <div className="card border-0 shadow-sm d-flex align-items-center justify-content-center p-5" style={{ minHeight: 300 }}>
                <p className="text-muted mb-0">
                  Select a department to view its AI intelligence report
                </p>
              </div>
            )}
          </div>
        </div>

        {/* CTAs Below Demo */}
        <div className="text-center mt-5">
          <a
            href="#download-overview"
            className="btn btn-lg btn-hero-primary me-3 mb-2"
          >
            {STANDARD_CTAS.primary}
          </a>
          <button
            type="button"
            className="btn btn-lg btn-outline-primary mb-2"
            onClick={onOpenBooking}
          >
            {STANDARD_CTAS.secondary}
          </button>
        </div>
      </div>

      {/* Animation keyframes */}
      <style>{`
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(4px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .demo-pulse-dot {
          animation: demoPulse 2s ease-in-out infinite;
        }
        @keyframes demoPulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.3; }
        }
        @keyframes nodePulse {
          0% { transform: scale(1); }
          50% { transform: scale(1.05); }
          100% { transform: scale(1); }
        }
        @media (prefers-reduced-motion: reduce) {
          .demo-pulse-dot { animation: none; }
          @keyframes fadeIn {
            from { opacity: 1; transform: none; }
            to { opacity: 1; transform: none; }
          }
          @keyframes nodePulse {
            from { transform: scale(1); }
            to { transform: scale(1); }
          }
        }
      `}</style>
    </section>
  );
}
