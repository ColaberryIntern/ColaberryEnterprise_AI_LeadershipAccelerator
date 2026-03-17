import React, { useEffect, useRef, useState } from 'react';

interface DreamBigSectionProps {
  onOpenBooking: () => void;
}

const STEPS = [
  {
    icon: '\u{1F4A1}',
    title: 'Ideation',
    color: '#1a365d',
    description:
      'Examine your organization and identify problems or opportunities where AI could create meaningful improvements. Don\u2019t have an idea yet? Our mentors help you discover one.',
    examples: [
      'Automating repetitive workflows',
      'Building internal analytics tools',
      'Creating AI-powered assistants',
      'Improving decision-support systems',
    ],
    outcome: 'AI Opportunity Map',
  },
  {
    icon: '\u{1F4D0}',
    title: 'Plan',
    color: '#805ad5',
    description:
      'Learn how AI systems are structured and design the architecture for your own solution. Map out the components, data flows, and integrations your system needs.',
    examples: [
      'AI-powered workflow automation',
      'Internal intelligence dashboards',
      'Customer insight engines',
      'Operational optimization systems',
    ],
    outcome: 'AI System Blueprint',
  },
  {
    icon: '\u2699\uFE0F',
    title: 'Build',
    color: '#38a169',
    description:
      'Start building your solution using modern AI development tools like Claude Code. Write real code, configure real systems, and see your idea take shape.',
    examples: [
      'AI-powered internal assistants',
      'Automated reporting systems',
      'Predictive analytics tools',
      'Process automation engines',
    ],
    outcome: 'Functional AI System',
  },
  {
    icon: '\u{1F680}',
    title: 'Deploy',
    color: '#e53e3e',
    description:
      'Your working system becomes the starting point for implementation inside your organization. Leave with a system you can expand and scale.',
    examples: [
      'Deployable AI applications',
      'Production-ready architectures',
      'Expansion roadmaps',
      'Team enablement documentation',
    ],
    outcome: 'Deployable AI Solution',
  },
];

export default function DreamBigSection({ onOpenBooking }: DreamBigSectionProps) {
  const sectionRef = useRef<HTMLElement>(null);
  const [visible, setVisible] = useState(false);

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
      { threshold: 0.15 },
    );

    if (sectionRef.current) observer.observe(sectionRef.current);
    return () => observer.disconnect();
  }, []);

  return (
    <section ref={sectionRef} className="section py-5" aria-label="Deployment Process">
      <div className="container">
        {/* Heading */}
        <div className="text-center mb-4">
          <h2 className="display-6 fw-bold mb-4">How It Works</h2>
          <h3 className="h3 mb-3">Dream Big. Build What You Always Wished Your Company Had.</h3>
          <p className="text-muted mb-0" style={{ maxWidth: 720, margin: '0 auto' }}>
            Bring your most ambitious ideas. In this accelerator, your team learns how to design
            and build AI systems tailored to your own organization.
          </p>
        </div>

        {/* Dream Big highlight card */}
        <div
          className="card border-0 shadow-sm mb-5 mx-auto"
          style={{ maxWidth: 800, borderLeft: '4px solid var(--color-primary)' }}
        >
          <div className="card-body p-4">
            <p className="mb-2 text-muted">
              The system above is just an example of what AI-powered intelligence looks like.
            </p>
            <p className="mb-2 fw-semibold" style={{ color: 'var(--color-primary)' }}>
              Now imagine one built for YOUR organization — analyzing your workflows, surfacing
              opportunities in your data, and automating the processes that slow your team down.
            </p>
            <p className="mb-2 text-muted">
              In this accelerator, you bring YOUR ideas. Colaberry mentors help you expand them,
              design the architecture, and begin building using modern AI development tools like{' '}
              <strong>Claude Code</strong>.
            </p>
            <p className="mb-0 text-muted">
              Don&rsquo;t have a clear idea yet? That&rsquo;s fine. Our mentors help you discover
              where AI can create the most value inside your organization.
            </p>
          </div>
        </div>

        {/* Four-step process flow */}
        <div className="row g-4 mb-5">
          {STEPS.map((step, i) => (
            <React.Fragment key={step.title}>
              <div
                className="col-md-6 col-lg-3 d-flex"
                style={{
                  opacity: visible ? 1 : 0,
                  transform: visible ? 'translateY(0)' : 'translateY(16px)',
                  transition: `opacity 0.5s ease ${i * 0.15}s, transform 0.5s ease ${i * 0.15}s`,
                }}
              >
                <div
                  className="card border-0 shadow-sm w-100"
                  style={{ borderTop: `3px solid ${step.color}` }}
                >
                  <div className="card-body p-3">
                    {/* Step number + icon */}
                    <div className="d-flex align-items-center gap-2 mb-2">
                      <span
                        className="badge rounded-circle d-flex align-items-center justify-content-center"
                        style={{
                          width: 28,
                          height: 28,
                          backgroundColor: step.color,
                          color: '#fff',
                          fontSize: '0.75rem',
                          flexShrink: 0,
                        }}
                      >
                        {i + 1}
                      </span>
                      <span style={{ fontSize: '1.4rem' }} aria-hidden="true">
                        {step.icon}
                      </span>
                      <h3 className="h6 fw-bold mb-0" style={{ color: step.color }}>
                        {step.title}
                      </h3>
                    </div>

                    <p className="small text-muted mb-3">{step.description}</p>

                    {/* Examples */}
                    <ul className="list-unstyled small mb-3">
                      {step.examples.map((ex) => (
                        <li key={ex} className="mb-1 text-muted">
                          <span style={{ color: step.color }}>&#9654;</span> {ex}
                        </li>
                      ))}
                    </ul>

                    {/* Outcome badge */}
                    <span
                      className="badge bg-light text-dark border"
                      style={{ fontSize: '0.7rem' }}
                    >
                      Outcome: {step.outcome}
                    </span>
                  </div>
                </div>
              </div>
            </React.Fragment>
          ))}
        </div>

        {/* Step flow label (desktop only) */}
        <div className="d-none d-lg-flex justify-content-center align-items-center gap-3 mb-4" aria-hidden="true">
          {STEPS.map((step, i) => (
            <React.Fragment key={step.title}>
              <span className="fw-semibold small" style={{ color: step.color }}>{step.title}</span>
              {i < STEPS.length - 1 && (
                <span style={{ color: 'var(--color-text-light)', fontSize: '1.1rem' }}>&#8594;</span>
              )}
            </React.Fragment>
          ))}
        </div>

        {/* Reinforcement */}
        <h3 className="h4 fw-bold text-center mb-3">The 21-Day Engine: From Concept to Working Product</h3>
        <p className="text-center text-muted mb-5" style={{ maxWidth: 680, margin: '0 auto' }}>
          In this accelerator, your team goes from idea to working product in 3 weeks.
        </p>

        {/* CTAs */}
        <div className="text-center">
          <a href="#download-overview" className="btn btn-lg btn-hero-primary me-3 mb-2">
            Get the Blueprint
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
    </section>
  );
}
