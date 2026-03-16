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
                  Hear the Story Behind the Program
                </h3>
                <p className="text-muted small mb-3">
                  Listen to a conversation explaining why the accelerator was created and how
                  organizations are beginning to design and deploy real AI systems.
                </p>

                {podcastUrl ? (
                  <div className="mb-2">
                    <audio controls preload="metadata" style={{ width: '100%' }}>
                      <source src={podcastUrl} type="audio/mp4" />
                      Your browser does not support the audio element.
                    </audio>
                  </div>
                ) : (
                  <div
                    className="rounded d-flex align-items-center justify-content-center mb-2"
                    style={{
                      background: 'linear-gradient(135deg, #1a365d, #2d3748)',
                      padding: '56.25% 0 0 0',
                      position: 'relative',
                    }}
                  >
                    <div
                      style={{
                        position: 'absolute',
                        top: 0,
                        left: 0,
                        width: '100%',
                        height: '100%',
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                    >
                      <div className="podcast-play-btn" aria-hidden="true">
                        &#9654;
                      </div>
                      <span
                        className="text-light fw-semibold mt-2"
                        style={{ fontSize: '0.85rem', opacity: 0.9 }}
                      >
                        Coming Soon
                      </span>
                      <span
                        className="text-light mt-1"
                        style={{ fontSize: '0.7rem', opacity: 0.6 }}
                      >
                        Podcast episode in production
                      </span>
                    </div>
                  </div>
                )}

                <small className="text-muted" style={{ fontSize: '0.75rem' }}>
                  Deep dive conversation about the philosophy and structure of the accelerator.
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
