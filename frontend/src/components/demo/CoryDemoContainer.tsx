import React, { useState, useCallback, lazy, Suspense } from 'react';
import { DEMO_DEPARTMENTS, getKpisForDepartment, getExecutiveSummary } from './demoData';
import DepartmentMapDemo from './DepartmentMapDemo';
import CoryLoadingAnimation from './CoryLoadingAnimation';
import DepartmentReportPanel from './DepartmentReportPanel';
import AskCoryInput from './AskCoryInput';
import KpiOverviewRow from './KpiOverviewRow';
import ExecutiveSummaryPanel from './ExecutiveSummaryPanel';
import InsightCharts from './InsightCharts';

// Lazy-load the graph (heavy dependency: reactflow)
const DepartmentGraphDemo = lazy(() => import('./DepartmentGraphDemo'));

interface CoryDemoContainerProps {
  onOpenBooking: () => void;
}

export default function CoryDemoContainer({ onOpenBooking }: CoryDemoContainerProps) {
  const [selectedId, setSelectedId] = useState<string>('strategy');
  const [loading, setLoading] = useState(false);
  const [reportDeptId, setReportDeptId] = useState<string>('strategy');

  const selectedDept = DEMO_DEPARTMENTS.find((d) => d.id === selectedId);
  const reportDept = DEMO_DEPARTMENTS.find((d) => d.id === reportDeptId);
  const kpis = getKpisForDepartment(reportDeptId);
  const execSummary = getExecutiveSummary(reportDeptId);

  const handleSelect = useCallback(
    (id: string) => {
      if (id === selectedId && !loading) return;
      setSelectedId(id);
      setLoading(true);
    },
    [selectedId, loading],
  );

  const handleLoadingComplete = useCallback(() => {
    setLoading(false);
    setReportDeptId(selectedId);
  }, [selectedId]);

  const scrollToDownload = useCallback(() => {
    document.getElementById('download-overview')?.scrollIntoView({ behavior: 'smooth' });
  }, []);

  return (
    <section className="section-alt py-5" aria-label="AI Intelligence System Demo">
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
          <p className="text-muted mb-0" style={{ maxWidth: '680px', margin: '0 auto' }}>
            This is a simplified demonstration of the type of AI intelligence systems
            participants design and deploy during the accelerator. Click any department
            to explore its analysis.
          </p>
        </div>

        {/* KPI Dashboard Row */}
        <KpiOverviewRow kpis={kpis} />

        {/* Executive Summary */}
        <ExecutiveSummaryPanel summary={execSummary} />

        {/* Main Layout: Graph/Grid Left + Report Right */}
        <div className="row g-4">
          {/* Left: Graph (desktop) / Card Grid (mobile) */}
          <div className="col-lg-5">
            {/* Desktop: Zoomable Graph */}
            <div className="d-none d-md-block">
              <Suspense
                fallback={
                  <div
                    className="placeholder-glow rounded"
                    style={{ height: 480, background: 'var(--color-bg-alt)' }}
                  >
                    <span className="placeholder col-12 h-100" />
                  </div>
                }
              >
                <DepartmentGraphDemo
                  selectedId={selectedId}
                  onSelect={handleSelect}
                />
              </Suspense>
            </div>

            {/* Mobile: Card Grid Fallback */}
            <div className="d-md-none">
              <DepartmentMapDemo
                departments={DEMO_DEPARTMENTS}
                selectedId={selectedId}
                onSelect={handleSelect}
              />
            </div>
          </div>

          {/* Right: Report Panel */}
          <div className="col-lg-7">
            {loading && selectedDept ? (
              <div className="card border-0 shadow-sm h-100 d-flex align-items-center justify-content-center">
                <CoryLoadingAnimation
                  agentNames={selectedDept.agentNames}
                  onComplete={handleLoadingComplete}
                />
              </div>
            ) : reportDept ? (
              <>
                <DepartmentReportPanel department={reportDept} />
                <AskCoryInput onNavigate={scrollToDownload} />
              </>
            ) : (
              <div className="card border-0 shadow-sm h-100 d-flex align-items-center justify-content-center p-5">
                <p className="text-muted mb-0">
                  Select a department to view its AI intelligence report
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Insight Charts (Radar + Bar) */}
        {reportDept && <InsightCharts department={reportDept} />}

        {/* CTAs Below Demo */}
        <div className="text-center mt-5">
          <a
            href="#download-overview"
            className="btn btn-lg btn-hero-primary me-3 mb-2"
          >
            Design Your AI Deployment Blueprint
          </a>
          <button
            type="button"
            className="btn btn-lg btn-outline-primary mb-2"
            onClick={onOpenBooking}
          >
            Schedule a Deployment Scoping Call
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
