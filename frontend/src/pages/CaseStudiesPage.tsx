// NOTE: Case studies are currently hardcoded.
// TODO: Migrate to CMS (Contentful or Sanity) when case study volume exceeds 10.
// TODO: Add real attribution details when client consent is obtained — current entries are illustrative.

import React from 'react';
import { Link } from 'react-router-dom';
import SEOHead from '../components/SEOHead';

interface CaseStudy {
  emoji: string;
  industry: string;
  companySize: string;
  role: string;
  challenge: string;
  approach: string;
  outcomes: string[];
  quote: string;
  attribution: string;
  image: string;
  imageAlt: string;
}

function CaseStudiesPage() {
  const caseStudies: CaseStudy[] = [
    {
      emoji: '🏦',
      industry: 'Financial Services',
      companySize: '2,000–5,000 employees',
      role: 'VP of Technology',
      challenge:
        'A regional bank\'s VP of Technology was tasked by the board with delivering an AI strategy within 60 days. The organization had been quoted $400K+ by two consulting firms. The internal team lacked the architectural vocabulary to evaluate proposals or build independently.',
      approach:
        'The VP and two senior architects completed the 5-Day Executive Accelerator. During Day 3, they built a loan processing optimization POC using their actual (anonymized) data patterns. Day 5 produced a board-ready 90-Day AI Roadmap.',
      outcomes: [
        '🏗️ Working loan processing AI POC delivered on Day 3',
        '📅 Board-approved 90-Day AI Roadmap presented within 2 weeks of accelerator',
        '💰 $380,000 in consulting fees avoided',
        '⚡ Roadmap execution began 4 months earlier than projected external consulting timeline',
      ],
      quote:
        '"We walked in not knowing how to evaluate AI vendors. We walked out with a POC running on our own infrastructure and a roadmap our board approved on first presentation."',
      attribution: 'VP of Technology, Regional Financial Institution',
      image: 'https://images.unsplash.com/photo-1556742049-0cfed4f6a45d?auto=format&fit=crop&w=800&q=80',
      imageAlt: 'Modern financial services office with digital banking technology',
    },
    {
      emoji: '🏥',
      industry: 'Healthcare',
      companySize: '10,000+ employees',
      role: 'Director of Clinical Informatics',
      challenge:
        'A large health system\'s Director of Clinical Informatics needed to demonstrate AI ROI to justify a $2M technology budget request. Previous AI pilots had stalled due to lack of governance frameworks and unclear architectural ownership.',
      approach:
        'Four technical leaders from the health system completed the accelerator as a team cohort. The POC work on Day 3 focused on clinical documentation efficiency — directly relevant to their approved IT roadmap. The governance frameworks from Day 1 aligned with their existing HIPAA compliance posture.',
      outcomes: [
        '🤖 Clinical documentation AI POC approved for production pilot',
        '🛡️ AI governance framework aligned to HIPAA requirements delivered Day 1',
        '📊 $2M budget request approved with board-ready presentation from Day 4',
        '👥 All four participants now lead independent AI workstreams',
      ],
      quote:
        '"The governance frameworks from Day 1 alone were worth the investment. We had been stuck on compliance concerns for 8 months. The accelerator gave us a framework we could actually work with."',
      attribution: 'Director of Clinical Informatics, Health System',
      image: 'https://images.unsplash.com/photo-1519494026892-80bbd2d6fd0d?auto=format&fit=crop&w=800&q=80',
      imageAlt: 'Healthcare facility with modern clinical informatics systems',
    },
    {
      emoji: '🏭',
      industry: 'Manufacturing',
      companySize: '500–2,000 employees',
      role: 'CTO',
      challenge:
        'A mid-market manufacturer\'s CTO was facing board pressure to implement AI-driven predictive maintenance. The organization had IoT sensor data but no internal AI architecture capability. Vendor proposals ranged from $150K to $600K with multi-year lock-in contracts.',
      approach:
        'The CTO attended the accelerator with the Head of Engineering. The Day 3 POC was scoped to their actual sensor data schema (anonymized). The 90-Day Roadmap from Day 5 outlined a phased implementation using open-source tooling to avoid vendor lock-in.',
      outcomes: [
        '⚙️ Predictive maintenance POC validated in Day 3 — architecture confirmed viable',
        '📋 Vendor lock-in avoided through open-source architecture patterns',
        '💰 $420,000 in proposed vendor contracts declined in favor of internal execution',
        '🚀 Production deployment completed 11 weeks post-accelerator',
      ],
      quote:
        '"We were days away from signing a $450,000 vendor contract. The accelerator showed us we could build it ourselves. We did — in 11 weeks."',
      attribution: 'CTO, Mid-Market Manufacturing Organization',
      image: 'https://images.unsplash.com/photo-1581091226825-a6a2a5aee158?auto=format&fit=crop&w=800&q=80',
      imageAlt: 'Advanced manufacturing facility with IoT sensors and automation',
    },
  ];

  return (
    <>
      <SEOHead
        title="Case Studies"
        description="Enterprise AI case studies — how Directors, VPs, and CTOs are building internal AI capability using the Colaberry Executive Accelerator. Finance, Healthcare, Manufacturing examples."
      />

      {/* Header */}
      <section
        className="hero-bg text-light py-5"
        aria-label="Page Header"
        style={{ backgroundImage: 'url(https://images.unsplash.com/photo-1460925895917-afdab827c52f?auto=format&fit=crop&w=1920&q=80)' }}
      >
        <div className="container text-center py-4">
          <img src="/colaberry-icon.png" alt="" width="44" height="44" className="mb-3 logo-hero" />
          <h1 className="display-5 fw-bold text-light">📊 Enterprise AI in Practice</h1>
          <p className="lead">
            How technical leaders are building and deploying AI capability inside
            their organizations.
          </p>
        </div>
      </section>

      {/* Case Studies */}
      <section className="section" aria-label="Case Studies">
        <div className="container">
          {caseStudies.map((cs, index) => (
            <div
              className={`card border-0 shadow-sm mb-5 overflow-hidden ${index % 2 === 1 ? 'bg-light' : ''}`}
              key={cs.industry}
            >
              <div className="row g-0">
                <div className={`col-lg-4 ${index % 2 === 1 ? 'order-lg-2' : ''}`}>
                  <img
                    src={cs.image}
                    alt={cs.imageAlt}
                    className="img-feature"
                    style={{ minHeight: '300px' }}
                  />
                </div>
                <div className={`col-lg-8 ${index % 2 === 1 ? 'order-lg-1' : ''}`}>
                  <div className="card-body p-5">
                    {/* Header */}
                    <div className="d-flex align-items-center mb-4 flex-wrap gap-2">
                      <span className="fs-1 me-3" aria-hidden="true">{cs.emoji}</span>
                      <div>
                        <h2 className="h4 mb-1">{cs.industry}</h2>
                        <span className="badge bg-secondary me-2">🏢 {cs.companySize}</span>
                        <span className="badge bg-primary">👔 {cs.role}</span>
                      </div>
                    </div>

                    {/* Challenge */}
                    <h3 className="h5 mb-2">🔴 The Challenge</h3>
                    <p className="text-muted mb-4">{cs.challenge}</p>

                    {/* Approach */}
                    <h3 className="h5 mb-2">🔧 The Approach</h3>
                    <p className="text-muted mb-4">{cs.approach}</p>

                    {/* Outcomes */}
                    <h3 className="h5 mb-3">📈 Outcomes</h3>
                    <ul className="list-unstyled mb-4">
                      {cs.outcomes.map((outcome) => (
                        <li className="mb-2 fs-5" key={outcome}>{outcome}</li>
                      ))}
                    </ul>

                    {/* Quote */}
                    <blockquote className="border-start border-4 border-primary ps-4 py-2 mb-0">
                      <p className="fst-italic mb-1">{cs.quote}</p>
                      <footer className="text-muted">— {cs.attribution}</footer>
                    </blockquote>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* CTA */}
      <section
        className="cta-bg text-light text-center py-5"
        aria-label="Call to Action"
        style={{ backgroundImage: 'url(https://images.unsplash.com/photo-1517245386807-bb43f82c33c4?auto=format&fit=crop&w=1920&q=80)' }}
      >
        <div className="container py-4">
          <h2 className="text-light mb-3">🏗️ Build Your Own Case Study</h2>
          <p className="mb-4">
            Every organization that completes the accelerator creates outcomes worth documenting.
          </p>
          <div className="d-flex justify-content-center gap-3 flex-wrap">
            <Link to="/program" className="btn btn-accent btn-lg">
              View the Accelerator
            </Link>
            <Link to="/contact" className="btn btn-outline-light btn-lg">
              Request a Strategy Call
            </Link>
          </div>
        </div>
      </section>
    </>
  );
}

export default CaseStudiesPage;
