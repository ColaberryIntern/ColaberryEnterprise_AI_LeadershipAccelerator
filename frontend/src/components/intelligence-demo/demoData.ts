// ─── Intelligence Demo — Hardcoded Data ─────────────────────────────────────
// Realistic simulated data for the homepage funnel visualization.
// Numbers follow a logical flow: sources → outreach → visitors → engagement → conversion.

export interface FunnelNode {
  id: string;
  label: string;
  category: 'source' | 'outreach' | 'visitor' | 'engagement' | 'conversion';
  icon: string;
  color: string;
  x: number;
  y: number;
  count: number;
}

export interface FunnelEdge {
  from: string;
  to: string;
  volume: number;
}

export interface InsightMetric {
  label: string;
  value: string;
  sublabel?: string;
}

export interface BreakdownItem {
  label: string;
  pct: number;
  color: string;
}

export interface StageInsight {
  title: string;
  subtitle: string;
  metrics: InsightMetric[];
  breakdown: BreakdownItem[];
  narrative: string;
}

// ─── Nodes ───────────────────────────────────────────────────────────────────

export const FUNNEL_NODES: FunnelNode[] = [
  // Sources (column 0)
  { id: 'src_referral',  label: 'Referral Network',  category: 'source',     icon: '🤝', color: '#38a169', x: 70,  y: 70,  count: 608 },
  { id: 'src_cold',      label: 'Cold Outbound',   category: 'source',     icon: '📞', color: '#3182ce', x: 70,  y: 200, count: 240 },
  { id: 'src_marketing', label: 'Marketing',       category: 'source',     icon: '📣', color: '#d69e2e', x: 70,  y: 330, count: 156 },

  // Outreach (column 1)
  { id: 'out_email',     label: 'Email',           category: 'outreach',   icon: '✉️', color: '#e53e3e', x: 220, y: 90,  count: 364 },
  { id: 'out_sms',       label: 'SMS',             category: 'outreach',   icon: '💬', color: '#d69e2e', x: 220, y: 210, count: 128 },
  { id: 'out_voice',     label: 'Voice',           category: 'outreach',   icon: '🎙️', color: '#805ad5', x: 220, y: 330, count: 47 },

  // Visitor (column 2)
  { id: 'visitor',       label: 'Site Visitors',   category: 'visitor',    icon: '👁️', color: '#dd6b20', x: 380, y: 200, count: 312 },

  // Engagement (column 3)
  { id: 'eng_strategy',  label: 'Strategy Call',   category: 'engagement', icon: '📅', color: '#319795', x: 530, y: 140, count: 89 },
  { id: 'eng_signup',    label: 'Signup',          category: 'engagement', icon: '✍️', color: '#319795', x: 530, y: 290, count: 64 },

  // Conversion (column 4)
  { id: 'conv_enrolled', label: 'Enrolled',        category: 'conversion', icon: '🎯', color: '#38a169', x: 680, y: 140, count: 42 },
  { id: 'conv_paid',     label: 'Paid',            category: 'conversion', icon: '💎', color: '#38a169', x: 680, y: 290, count: 28 },
];

// ─── Edges ───────────────────────────────────────────────────────────────────

export const FUNNEL_EDGES: FunnelEdge[] = [
  // Source → Outreach
  { from: 'src_referral',    to: 'out_email',     volume: 248 },
  { from: 'src_referral',    to: 'out_sms',       volume: 96 },
  { from: 'src_cold',      to: 'out_email',     volume: 116 },
  { from: 'src_cold',      to: 'out_voice',     volume: 47 },
  { from: 'src_marketing', to: 'out_sms',       volume: 32 },

  // Outreach → Visitor
  { from: 'out_email',     to: 'visitor',       volume: 187 },
  { from: 'out_sms',       to: 'visitor',       volume: 68 },
  { from: 'out_voice',     to: 'visitor',       volume: 29 },

  // Source → Visitor (direct / organic)
  { from: 'src_marketing', to: 'visitor',       volume: 28 },

  // Visitor → Engagement
  { from: 'visitor',       to: 'eng_strategy',  volume: 89 },
  { from: 'visitor',       to: 'eng_signup',    volume: 64 },

  // Engagement → Conversion
  { from: 'eng_strategy',  to: 'conv_enrolled', volume: 31 },
  { from: 'eng_signup',    to: 'conv_enrolled', volume: 11 },
  { from: 'conv_enrolled', to: 'conv_paid',     volume: 28 },
];

// ─── Column layout ──────────────────────────────────────────────────────────

export const COLUMN_LABELS = ['Sources', 'Outreach', 'Visitors', 'Engagement', 'Conversion'];
export const COLUMN_X = [70, 220, 380, 530, 680];

// ─── Insight data per node ──────────────────────────────────────────────────

export const INSIGHTS: Record<string, StageInsight> = {
  // ── Sources ────────────────────────────────────────────────────────────────
  src_referral: {
    title: 'Referral Network',
    subtitle: 'Highest volume source with strong trust signals',
    metrics: [
      { label: 'Total Leads', value: '608', sublabel: '60.5% of pipeline' },
      { label: 'Reached', value: '344', sublabel: '56.6% contact rate' },
      { label: 'Visited Site', value: '186', sublabel: '30.6% visit rate' },
      { label: 'Converted', value: '24', sublabel: '3.9% conversion' },
    ],
    breakdown: [
      { label: 'Email Reached', pct: 72, color: '#e53e3e' },
      { label: 'SMS Reached', pct: 28, color: '#d69e2e' },
    ],
    narrative: 'Referral network drives the most volume and highest trust. Email outreach converts 2.4× better than SMS for this segment.',
  },

  src_cold: {
    title: 'Cold Outbound',
    subtitle: 'Precision-targeted enterprise prospects',
    metrics: [
      { label: 'Total Leads', value: '240', sublabel: '23.9% of pipeline' },
      { label: 'Reached', value: '163', sublabel: '67.9% contact rate' },
      { label: 'Visited Site', value: '94', sublabel: '39.2% visit rate' },
      { label: 'Converted', value: '12', sublabel: '5.0% conversion' },
    ],
    breakdown: [
      { label: 'Email Reached', pct: 71, color: '#e53e3e' },
      { label: 'Voice Reached', pct: 29, color: '#805ad5' },
    ],
    narrative: 'Cold outbound shows the highest conversion rate per lead. Voice follow-ups after email increase engagement by 38%.',
  },

  src_marketing: {
    title: 'Marketing',
    subtitle: 'Inbound-driven awareness and interest',
    metrics: [
      { label: 'Total Leads', value: '156', sublabel: '15.5% of pipeline' },
      { label: 'Reached', value: '32', sublabel: '20.5% contact rate' },
      { label: 'Visited Site', value: '28', sublabel: '17.9% via organic' },
      { label: 'Converted', value: '6', sublabel: '3.8% conversion' },
    ],
    breakdown: [
      { label: 'SMS Reached', pct: 100, color: '#d69e2e' },
    ],
    narrative: 'Marketing leads convert organically. Most arrive through content and convert without outreach — the highest ROI channel.',
  },

  // ── Outreach ───────────────────────────────────────────────────────────────
  out_email: {
    title: 'Email Outreach',
    subtitle: 'Primary communication channel',
    metrics: [
      { label: 'Sent', value: '364', sublabel: 'across all campaigns' },
      { label: 'Delivered', value: '348', sublabel: '95.6% delivery rate' },
      { label: 'Opened', value: '214', sublabel: '61.5% open rate' },
      { label: 'Drove Visits', value: '187', sublabel: '51.4% visit rate' },
    ],
    breakdown: [
      { label: 'Referral Source', pct: 68, color: '#38a169' },
      { label: 'Cold Source', pct: 32, color: '#3182ce' },
    ],
    narrative: 'Email is the highest-performing channel with 51.4% visit rate. Personalized subject lines drove 2.1× higher open rates.',
  },

  out_sms: {
    title: 'SMS Outreach',
    subtitle: 'High-urgency micro-touchpoints',
    metrics: [
      { label: 'Sent', value: '128', sublabel: 'targeted campaigns' },
      { label: 'Delivered', value: '124', sublabel: '96.9% delivery rate' },
      { label: 'Clicked', value: '78', sublabel: '62.9% click rate' },
      { label: 'Drove Visits', value: '68', sublabel: '53.1% visit rate' },
    ],
    breakdown: [
      { label: 'Referral Source', pct: 75, color: '#38a169' },
      { label: 'Marketing Source', pct: 25, color: '#d69e2e' },
    ],
    narrative: 'SMS achieves the highest click-through rate of any channel. Best when used as a follow-up 48 hours after email.',
  },

  out_voice: {
    title: 'Voice Outreach',
    subtitle: 'High-touch personal outreach',
    metrics: [
      { label: 'Calls Made', value: '47', sublabel: 'enterprise prospects' },
      { label: 'Connected', value: '31', sublabel: '66.0% connect rate' },
      { label: 'Interested', value: '29', sublabel: '93.5% of connected' },
      { label: 'Drove Visits', value: '29', sublabel: '61.7% visit rate' },
    ],
    breakdown: [
      { label: 'Cold Source', pct: 100, color: '#3182ce' },
    ],
    narrative: 'Voice delivers the highest per-contact conversion rate. Reserved for cold outbound — personal touch breaks through noise.',
  },

  // ── Visitor ────────────────────────────────────────────────────────────────
  visitor: {
    title: 'Site Visitors',
    subtitle: 'Behavioral intelligence from real sessions',
    metrics: [
      { label: 'Unique Visitors', value: '312', sublabel: 'from all channels' },
      { label: 'Avg. Pages', value: '4.2', sublabel: 'pages per session' },
      { label: 'Engaged', value: '153', sublabel: '49.0% engagement rate' },
      { label: 'Converted', value: '42', sublabel: '13.5% conversion' },
    ],
    breakdown: [
      { label: 'Via Email', pct: 60, color: '#e53e3e' },
      { label: 'Via SMS', pct: 22, color: '#d69e2e' },
      { label: 'Via Voice', pct: 9, color: '#805ad5' },
      { label: 'Organic', pct: 9, color: '#38a169' },
    ],
    narrative: 'Visitors who view 3+ pages are 4.7× more likely to convert. The executive overview page is the strongest conversion signal.',
  },

  // ── Engagement ─────────────────────────────────────────────────────────────
  eng_strategy: {
    title: 'Strategy Calls',
    subtitle: 'Highest-intent conversion action',
    metrics: [
      { label: 'Booked', value: '89', sublabel: '28.5% of visitors' },
      { label: 'Completed', value: '76', sublabel: '85.4% show rate' },
      { label: 'Converted', value: '31', sublabel: '40.8% close rate' },
      { label: 'Avg. Duration', value: '24m', sublabel: 'per call' },
    ],
    breakdown: [
      { label: 'Email Path', pct: 58, color: '#e53e3e' },
      { label: 'Voice Path', pct: 24, color: '#805ad5' },
      { label: 'SMS Path', pct: 18, color: '#d69e2e' },
    ],
    narrative: 'Strategy calls are the #1 conversion driver with 40.8% close rate. Leads who book within 48 hours of first visit close 2× faster.',
  },

  eng_signup: {
    title: 'Signups',
    subtitle: 'Self-service enrollment path',
    metrics: [
      { label: 'Total Signups', value: '64', sublabel: '20.5% of visitors' },
      { label: 'Blueprint', value: '38', sublabel: '59.4% of signups' },
      { label: 'Direct Enroll', value: '11', sublabel: '17.2% enrolled' },
      { label: 'Time to Sign', value: '3.2d', sublabel: 'avg. from first visit' },
    ],
    breakdown: [
      { label: 'Blueprint Path', pct: 59, color: '#319795' },
      { label: 'Direct Path', pct: 41, color: '#38a169' },
    ],
    narrative: 'Blueprint signups are the entry point — 29% upgrade to full enrollment. Direct enrollments have 2.3× higher lifetime value.',
  },

  // ── Conversion ─────────────────────────────────────────────────────────────
  conv_enrolled: {
    title: 'Enrolled',
    subtitle: 'Committed program participants',
    metrics: [
      { label: 'Total Enrolled', value: '42', sublabel: '4.2% of all leads' },
      { label: 'Via Strategy Call', value: '31', sublabel: '73.8% of enrollments' },
      { label: 'Via Self-Service', value: '11', sublabel: '26.2% of enrollments' },
      { label: 'Avg. Touchpoints', value: '6.3', sublabel: 'before enrollment' },
    ],
    breakdown: [
      { label: 'Strategy Call Path', pct: 74, color: '#319795' },
      { label: 'Self-Service Path', pct: 26, color: '#38a169' },
    ],
    narrative: 'It takes an average of 6.3 touchpoints to convert a lead. Multi-channel outreach (email + voice) produces 3.1× higher enrollment.',
  },

  conv_paid: {
    title: 'Paid',
    subtitle: 'Revenue-generating conversions',
    metrics: [
      { label: 'Paid Members', value: '28', sublabel: '66.7% of enrolled' },
      { label: 'Revenue', value: '$84K', sublabel: 'total program revenue' },
      { label: 'Avg. Deal Size', value: '$3,000', sublabel: 'per enrollment' },
      { label: 'Cost per Acq.', value: '$142', sublabel: 'blended CAC' },
    ],
    breakdown: [
      { label: 'Referral Network', pct: 57, color: '#38a169' },
      { label: 'Cold Outbound', pct: 29, color: '#3182ce' },
      { label: 'Marketing', pct: 14, color: '#d69e2e' },
    ],
    narrative: 'Referrals deliver the highest volume but cold outbound has the best unit economics. Every $1 in outreach generates $21 in revenue.',
  },
};

// ─── Category colors for column headers ─────────────────────────────────────

export const CATEGORY_COLORS: Record<string, string> = {
  source: '#805ad5',
  outreach: '#e53e3e',
  visitor: '#dd6b20',
  engagement: '#319795',
  conversion: '#38a169',
};
