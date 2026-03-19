import React, { useEffect, useRef, useState } from 'react';
import FunnelFlowVisualization from './FunnelFlowVisualization';
import InsightPanel from './InsightPanel';

// ─── Fade-in helper (same pattern as DreamBigSection) ────────────────────────

function fadeStyle(visible: boolean, delay: number): React.CSSProperties {
  return {
    opacity: visible ? 1 : 0,
    transform: visible ? 'translateY(0)' : 'translateY(16px)',
    transition: `opacity 0.6s ease ${delay}s, transform 0.6s ease ${delay}s`,
  };
}

// ─── Main Section ────────────────────────────────────────────────────────────

interface Props {
  onOpenBooking: () => void;
}

export default function IntelligenceDemoSection({ onOpenBooking }: Props) {
  const sectionRef = useRef<HTMLElement>(null);
  const [visible, setVisible] = useState(false);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);

  // Scroll-triggered entrance (reuse DreamBigSection pattern)
  useEffect(() => {
    const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (prefersReduced) {
      setVisible(true);
      return;
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisible(true);
          observer.disconnect();
        }
      },
      { threshold: 0.1 },
    );

    if (sectionRef.current) observer.observe(sectionRef.current);
    return () => observer.disconnect();
  }, []);

  return (
    <section
      ref={sectionRef}
      className="section py-5"
      style={{ background: 'linear-gradient(180deg, #ffffff 0%, #f7fafc 100%)' }}
      aria-label="Intelligence Demo"
    >
      <div className="container">
        {/* Header */}
        <div className="text-center mb-5" style={fadeStyle(visible, 0)}>
          <h2 className="display-6 fw-bold mb-3" style={{ color: 'var(--color-primary)' }}>
            Are You Ready to Reimagine Your Business?
          </h2>
          <p className="fs-5 text-muted mb-0" style={{ maxWidth: 680, margin: '0 auto' }}>
            See how AI reveals exactly how customers move, engage, and convert — in real time.
            Watch the flow: faster movement means stronger channels. Click any stage to explore.
          </p>
        </div>

        {/* Two-column demo */}
        <div className="row g-4 align-items-start" style={fadeStyle(visible, 0.15)}>
          <div className="col-lg-7">
            <FunnelFlowVisualization
              selectedId={selectedNodeId}
              onNodeClick={setSelectedNodeId}
            />
          </div>
          <div className="col-lg-5">
            <InsightPanel selectedStageId={selectedNodeId} />
          </div>
        </div>

        {/* CTA */}
        <div className="text-center mt-5 pt-4" style={fadeStyle(visible, 0.3)}>
          <h3 className="h4 fw-bold mb-3" style={{ color: 'var(--color-primary)' }}>
            What could you see, understand, and optimize in your business?
          </h3>
          <p className="text-muted mb-4">
            Turn invisible customer behavior into actionable intelligence.
          </p>
          <div className="d-flex flex-column flex-sm-row justify-content-center gap-3">
            <a href="#download-overview" className="btn btn-lg btn-hero-primary">
              Build Your AI System
            </a>
            <button
              className="btn btn-lg btn-outline-primary"
              onClick={onOpenBooking}
            >
              See It For Your Business
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}
