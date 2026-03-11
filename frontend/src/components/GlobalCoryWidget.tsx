import React, { useState } from 'react';
import { useLocation } from 'react-router-dom';

// ─── Context-Aware Page Mapping ─────────────────────────────────────────────

const PAGE_CONTEXT: Record<string, string> = {
  '/': 'You were on the homepage. Want to check enrollment trends, marketing performance, or lead pipeline health?',
  '/program': 'You were viewing the Program page. Need insights on curriculum engagement, session completion rates, or participant feedback?',
  '/pricing': 'You were on the Pricing page. Shall I analyze conversion rates, pricing strategy effectiveness, or competitive positioning?',
  '/sponsorship': 'You were reviewing Sponsorship. Want to see sponsor engagement metrics or ROI analysis?',
  '/case-studies': 'You were browsing Case Studies. Need data on which case studies drive the most conversions?',
  '/enroll': 'You were on the Enrollment page. Want to review enrollment funnel metrics or drop-off analysis?',
  '/contact': 'You were on the Contact page. Shall I pull up lead capture performance or response time metrics?',
  '/admin/dashboard': 'You were on the Admin Dashboard. Ready for a full executive briefing on business metrics?',
  '/admin/campaigns': 'You were in Campaign Management. Want me to analyze campaign performance, health, or suggest optimizations?',
  '/admin/leads': 'You were in Lead Management. Shall I run a pipeline health assessment or identify stalled leads?',
  '/admin/revenue': 'You were on the Revenue Dashboard. Need a revenue trend analysis or forecast?',
  '/admin/pipeline': 'You were viewing the Pipeline. Want to analyze conversion rates across stages?',
  '/admin/visitors': 'You were tracking Visitors. Shall I analyze traffic patterns and attribution?',
  '/admin/accelerator': 'You were in the Accelerator section. Need student engagement or completion insights?',
  '/admin/orchestration': 'You were in Orchestration. Want to review program blueprint status or section health?',
  '/admin/marketing': 'You were on Marketing. Ready for a marketing intelligence briefing?',
  '/portal': 'You were in the Participant Portal. Want to check student progress, engagement, or at-risk participants?',
};

function getContextMessage(pathname: string): string {
  // Exact match first
  if (PAGE_CONTEXT[pathname]) return PAGE_CONTEXT[pathname];
  // Prefix match
  for (const [prefix, msg] of Object.entries(PAGE_CONTEXT)) {
    if (pathname.startsWith(prefix) && prefix !== '/') return msg;
  }
  return 'How can I help you today? I can provide executive briefings, analyze KPIs, or investigate any area of the business.';
}

// ─── Component ──────────────────────────────────────────────────────────────

export default function GlobalCoryWidget() {
  const location = useLocation();
  const [isHovered, setIsHovered] = useState(false);

  // Don't render on the Intelligence OS page itself (it has its own CoryOrb)
  if (location.pathname === '/admin/intelligence') return null;

  const handleClick = () => {
    const context = encodeURIComponent(location.pathname);
    window.open(`/admin/intelligence?cory=open&context=${context}`, '_blank');
  };

  return (
    <div className="global-cory-widget">
      <button
        onClick={handleClick}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
        aria-label="Open Cory — AI COO"
        title="Cory — AI COO"
        style={{
          position: 'relative',
          background: 'none',
          border: 'none',
          padding: 0,
          cursor: 'pointer',
        }}
      >
        <img
          src="/cory-avatar.jpg"
          alt="Cory — AI COO"
          className="global-cory-avatar"
          style={isHovered ? { transform: 'scale(1.1)', boxShadow: '0 6px 24px rgba(26, 54, 93, 0.45)' } : undefined}
        />
        {/* Name tooltip on hover */}
        {isHovered && (
          <span
            className="position-absolute bg-dark text-white rounded px-2 py-1"
            style={{
              bottom: '100%',
              left: '50%',
              transform: 'translateX(-50%)',
              marginBottom: 8,
              fontSize: '0.72rem',
              fontWeight: 600,
              whiteSpace: 'nowrap',
              pointerEvents: 'none',
            }}
          >
            Cory — AI COO
          </span>
        )}
      </button>
    </div>
  );
}
