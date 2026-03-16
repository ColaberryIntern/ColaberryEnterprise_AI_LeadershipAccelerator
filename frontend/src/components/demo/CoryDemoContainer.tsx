import React, { useState, useCallback } from 'react';
import { DEMO_DEPARTMENTS } from './demoData';
import DepartmentMapDemo from './DepartmentMapDemo';
import CoryLoadingAnimation from './CoryLoadingAnimation';
import DepartmentReportPanel from './DepartmentReportPanel';
import AskCoryInput from './AskCoryInput';

interface CoryDemoContainerProps {
  onOpenBooking: () => void;
}

export default function CoryDemoContainer({ onOpenBooking }: CoryDemoContainerProps) {
  // Default to Strategy department on mount (show report immediately)
  const [selectedId, setSelectedId] = useState<string>('strategy');
  const [loading, setLoading] = useState(false);
  const [reportDeptId, setReportDeptId] = useState<string>('strategy');

  const selectedDept = DEMO_DEPARTMENTS.find((d) => d.id === selectedId);
  const reportDept = DEMO_DEPARTMENTS.find((d) => d.id === reportDeptId);

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
    <section
      className="section-alt py-5"
      aria-label="AI Intelligence System Demo"
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
          <p
            className="text-muted mb-0"
            style={{ maxWidth: '680px', margin: '0 auto' }}
          >
            This is a simplified demonstration of the type of AI systems
            participants design and deploy during the accelerator. Click any
            department to see its intelligence report.
          </p>
        </div>

        {/* 2-Column Layout */}
        <div className="row g-4">
          {/* Left: Department Cards */}
          <div className="col-md-4">
            <DepartmentMapDemo
              departments={DEMO_DEPARTMENTS}
              selectedId={selectedId}
              onSelect={handleSelect}
            />
          </div>

          {/* Right: Report Panel */}
          <div className="col-md-8">
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

      {/* Pulse animation keyframes */}
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
        @media (prefers-reduced-motion: reduce) {
          .demo-pulse-dot { animation: none; }
          @keyframes fadeIn {
            from { opacity: 1; transform: none; }
            to { opacity: 1; transform: none; }
          }
        }
      `}</style>
    </section>
  );
}
