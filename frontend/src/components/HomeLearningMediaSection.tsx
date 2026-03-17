import React from 'react';

interface HomeLearningMediaSectionProps {
  podcastUrl?: string;
}

export default function HomeLearningMediaSection({ podcastUrl }: HomeLearningMediaSectionProps) {
  return (
    <section className="section-alt py-5" aria-label="Learning Media">
      <div className="container">
        {/* Intro */}
        <div className="text-center mb-5">
          <h2 className="mb-3">Understand the Enterprise AI Leadership Accelerator</h2>
          <p className="text-muted mb-0" style={{ maxWidth: 720, margin: '0 auto' }}>
            Many organizations know AI will change their industry. But most leaders are still
            trying to figure out <strong>where to begin and how to build real systems</strong>.
            The Enterprise AI Leadership Accelerator was designed to help leaders move from{' '}
            <strong style={{ color: 'var(--color-primary)' }}>ideas to real implementation</strong>.
            Explore the overview video or listen to the podcast to understand how the program works.
          </p>
        </div>

        {/* Two-column media layout */}
        <div className="row g-4 mb-5">
          {/* Video Card */}
          <div className="col-lg-6">
            <div className="media-card card border-0 shadow-sm h-100" style={{ borderTop: '3px solid var(--color-primary)' }}>
              <div className="card-body p-4">
                <h3 className="h5 fw-bold mb-2" style={{ color: 'var(--color-primary)' }}>
                  See How the Accelerator Works
                </h3>
                <p className="text-muted small mb-3">
                  Watch a quick walkthrough explaining how participants bring their ideas into the
                  accelerator and begin building AI systems for their organization.
                </p>

                {/* Vimeo Responsive Embed */}
                <div
                  style={{ padding: '56.25% 0 0 0', position: 'relative' }}
                  className="rounded overflow-hidden mb-2"
                >
                  <iframe
                    src="https://player.vimeo.com/video/1174180493?badge=0&autopause=0&player_id=0&app_id=58479"
                    frameBorder="0"
                    allow="autoplay; fullscreen; picture-in-picture; clipboard-write; encrypted-media; web-share"
                    referrerPolicy="strict-origin-when-cross-origin"
                    style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%' }}
                    title="Enterprise AI Leadership Accelerator Overview"
                  />
                </div>

                <small className="text-muted" style={{ fontSize: '0.75rem' }}>
                  3 minute overview of the Enterprise AI Leadership Accelerator.
                </small>
              </div>
            </div>
          </div>

          {/* Podcast Card */}
          <div className="col-lg-6">
            <div className="media-card card border-0 shadow-sm h-100" style={{ borderTop: '3px solid var(--color-accent)' }}>
              <div className="card-body p-4">
                <h3 className="h5 fw-bold mb-2" style={{ color: 'var(--color-primary)' }}>
                  Hear How the Process Works
                </h3>
                <p className="text-muted small mb-3">
                  Listen to a podcast where we break down exactly how the accelerator process works
                  — from bringing your ideas to building a working AI system in 21 days.
                </p>

                {/* Podcast Thumbnail */}
                <div
                  className="rounded overflow-hidden mb-3"
                  style={{ position: 'relative', background: '#020917' }}
                >
                  <svg viewBox="0 0 640 360" xmlns="http://www.w3.org/2000/svg" style={{ width: '100%', display: 'block' }}>
                    <defs>
                      <filter id="pcNodeGlow"><feGaussianBlur stdDeviation="2" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
                      <filter id="pcCoreGlow"><feGaussianBlur stdDeviation="5" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
                      <radialGradient id="pcCoreGrad" cx="50%" cy="50%" r="50%">
                        <stop offset="0%" stopColor="#00e5ff" stopOpacity="0.95"/>
                        <stop offset="40%" stopColor="#0077ff" stopOpacity="0.85"/>
                        <stop offset="100%" stopColor="#0033aa" stopOpacity="0.6"/>
                      </radialGradient>
                      <radialGradient id="pcN1" cx="50%" cy="50%" r="50%">
                        <stop offset="0%" stopColor="#00c8ff" stopOpacity="0.9"/>
                        <stop offset="100%" stopColor="#003380" stopOpacity="0.7"/>
                      </radialGradient>
                      <radialGradient id="pcN2" cx="50%" cy="50%" r="50%">
                        <stop offset="0%" stopColor="#a855f7" stopOpacity="0.9"/>
                        <stop offset="100%" stopColor="#3b0d6e" stopOpacity="0.7"/>
                      </radialGradient>
                      <radialGradient id="pcN3" cx="50%" cy="50%" r="50%">
                        <stop offset="0%" stopColor="#00ffb8" stopOpacity="0.8"/>
                        <stop offset="100%" stopColor="#004030" stopOpacity="0.6"/>
                      </radialGradient>
                      <linearGradient id="pcOverlay" x1="0" y1="0" x2="1" y2="0">
                        <stop offset="0%" stopColor="#020917" stopOpacity="0.92"/>
                        <stop offset="38%" stopColor="#020917" stopOpacity="0.7"/>
                        <stop offset="65%" stopColor="#020917" stopOpacity="0.05"/>
                        <stop offset="100%" stopColor="#020917" stopOpacity="0"/>
                      </linearGradient>
                    </defs>
                    {/* Background */}
                    <rect width="640" height="360" fill="#020917"/>
                    <rect width="640" height="198" y="162" fill="url(#pcBgHorizon)" opacity="0.6"/>
                    {/* Glows */}
                    <circle cx="435" cy="180" r="180" fill="#0078ff" opacity="0.08"/>
                    <circle cx="435" cy="180" r="120" fill="#5000c8" opacity="0.06"/>
                    {/* Connection lines */}
                    <g opacity="0.5">
                      <line x1="435" y1="180" x2="505" y2="105" stroke="#00c8ff" strokeWidth="0.8" strokeOpacity="0.55"/>
                      <line x1="435" y1="180" x2="530" y2="170" stroke="#00c8ff" strokeWidth="0.7" strokeOpacity="0.5"/>
                      <line x1="435" y1="180" x2="500" y2="245" stroke="#00c8ff" strokeWidth="0.8" strokeOpacity="0.55"/>
                      <line x1="435" y1="180" x2="435" y2="270" stroke="#a855f7" strokeWidth="0.7" strokeOpacity="0.45"/>
                      <line x1="435" y1="180" x2="365" y2="250" stroke="#00ffb8" strokeWidth="0.7" strokeOpacity="0.4"/>
                      <line x1="435" y1="180" x2="345" y2="120" stroke="#00c8ff" strokeWidth="0.7" strokeOpacity="0.5"/>
                      <line x1="435" y1="180" x2="375" y2="90" stroke="#a855f7" strokeWidth="0.7" strokeOpacity="0.4"/>
                    </g>
                    {/* Outer nodes */}
                    <g filter="url(#pcNodeGlow)" opacity="0.7">
                      <circle cx="550" cy="75" r="6" fill="url(#pcN1)" stroke="#00c8ff" strokeWidth="0.5" strokeOpacity="0.5"/>
                      <circle cx="565" cy="130" r="5" fill="url(#pcN1)" stroke="#00c8ff" strokeWidth="0.5" strokeOpacity="0.5"/>
                      <circle cx="575" cy="205" r="5" fill="url(#pcN3)" stroke="#00ffb8" strokeWidth="0.5" strokeOpacity="0.5"/>
                      <circle cx="545" cy="275" r="5" fill="url(#pcN3)" stroke="#00ffb8" strokeWidth="0.5" strokeOpacity="0.4"/>
                      <circle cx="300" cy="190" r="5" fill="url(#pcN1)" stroke="#00c8ff" strokeWidth="0.5" strokeOpacity="0.5"/>
                    </g>
                    {/* Primary nodes */}
                    <g filter="url(#pcNodeGlow)">
                      <circle cx="505" cy="105" r="20" fill="url(#pcN1)" stroke="#00c8ff" strokeWidth="1" strokeOpacity="0.8"/>
                      <text x="505" y="103" textAnchor="middle" fill="#00e5ff" fontFamily="sans-serif" fontSize="7" fontWeight="700">SYSTEMS</text>
                      <text x="505" y="111" textAnchor="middle" fill="#00c8ff" fontFamily="sans-serif" fontSize="6">DESIGN</text>

                      <circle cx="530" cy="170" r="18" fill="url(#pcN1)" stroke="#00c8ff" strokeWidth="1" strokeOpacity="0.75"/>
                      <text x="530" y="168" textAnchor="middle" fill="#00e5ff" fontFamily="sans-serif" fontSize="7" fontWeight="700">DATA</text>
                      <text x="530" y="176" textAnchor="middle" fill="#00c8ff" fontFamily="sans-serif" fontSize="6">INTEL</text>

                      <circle cx="500" cy="245" r="18" fill="url(#pcN3)" stroke="#00ffb8" strokeWidth="1" strokeOpacity="0.7"/>
                      <text x="500" y="243" textAnchor="middle" fill="#00ffca" fontFamily="sans-serif" fontSize="7" fontWeight="700">DEPLOY</text>
                      <text x="500" y="251" textAnchor="middle" fill="#00ffb8" fontFamily="sans-serif" fontSize="6">AGENTS</text>

                      <circle cx="435" cy="270" r="18" fill="url(#pcN2)" stroke="#a855f7" strokeWidth="1" strokeOpacity="0.7"/>
                      <text x="435" y="268" textAnchor="middle" fill="#d8b4fe" fontFamily="sans-serif" fontSize="7" fontWeight="700">GOVERN</text>
                      <text x="435" y="276" textAnchor="middle" fill="#a855f7" fontFamily="sans-serif" fontSize="6">AI POLICY</text>

                      <circle cx="365" cy="250" r="16" fill="url(#pcN3)" stroke="#00ffb8" strokeWidth="1" strokeOpacity="0.65"/>
                      <text x="365" y="248" textAnchor="middle" fill="#00ffca" fontFamily="sans-serif" fontSize="7" fontWeight="700">TEAMS</text>
                      <text x="365" y="256" textAnchor="middle" fill="#00ffb8" fontFamily="sans-serif" fontSize="6">AI-READY</text>

                      <circle cx="345" cy="120" r="18" fill="url(#pcN1)" stroke="#00c8ff" strokeWidth="1" strokeOpacity="0.7"/>
                      <text x="345" y="118" textAnchor="middle" fill="#00e5ff" fontFamily="sans-serif" fontSize="7" fontWeight="700">AI STRAT</text>
                      <text x="345" y="126" textAnchor="middle" fill="#00c8ff" fontFamily="sans-serif" fontSize="6">ROADMAP</text>

                      <circle cx="375" cy="90" r="16" fill="url(#pcN2)" stroke="#a855f7" strokeWidth="1" strokeOpacity="0.65"/>
                      <text x="375" y="88" textAnchor="middle" fill="#d8b4fe" fontFamily="sans-serif" fontSize="7" fontWeight="700">INNOV</text>
                      <text x="375" y="96" textAnchor="middle" fill="#a855f7" fontFamily="sans-serif" fontSize="6">AI LAB</text>
                    </g>
                    {/* Core */}
                    <circle cx="435" cy="180" r="29" fill="rgba(0,40,120,0.3)" stroke="#0044cc" strokeWidth="0.8" strokeOpacity="0.4"/>
                    <polygon points="435,154 456,167 456,193 435,206 414,193 414,167"
                             fill="url(#pcCoreGrad)" stroke="#00e5ff" strokeWidth="1.2" strokeOpacity="0.9"
                             filter="url(#pcCoreGlow)"/>
                    <text x="435" y="178" textAnchor="middle" fill="#fff" fontFamily="sans-serif" fontSize="16" fontWeight="900" filter="url(#pcCoreGlow)">AI</text>
                    <text x="435" y="190" textAnchor="middle" fill="rgba(0,230,255,0.8)" fontFamily="sans-serif" fontSize="5" fontWeight="600" letterSpacing="0.15em">CORE</text>
                    {/* Pulsing ring */}
                    <circle cx="435" cy="180" r="29" fill="none" stroke="#00e5ff" strokeWidth="1" strokeOpacity="0">
                      <animate attributeName="r" values="29;45;29" dur="3s" repeatCount="indefinite"/>
                      <animate attributeName="stroke-opacity" values="0.5;0;0.5" dur="3s" repeatCount="indefinite"/>
                    </circle>
                    {/* Text overlay gradient */}
                    <rect width="640" height="360" fill="url(#pcOverlay)"/>
                    {/* Text */}
                    <text x="38" y="130" fill="#00c8ff" fontFamily="sans-serif" fontSize="8" fontWeight="600" letterSpacing="0.2em">COLABERRY &middot; AI EDUCATION</text>
                    <text x="38" y="168" fill="#fff" fontFamily="sans-serif" fontSize="36" fontWeight="900" letterSpacing="-0.01em">BUILD YOUR</text>
                    <text x="38" y="208" fill="#00c8ff" fontFamily="sans-serif" fontSize="36" fontWeight="900" letterSpacing="-0.01em">AI SYSTEM</text>
                    <rect x="38" y="220" width="30" height="2" rx="1" fill="#0077ff"/>
                    <text x="38" y="240" fill="rgba(180,210,255,0.9)" fontFamily="sans-serif" fontSize="9" fontWeight="700" letterSpacing="0.15em">ENTERPRISE AI LEADERSHIP ACCELERATOR</text>
                    <text x="38" y="256" fill="rgba(130,170,220,0.7)" fontFamily="sans-serif" fontSize="7" letterSpacing="0.05em">Design &middot; Deploy &middot; Govern &middot; Scale</text>
                    {/* Headphone icon + label */}
                    <circle cx="50" cy="320" r="14" fill="url(#pcN1)" opacity="0.8"/>
                    <text x="46" y="324" fill="#fff" fontFamily="sans-serif" fontSize="12">&#x1F3A7;</text>
                    <text x="72" y="324" fill="rgba(180,210,255,0.85)" fontFamily="sans-serif" fontSize="6.5" fontWeight="600" letterSpacing="0.1em">LISTEN TO PROGRAM OVERVIEW</text>
                    {/* Badge */}
                    <rect x="530" y="18" width="90" height="20" rx="3" fill="rgba(0,50,120,0.5)" stroke="#0096ff" strokeWidth="0.5" strokeOpacity="0.3"/>
                    <text x="575" y="31" textAnchor="middle" fill="#00c8ff" fontFamily="sans-serif" fontSize="5.5" fontWeight="700" letterSpacing="0.15em">EXECUTIVE</text>
                    {/* Bottom bar */}
                    <rect y="356" width="640" height="4" fill="url(#pcBarGrad)"/>
                    <defs>
                      <linearGradient id="pcBarGrad" x1="0" y1="0" x2="1" y2="0">
                        <stop offset="0%" stopColor="#7b2fbe"/>
                        <stop offset="30%" stopColor="#0055ff"/>
                        <stop offset="60%" stopColor="#00c8ff"/>
                        <stop offset="100%" stopColor="#00ffb8"/>
                      </linearGradient>
                    </defs>
                  </svg>
                </div>

                {podcastUrl ? (
                  <div className="mb-2">
                    <audio controls preload="metadata" style={{ width: '100%' }}>
                      <source src={podcastUrl} type="audio/mp4" />
                      Your browser does not support the audio element.
                    </audio>
                  </div>
                ) : (
                  <div className="text-center py-3 mb-2">
                    <span className="text-muted small fw-semibold">Coming Soon</span>
                  </div>
                )}

                <small className="text-muted" style={{ fontSize: '0.75rem' }}>
                  A breakdown of how the accelerator takes you from idea to working AI system.
                </small>
              </div>
            </div>
          </div>
        </div>

        {/* What You Will Learn */}
        <div className="text-center">
          <h3 className="h6 fw-bold text-uppercase mb-3" style={{ letterSpacing: '0.5px', color: 'var(--color-text-light)' }}>
            What You Will Learn
          </h3>
          <div className="d-flex flex-column flex-md-row justify-content-center gap-3">
            {[
              'How to identify AI opportunities inside your organization',
              'How to design AI system architecture',
              'How to begin building AI solutions using Claude Code',
            ].map((item) => (
              <div
                key={item}
                className="d-flex align-items-start gap-2 text-start"
                style={{ maxWidth: 280 }}
              >
                <span style={{ color: 'var(--color-accent)', flexShrink: 0, marginTop: 2 }}>
                  &#10003;
                </span>
                <span className="text-muted small">{item}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <style>{`
        .media-card {
          transition: transform 0.2s ease, box-shadow 0.2s ease;
        }
        .media-card:hover {
          transform: translateY(-2px);
          box-shadow: 0 8px 25px rgba(0, 0, 0, 0.1) !important;
        }
        .podcast-play-btn {
          width: 60px;
          height: 60px;
          border-radius: 50%;
          background: rgba(255, 255, 255, 0.15);
          border: 2px solid rgba(255, 255, 255, 0.4);
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 1.4rem;
          color: #fff;
          animation: podcastPulse 2s ease-in-out infinite;
        }
        @keyframes podcastPulse {
          0%, 100% { transform: scale(1); opacity: 1; }
          50% { transform: scale(1.08); opacity: 0.8; }
        }
        @media (prefers-reduced-motion: reduce) {
          .media-card { transition: none; }
          .media-card:hover { transform: none; }
          .podcast-play-btn { animation: none; }
        }
      `}</style>
    </section>
  );
}
