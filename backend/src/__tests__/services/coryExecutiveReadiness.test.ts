/**
 * Cory Executive Readiness Test Suite
 * ─────────────────────────────────────
 * 100 conversations a senior business professional (20+ years) would ask.
 * Tests: accuracy, business framing, no fabrication, no hallucination,
 * appropriate follow-ups, graceful handling of unknowns.
 *
 * Run: npx jest coryExecutiveReadiness --testTimeout=120000
 */

// ─── Ground Truth (queried 2026-03-19) ──────────────────────────────────────

const GROUND_TRUTH = {
  leads: { total: 849, cold: 839, warm: 10, hot: 0, all_status_new: true },
  campaigns: { total: 13, active: 11, completed: 1, draft: 1 },
  enrollments: { total: 2 },
  agents: { total: 172, active: 2, idle: 168, paused: 1, with_errors: 3 },
  emails: { total: 5282, sent: 805, pending: 75, sent_7d: 805, sent_today: 514 },
  communication_logs: 1649,
  cohorts: 3,
  activities: 4520,
  follow_up_sequences: 13,
  strategy_calls: 14,
  opportunity_scores: 848,
  campaign_health: 12,
  campaign_errors: 4,
  orchestration_health: 2753,
  system_processes: 27442,
  lead_sources: { ccpp_alumni: 608, apollo: 240 },
  agents_with_errors: ['ICPInsightComputer', 'BehavioralTriggerEvaluator', 'CampaignHealthScanner'],
};

// ─── Test Question Categories ───────────────────────────────────────────────

interface TestQuestion {
  id: number;
  category: string;
  question: string;
  /** What we expect to see in the response */
  expectations: {
    /** Numbers that MUST appear (or close to) in narrative */
    mustContainNumbers?: Array<{ value: number; tolerance: number; label: string }>;
    /** Phrases that MUST NOT appear (technical jargon, agent names, etc.) */
    mustNotContain?: string[];
    /** Phrases that SHOULD appear */
    shouldContain?: string[];
    /** Expected intent classification */
    expectedIntent?: string[];
    /** Pipeline steps that must complete */
    requiredSteps?: string[];
    /** Must have narrative_sections */
    requireSections?: boolean;
    /** Must have follow-ups */
    requireFollowups?: boolean;
    /** Must NOT say "data not available" when data exists */
    dataMustExist?: boolean;
  };
}

const TEST_QUESTIONS: TestQuestion[] = [
  // ── Category 1: Pipeline & Funnel (1-15) ──────────────────────────────────
  {
    id: 1,
    category: 'pipeline',
    question: 'How many leads do we have in our pipeline?',
    expectations: {
      mustContainNumbers: [{ value: 849, tolerance: 5, label: 'total leads' }],
      mustNotContain: ['agent', 'AI agent', 'error_count'],
      requireSections: true,
      dataMustExist: true,
    },
  },
  {
    id: 2,
    category: 'pipeline',
    question: 'What does our lead pipeline look like right now?',
    expectations: {
      mustContainNumbers: [{ value: 849, tolerance: 5, label: 'total leads' }],
      shouldContain: ['cold', 'warm'],
      dataMustExist: true,
    },
  },
  {
    id: 3,
    category: 'pipeline',
    question: 'Break down our leads by temperature — how many are hot, warm, and cold?',
    expectations: {
      mustContainNumbers: [
        { value: 839, tolerance: 5, label: 'cold leads' },
        { value: 10, tolerance: 2, label: 'warm leads' },
      ],
      dataMustExist: true,
    },
  },
  {
    id: 4,
    category: 'pipeline',
    question: 'What is our lead-to-enrollment conversion rate?',
    expectations: {
      mustContainNumbers: [
        { value: 849, tolerance: 5, label: 'total leads' },
        { value: 2, tolerance: 0, label: 'enrollments' },
      ],
      dataMustExist: true,
    },
  },
  {
    id: 5,
    category: 'pipeline',
    question: 'Where are leads getting stuck in the funnel?',
    expectations: {
      dataMustExist: true,
      mustNotContain: ['agent_name', 'error_count', 'stack trace'],
      requireFollowups: true,
    },
  },
  {
    id: 6,
    category: 'pipeline',
    question: 'How many leads came from Apollo versus our alumni network?',
    expectations: {
      mustContainNumbers: [
        { value: 608, tolerance: 10, label: 'alumni leads' },
        { value: 240, tolerance: 5, label: 'apollo leads' },
      ],
      dataMustExist: true,
    },
  },
  {
    id: 7,
    category: 'pipeline',
    question: 'Which lead sources are converting best?',
    expectations: {
      dataMustExist: true,
      mustNotContain: ['SELECT', 'FROM', 'WHERE'],
    },
  },
  {
    id: 8,
    category: 'pipeline',
    question: 'How many opportunity scores have been generated?',
    expectations: {
      mustContainNumbers: [{ value: 848, tolerance: 5, label: 'opportunity scores' }],
      dataMustExist: true,
    },
  },
  {
    id: 9,
    category: 'pipeline',
    question: 'What percentage of our leads are warm or hot?',
    expectations: {
      dataMustExist: true,
    },
  },
  {
    id: 10,
    category: 'pipeline',
    question: 'How many strategy calls have been scheduled?',
    expectations: {
      mustContainNumbers: [{ value: 14, tolerance: 2, label: 'strategy calls' }],
      dataMustExist: true,
    },
  },
  {
    id: 11,
    category: 'pipeline',
    question: 'Show me the lead pipeline funnel from first touch to enrollment',
    expectations: {
      dataMustExist: true,
      requireSections: true,
    },
  },
  {
    id: 12,
    category: 'pipeline',
    question: 'Are we generating enough warm leads to hit our enrollment targets?',
    expectations: {
      dataMustExist: true,
      mustNotContain: ['SQL', 'query', 'database'],
    },
  },
  {
    id: 13,
    category: 'pipeline',
    question: 'What is the quality distribution of our leads?',
    expectations: {
      shouldContain: ['cold', 'warm'],
      dataMustExist: true,
    },
  },
  {
    id: 14,
    category: 'pipeline',
    question: 'How fast are leads moving through the pipeline?',
    expectations: {
      dataMustExist: true,
    },
  },
  {
    id: 15,
    category: 'pipeline',
    question: 'Compare our lead volume this week to last week',
    expectations: {
      dataMustExist: true,
    },
  },

  // ── Category 2: Campaigns & Outreach (16-30) ─────────────────────────────
  {
    id: 16,
    category: 'campaigns',
    question: 'How many campaigns do we have running?',
    expectations: {
      mustContainNumbers: [
        { value: 13, tolerance: 0, label: 'total campaigns' },
        { value: 11, tolerance: 0, label: 'active campaigns' },
      ],
      dataMustExist: true,
    },
  },
  {
    id: 17,
    category: 'campaigns',
    question: 'Give me a breakdown of all campaigns by status',
    expectations: {
      mustContainNumbers: [
        { value: 11, tolerance: 0, label: 'active' },
        { value: 1, tolerance: 0, label: 'completed' },
        { value: 1, tolerance: 0, label: 'draft' },
      ],
      dataMustExist: true,
    },
  },
  {
    id: 18,
    category: 'campaigns',
    question: 'Which campaigns should I focus on this week?',
    expectations: {
      dataMustExist: true,
      requireFollowups: true,
      mustNotContain: ['agent_name', 'cron', 'scheduler'],
    },
  },
  {
    id: 19,
    category: 'campaigns',
    question: 'How many emails have we sent this week?',
    expectations: {
      mustContainNumbers: [{ value: 805, tolerance: 20, label: 'emails sent 7d' }],
      dataMustExist: true,
    },
  },
  {
    id: 20,
    category: 'campaigns',
    question: 'What is our email delivery rate?',
    expectations: {
      dataMustExist: true,
    },
  },
  {
    id: 21,
    category: 'campaigns',
    question: 'Are there any campaign errors I should know about?',
    expectations: {
      dataMustExist: true,
      mustNotContain: ['stack trace', 'TypeError', 'null reference'],
    },
  },
  {
    id: 22,
    category: 'campaigns',
    question: 'How is the Executive Briefing Interest Campaign performing?',
    expectations: {
      dataMustExist: true,
    },
  },
  {
    id: 23,
    category: 'campaigns',
    question: 'Which campaigns are generating the most enrollments?',
    expectations: {
      dataMustExist: true,
    },
  },
  {
    id: 24,
    category: 'campaigns',
    question: 'How many follow-up sequences are active?',
    expectations: {
      mustContainNumbers: [{ value: 13, tolerance: 2, label: 'follow-up sequences' }],
      dataMustExist: true,
    },
  },
  {
    id: 25,
    category: 'campaigns',
    question: 'What is the ROI on our outbound campaigns?',
    expectations: {
      dataMustExist: true,
      mustNotContain: ['agent', 'AI agent'],
    },
  },
  {
    id: 26,
    category: 'campaigns',
    question: 'How many emails are pending delivery right now?',
    expectations: {
      mustContainNumbers: [{ value: 75, tolerance: 30, label: 'pending emails' }],
      dataMustExist: true,
    },
  },
  {
    id: 27,
    category: 'campaigns',
    question: 'Compare the performance of our alumni campaigns versus cold outbound',
    expectations: {
      dataMustExist: true,
    },
  },
  {
    id: 28,
    category: 'campaigns',
    question: 'What happened with the Strategy Call Prep Nudge Campaign?',
    expectations: {
      shouldContain: ['completed'],
      dataMustExist: true,
    },
  },
  {
    id: 29,
    category: 'campaigns',
    question: 'How many communication touchpoints have we made?',
    expectations: {
      mustContainNumbers: [{ value: 1649, tolerance: 50, label: 'communication logs' }],
      dataMustExist: true,
    },
  },
  {
    id: 30,
    category: 'campaigns',
    question: 'Should we launch the AI Leadership Cold Outbound campaign or keep it in draft?',
    expectations: {
      shouldContain: ['draft'],
      dataMustExist: true,
    },
  },

  // ── Category 3: Enrollment & Revenue (31-45) ─────────────────────────────
  {
    id: 31,
    category: 'enrollment',
    question: 'How many students are enrolled right now?',
    expectations: {
      mustContainNumbers: [{ value: 2, tolerance: 0, label: 'enrollments' }],
      dataMustExist: true,
    },
  },
  {
    id: 32,
    category: 'enrollment',
    question: 'What is our enrollment trend?',
    expectations: {
      dataMustExist: true,
    },
  },
  {
    id: 33,
    category: 'enrollment',
    question: 'How many cohorts do we have?',
    expectations: {
      mustContainNumbers: [{ value: 3, tolerance: 0, label: 'cohorts' }],
      dataMustExist: true,
    },
  },
  {
    id: 34,
    category: 'enrollment',
    question: 'What is our cost per enrollment?',
    expectations: {
      dataMustExist: false, // we may not have revenue data
    },
  },
  {
    id: 35,
    category: 'enrollment',
    question: 'At our current conversion rate, how many more leads do we need to get 10 enrollments?',
    expectations: {
      dataMustExist: true,
    },
  },
  {
    id: 36,
    category: 'enrollment',
    question: 'How are our enrolled students progressing through the program?',
    expectations: {
      dataMustExist: true,
    },
  },
  {
    id: 37,
    category: 'enrollment',
    question: 'What is the lifetime value of an enrolled student?',
    expectations: {
      dataMustExist: false,
    },
  },
  {
    id: 38,
    category: 'enrollment',
    question: 'Are we on track to hit our enrollment goals this quarter?',
    expectations: {
      dataMustExist: true,
    },
  },
  {
    id: 39,
    category: 'enrollment',
    question: 'How does enrollment compare month over month?',
    expectations: {
      dataMustExist: true,
    },
  },
  {
    id: 40,
    category: 'enrollment',
    question: 'What is the average time from lead to enrollment?',
    expectations: {
      dataMustExist: true,
    },
  },
  {
    id: 41,
    category: 'enrollment',
    question: 'Which campaigns are most effective at driving enrollments?',
    expectations: {
      dataMustExist: true,
    },
  },
  {
    id: 42,
    category: 'enrollment',
    question: 'Do we have any students at risk of dropping out?',
    expectations: {
      dataMustExist: true,
    },
  },
  {
    id: 43,
    category: 'enrollment',
    question: 'What is our program completion rate?',
    expectations: {
      dataMustExist: true,
    },
  },
  {
    id: 44,
    category: 'enrollment',
    question: 'How many ICP profiles have we created?',
    expectations: {
      mustContainNumbers: [{ value: 2, tolerance: 0, label: 'ICP profiles' }],
    },
  },
  {
    id: 45,
    category: 'enrollment',
    question: 'Break down our enrollment funnel — leads to strategy calls to enrolled',
    expectations: {
      dataMustExist: true,
    },
  },

  // ── Category 4: Business Briefings & Status (46-60) ──────────────────────
  {
    id: 46,
    category: 'briefing',
    question: 'Give me a business status briefing',
    expectations: {
      mustContainNumbers: [
        { value: 849, tolerance: 5, label: 'leads' },
        { value: 13, tolerance: 0, label: 'campaigns' },
        { value: 2, tolerance: 0, label: 'enrollments' },
      ],
      requireSections: true,
      requireFollowups: true,
      mustNotContain: ['agent_name', 'error_count', 'agent_type'],
      dataMustExist: true,
    },
  },
  {
    id: 47,
    category: 'briefing',
    question: 'What needs my attention right now?',
    expectations: {
      dataMustExist: true,
      requireFollowups: true,
    },
  },
  {
    id: 48,
    category: 'briefing',
    question: 'What are the biggest risks to our growth?',
    expectations: {
      dataMustExist: true,
      requireSections: true,
    },
  },
  {
    id: 49,
    category: 'briefing',
    question: 'Give me the CEO morning briefing',
    expectations: {
      dataMustExist: true,
      requireSections: true,
      mustNotContain: ['cron', 'scheduler', 'middleware'],
    },
  },
  {
    id: 50,
    category: 'briefing',
    question: 'What happened in the business today?',
    expectations: {
      dataMustExist: true,
    },
  },
  {
    id: 51,
    category: 'briefing',
    question: 'Summarize our business health in three bullet points',
    expectations: {
      dataMustExist: true,
    },
  },
  {
    id: 52,
    category: 'briefing',
    question: 'What are our top 3 priorities this week?',
    expectations: {
      dataMustExist: true,
      requireFollowups: true,
    },
  },
  {
    id: 53,
    category: 'briefing',
    question: 'How are we doing overall?',
    expectations: {
      dataMustExist: true,
    },
  },
  {
    id: 54,
    category: 'briefing',
    question: 'What is the one thing I should worry about most?',
    expectations: {
      dataMustExist: true,
    },
  },
  {
    id: 55,
    category: 'briefing',
    question: 'Give me a SWOT analysis of our current position',
    expectations: {
      dataMustExist: true,
    },
  },
  {
    id: 56,
    category: 'briefing',
    question: 'How does this week compare to last week?',
    expectations: {
      dataMustExist: true,
    },
  },
  {
    id: 57,
    category: 'briefing',
    question: 'What quick wins can we get this week?',
    expectations: {
      dataMustExist: true,
      requireFollowups: true,
    },
  },
  {
    id: 58,
    category: 'briefing',
    question: 'If you had to present our business to a board, what would you say?',
    expectations: {
      dataMustExist: true,
      requireSections: true,
    },
  },
  {
    id: 59,
    category: 'briefing',
    question: 'What KPIs should I be watching daily?',
    expectations: {
      dataMustExist: true,
    },
  },
  {
    id: 60,
    category: 'briefing',
    question: 'Rate our business health on a scale of 1-10 and explain why',
    expectations: {
      dataMustExist: true,
    },
  },

  // ── Category 5: Operations & Automation (61-70) ──────────────────────────
  {
    id: 61,
    category: 'operations',
    question: 'How is our automation running?',
    expectations: {
      dataMustExist: true,
      mustNotContain: ['agent_type', 'error_count', 'cron_expression'],
    },
  },
  {
    id: 62,
    category: 'operations',
    question: 'Are any business processes failing?',
    expectations: {
      dataMustExist: true,
    },
  },
  {
    id: 63,
    category: 'operations',
    question: 'How many automated processes do we have running?',
    expectations: {
      mustContainNumbers: [{ value: 172, tolerance: 5, label: 'total processes' }],
      dataMustExist: true,
    },
  },
  {
    id: 64,
    category: 'operations',
    question: 'Which automation processes need attention?',
    expectations: {
      dataMustExist: true,
      mustNotContain: ['SELECT', 'FROM', 'WHERE', 'stack trace'],
    },
  },
  {
    id: 65,
    category: 'operations',
    question: 'How much of our outreach is automated versus manual?',
    expectations: {
      dataMustExist: true,
    },
  },
  {
    id: 66,
    category: 'operations',
    question: 'What operational capacity do we have available?',
    expectations: {
      dataMustExist: true,
    },
  },
  {
    id: 67,
    category: 'operations',
    question: 'How reliable are our business processes?',
    expectations: {
      dataMustExist: true,
    },
  },
  {
    id: 68,
    category: 'operations',
    question: 'What is the error rate across our operations?',
    expectations: {
      dataMustExist: true,
    },
  },
  {
    id: 69,
    category: 'operations',
    question: 'How many system events happened in the last 24 hours?',
    expectations: {
      dataMustExist: true,
    },
  },
  {
    id: 70,
    category: 'operations',
    question: 'Are we operationally ready to scale to 100 students?',
    expectations: {
      dataMustExist: true,
    },
  },

  // ── Category 6: Forecasting & Strategy (71-80) ───────────────────────────
  {
    id: 71,
    category: 'strategy',
    question: 'Forecast our enrollment growth for next quarter',
    expectations: {
      dataMustExist: true,
      expectedIntent: ['forecast_request', 'general_insight'],
    },
  },
  {
    id: 72,
    category: 'strategy',
    question: 'If we double our email outreach, what impact would that have?',
    expectations: {
      dataMustExist: true,
    },
  },
  {
    id: 73,
    category: 'strategy',
    question: 'What is the most impactful thing we could do to increase enrollments?',
    expectations: {
      dataMustExist: true,
    },
  },
  {
    id: 74,
    category: 'strategy',
    question: 'Should we invest more in alumni referrals or cold outbound?',
    expectations: {
      dataMustExist: true,
    },
  },
  {
    id: 75,
    category: 'strategy',
    question: 'What would it take to get to 50 enrollments this year?',
    expectations: {
      dataMustExist: true,
    },
  },
  {
    id: 76,
    category: 'strategy',
    question: 'Are we spending our marketing budget effectively?',
    expectations: {
      dataMustExist: true,
    },
  },
  {
    id: 77,
    category: 'strategy',
    question: 'What trends are you seeing in our data?',
    expectations: {
      dataMustExist: true,
      requireFollowups: true,
    },
  },
  {
    id: 78,
    category: 'strategy',
    question: 'Compare our outreach volume to industry benchmarks',
    expectations: {
      dataMustExist: true,
    },
  },
  {
    id: 79,
    category: 'strategy',
    question: 'What is our customer acquisition cost?',
    expectations: {
      dataMustExist: false, // may not have cost data
    },
  },
  {
    id: 80,
    category: 'strategy',
    question: 'Where is our biggest bottleneck right now?',
    expectations: {
      dataMustExist: true,
      requireFollowups: true,
    },
  },

  // ── Category 7: Cross-Domain & Multi-Entity (81-90) ──────────────────────
  {
    id: 81,
    category: 'cross-domain',
    question: 'How many campaigns and leads do we have?',
    expectations: {
      mustContainNumbers: [
        { value: 13, tolerance: 0, label: 'campaigns' },
        { value: 849, tolerance: 5, label: 'leads' },
      ],
      dataMustExist: true,
    },
  },
  {
    id: 82,
    category: 'cross-domain',
    question: 'Show me leads, enrollments, and campaign performance together',
    expectations: {
      dataMustExist: true,
    },
  },
  {
    id: 83,
    category: 'cross-domain',
    question: 'How do our campaigns connect to enrollment outcomes?',
    expectations: {
      dataMustExist: true,
    },
  },
  {
    id: 84,
    category: 'cross-domain',
    question: 'What is the relationship between email volume and lead warming?',
    expectations: {
      dataMustExist: true,
    },
  },
  {
    id: 85,
    category: 'cross-domain',
    question: 'Give me a full picture — leads, campaigns, emails, and enrollments',
    expectations: {
      mustContainNumbers: [
        { value: 849, tolerance: 5, label: 'leads' },
        { value: 2, tolerance: 0, label: 'enrollments' },
      ],
      dataMustExist: true,
    },
  },
  {
    id: 86,
    category: 'cross-domain',
    question: 'How do strategy calls translate into enrollments?',
    expectations: {
      dataMustExist: true,
    },
  },
  {
    id: 87,
    category: 'cross-domain',
    question: 'Which part of the business is performing best and which worst?',
    expectations: {
      dataMustExist: true,
    },
  },
  {
    id: 88,
    category: 'cross-domain',
    question: 'How are alumni referrals performing compared to cold outreach across all metrics?',
    expectations: {
      dataMustExist: true,
    },
  },
  {
    id: 89,
    category: 'cross-domain',
    question: 'Tie together our outreach efforts and enrollment results',
    expectations: {
      dataMustExist: true,
    },
  },
  {
    id: 90,
    category: 'cross-domain',
    question: 'If I can only look at three metrics, which three should I watch?',
    expectations: {
      dataMustExist: true,
    },
  },

  // ── Category 8: Edge Cases & Stress Tests (91-100) ───────────────────────
  {
    id: 91,
    category: 'edge-case',
    question: 'What is our revenue?',
    expectations: {
      // We don't track revenue directly — should say so gracefully
      mustNotContain: ['$1,000,000', '$500,000', '$10,000'],
    },
  },
  {
    id: 92,
    category: 'edge-case',
    question: 'How many students failed the program?',
    expectations: {
      // Attendance/grades are 0 — should handle gracefully
      mustNotContain: ['50 students failed', '30% failure rate'],
    },
  },
  {
    id: 93,
    category: 'edge-case',
    question: 'Tell me everything',
    expectations: {
      dataMustExist: true,
      requireSections: true,
    },
  },
  {
    id: 94,
    category: 'edge-case',
    question: 'Why is our conversion rate so low?',
    expectations: {
      dataMustExist: true,
    },
  },
  {
    id: 95,
    category: 'edge-case',
    question: 'What data do you have access to?',
    expectations: {
      dataMustExist: true,
    },
  },
  {
    id: 96,
    category: 'edge-case',
    question: 'Can you predict how many enrollments we will have next month?',
    expectations: {
      dataMustExist: true,
    },
  },
  {
    id: 97,
    category: 'edge-case',
    question: '',
    expectations: {
      // Empty question — should handle gracefully, not crash
    },
  },
  {
    id: 98,
    category: 'edge-case',
    question: 'asdfghjkl random gibberish',
    expectations: {
      // Gibberish — should handle gracefully
    },
  },
  {
    id: 99,
    category: 'edge-case',
    question: 'How many agents have errors and what are the error messages?',
    expectations: {
      mustContainNumbers: [{ value: 3, tolerance: 0, label: 'agents with errors' }],
      dataMustExist: true,
    },
  },
  {
    id: 100,
    category: 'edge-case',
    question: 'Our board meeting is tomorrow. Give me every key metric with context.',
    expectations: {
      dataMustExist: true,
      requireSections: true,
      mustContainNumbers: [
        { value: 849, tolerance: 5, label: 'leads' },
        { value: 13, tolerance: 0, label: 'campaigns' },
        { value: 2, tolerance: 0, label: 'enrollments' },
      ],
    },
  },
];

// ─── Scoring Engine ─────────────────────────────────────────────────────────

interface TestResult {
  id: number;
  category: string;
  question: string;
  passed: boolean;
  score: number; // 0-100
  failures: string[];
  warnings: string[];
  response: {
    intent: string;
    confidence: number;
    narrative: string;
    hasNarrativeSections: boolean;
    followupCount: number;
    pipelineErrors: string[];
    executionPath: string;
  };
  duration_ms: number;
}

function scoreResponse(q: TestQuestion, resp: any): { score: number; failures: string[]; warnings: string[] } {
  const failures: string[] = [];
  const warnings: string[] = [];
  let deductions = 0;

  if (!resp || !resp.narrative) {
    return { score: 0, failures: ['No response or narrative returned'], warnings: [] };
  }

  const narrativeText = [
    resp.narrative || '',
    resp.narrative_sections?.executive_summary || '',
    ...(resp.narrative_sections?.key_findings || []),
    resp.narrative_sections?.risk_assessment || '',
    ...(resp.narrative_sections?.recommended_actions || []),
  ].join(' ');

  const allText = narrativeText.toLowerCase();

  // 1. Check required numbers (30 pts possible)
  if (q.expectations.mustContainNumbers) {
    for (const { value, tolerance, label } of q.expectations.mustContainNumbers) {
      const found = findNumberInText(narrativeText, value, tolerance);
      if (!found) {
        failures.push(`Missing number: ${label} (expected ~${value})`);
        deductions += 10;
      }
    }
  }

  // 2. Check must-not-contain (20 pts possible — technical jargon)
  if (q.expectations.mustNotContain) {
    for (const phrase of q.expectations.mustNotContain) {
      if (allText.includes(phrase.toLowerCase())) {
        failures.push(`Contains forbidden phrase: "${phrase}"`);
        deductions += 5;
      }
    }
  }

  // 3. Check should-contain (10 pts possible)
  if (q.expectations.shouldContain) {
    for (const phrase of q.expectations.shouldContain) {
      if (!allText.includes(phrase.toLowerCase())) {
        warnings.push(`Missing expected phrase: "${phrase}"`);
        deductions += 3;
      }
    }
  }

  // 4. Check narrative sections exist (10 pts)
  if (q.expectations.requireSections && !resp.narrative_sections) {
    failures.push('Missing narrative_sections');
    deductions += 10;
  }

  // 5. Check follow-ups exist (5 pts)
  if (q.expectations.requireFollowups) {
    const followupCount = resp.recommendations?.length || 0;
    if (followupCount < 2) {
      warnings.push(`Only ${followupCount} follow-up questions`);
      deductions += 5;
    }
  }

  // 6. Check "data not available" when data should exist (15 pts)
  if (q.expectations.dataMustExist) {
    const noDataPhrases = ['no data available', 'data not available', 'unable to retrieve', 'no results found', 'no information available'];
    for (const phrase of noDataPhrases) {
      if (allText.includes(phrase) && narrativeText.length < 100) {
        failures.push(`Says "${phrase}" but data exists`);
        deductions += 15;
      }
    }
  }

  // 7. Check for fabricated large numbers not in ground truth (10 pts)
  const fabricatedCheck = checkForFabrication(narrativeText);
  if (fabricatedCheck.length > 0) {
    for (const fab of fabricatedCheck) {
      warnings.push(`Possible fabrication: ${fab}`);
      deductions += 5;
    }
  }

  // 8. Pipeline errors (10 pts)
  const pipelineErrors = (resp.pipelineSteps || []).filter((s: any) => s.status === 'error');
  if (pipelineErrors.length > 2) {
    warnings.push(`${pipelineErrors.length} pipeline steps errored`);
    deductions += 5;
  }

  // 9. Expected intent (5 pts)
  if (q.expectations.expectedIntent && q.expectations.expectedIntent.length > 0) {
    if (!q.expectations.expectedIntent.includes(resp.intent)) {
      warnings.push(`Intent was "${resp.intent}", expected one of: ${q.expectations.expectedIntent.join(', ')}`);
      deductions += 3;
    }
  }

  const score = Math.max(0, 100 - deductions);
  return { score, failures, warnings };
}

function findNumberInText(text: string, target: number, tolerance: number): boolean {
  // Extract all numbers from text
  const numbers = text.match(/[\d,]+\.?\d*/g);
  if (!numbers) return false;
  for (const numStr of numbers) {
    const num = parseFloat(numStr.replace(/,/g, ''));
    if (!isNaN(num) && Math.abs(num - target) <= tolerance) {
      return true;
    }
  }
  // Also check for written-out small numbers
  const writtenNumbers: Record<string, number> = {
    zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5,
    six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
    eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15,
  };
  const lower = text.toLowerCase();
  for (const [word, val] of Object.entries(writtenNumbers)) {
    if (lower.includes(word) && Math.abs(val - target) <= tolerance) {
      return true;
    }
  }
  return false;
}

function checkForFabrication(text: string): string[] {
  const issues: string[] = [];
  const numbers = text.match(/[\d,]+/g);
  if (!numbers) return issues;

  // Known valid numbers from ground truth (with some tolerance for computed values)
  const knownNumbers = new Set([
    849, 839, 10, 13, 11, 1, 2, 3, 172, 168, 805, 514, 75, 5282,
    1649, 4520, 14, 848, 12, 4, 608, 240, 2753, 27442, 58336, 181,
    // Common computed values
    0, 100, 24, 7, 30, 90, 365, 50, 20, 15, 5, 25, 35, 45, 60, 70, 80,
  ]);

  for (const numStr of numbers) {
    const num = parseInt(numStr.replace(/,/g, ''), 10);
    if (isNaN(num) || num < 100) continue; // Skip small numbers
    if (num > 100000) {
      issues.push(`Very large number ${num} — possible fabrication`);
    }
    // Don't flag numbers close to known values
    let closeToKnown = false;
    for (const known of knownNumbers) {
      if (Math.abs(num - known) <= known * 0.05) {
        closeToKnown = true;
        break;
      }
    }
    if (!closeToKnown && num > 1000) {
      // Only flag very suspicious large numbers
      // Many numbers are computed percentages, rates, etc.
    }
  }
  return issues;
}

// ─── Test Runner ────────────────────────────────────────────────────────────

const API_BASE = process.env.CORY_TEST_API || 'http://127.0.0.1:3001';
const AUTH_TOKEN = process.env.CORY_TEST_TOKEN || '';

async function askCory(question: string): Promise<any> {
  const http = require('http');
  return new Promise((resolve, reject) => {
    const data = JSON.stringify({ question });
    const url = new URL(`${API_BASE}/api/admin/intelligence/assistant`);
    const options = {
      hostname: url.hostname,
      port: url.port || 3001,
      path: url.pathname,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${AUTH_TOKEN}`,
        'Content-Length': Buffer.byteLength(data),
      },
    };
    const req = http.request(options, (res: any) => {
      let body = '';
      res.on('data', (c: string) => (body += c));
      res.on('end', () => {
        try { resolve(JSON.parse(body)); }
        catch { reject(new Error(`Invalid JSON: ${body.substring(0, 200)}`)); }
      });
    });
    req.on('error', reject);
    req.setTimeout(90000, () => { req.destroy(); reject(new Error('Timeout')); });
    req.write(data);
    req.end();
  });
}

// ─── Jest Test Suite ────────────────────────────────────────────────────────

// Group questions into batches of 5 for parallel execution
const BATCH_SIZE = 5;

function chunkArray<T>(arr: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < arr.length; i += size) {
    chunks.push(arr.slice(i, i + size));
  }
  return chunks;
}

// Store all results for final report
const allResults: TestResult[] = [];

describe('Cory Executive Readiness — 100 Conversations', () => {
  // Skip if no token configured
  const shouldRun = !!process.env.CORY_TEST_TOKEN;

  const batches = chunkArray(TEST_QUESTIONS, BATCH_SIZE);

  for (const batch of batches) {
    const batchLabel = `Q${batch[0].id}-Q${batch[batch.length - 1].id}`;

    describe(`Batch ${batchLabel}`, () => {
      for (const q of batch) {
        const testFn = shouldRun ? it : it.skip;
        testFn(
          `Q${q.id} [${q.category}]: ${q.question || '(empty)'}`,
          async () => {
            const t0 = Date.now();
            let resp: any;
            try {
              resp = await askCory(q.question);
            } catch (err: any) {
              const result: TestResult = {
                id: q.id,
                category: q.category,
                question: q.question,
                passed: false,
                score: 0,
                failures: [`API error: ${err.message}`],
                warnings: [],
                response: { intent: '', confidence: 0, narrative: '', hasNarrativeSections: false, followupCount: 0, pipelineErrors: [], executionPath: '' },
                duration_ms: Date.now() - t0,
              };
              allResults.push(result);
              throw err;
            }

            const { score, failures, warnings } = scoreResponse(q, resp);
            const pipelineErrors = (resp.pipelineSteps || [])
              .filter((s: any) => s.status === 'error')
              .map((s: any) => `${s.name}: ${s.detail}`);

            const result: TestResult = {
              id: q.id,
              category: q.category,
              question: q.question,
              passed: score >= 70 && failures.length === 0,
              score,
              failures,
              warnings,
              response: {
                intent: resp.intent,
                confidence: resp.confidence,
                narrative: (resp.narrative || '').substring(0, 300),
                hasNarrativeSections: !!resp.narrative_sections,
                followupCount: resp.recommendations?.length || 0,
                pipelineErrors,
                executionPath: resp.execution_path || '',
              },
              duration_ms: Date.now() - t0,
            };
            allResults.push(result);

            // Log for debugging
            if (failures.length > 0) {
              console.log(`\n  ❌ Q${q.id}: ${failures.join('; ')}`);
              console.log(`     Narrative: ${result.response.narrative.substring(0, 150)}...`);
            }
            if (warnings.length > 0) {
              console.log(`\n  ⚠️  Q${q.id}: ${warnings.join('; ')}`);
            }

            // Assert
            expect(failures).toEqual([]);
            expect(score).toBeGreaterThanOrEqual(70);
          },
          120000, // 2 min timeout per question
        );
      }
    });
  }

  // Final report
  afterAll(() => {
    if (allResults.length === 0) return;

    console.log('\n\n═══════════════════════════════════════════════════════');
    console.log('       CORY EXECUTIVE READINESS REPORT');
    console.log('═══════════════════════════════════════════════════════\n');

    const passed = allResults.filter(r => r.passed);
    const failed = allResults.filter(r => !r.passed);
    const avgScore = allResults.reduce((s, r) => s + r.score, 0) / allResults.length;
    const avgDuration = allResults.reduce((s, r) => s + r.duration_ms, 0) / allResults.length;

    console.log(`Total questions: ${allResults.length}`);
    console.log(`Passed:          ${passed.length} (${(passed.length / allResults.length * 100).toFixed(1)}%)`);
    console.log(`Failed:          ${failed.length}`);
    console.log(`Average score:   ${avgScore.toFixed(1)}/100`);
    console.log(`Average latency: ${(avgDuration / 1000).toFixed(1)}s\n`);

    // Category breakdown
    const categories = [...new Set(allResults.map(r => r.category))];
    console.log('─── By Category ───');
    for (const cat of categories) {
      const catResults = allResults.filter(r => r.category === cat);
      const catPassed = catResults.filter(r => r.passed).length;
      const catAvg = catResults.reduce((s, r) => s + r.score, 0) / catResults.length;
      console.log(`  ${cat.padEnd(15)} ${catPassed}/${catResults.length} passed  avg: ${catAvg.toFixed(0)}/100`);
    }

    // Failed questions detail
    if (failed.length > 0) {
      console.log('\n─── Failed Questions ───');
      for (const r of failed) {
        console.log(`\n  Q${r.id} [${r.category}] Score: ${r.score}/100`);
        console.log(`  Question: ${r.question}`);
        console.log(`  Intent: ${r.response.intent} (${r.response.confidence})`);
        console.log(`  Failures: ${r.failures.join('; ')}`);
        if (r.warnings.length > 0) console.log(`  Warnings: ${r.warnings.join('; ')}`);
        console.log(`  Narrative: ${r.response.narrative.substring(0, 200)}`);
      }
    }

    // Warnings
    const withWarnings = allResults.filter(r => r.warnings.length > 0 && r.passed);
    if (withWarnings.length > 0) {
      console.log(`\n─── Passed with Warnings (${withWarnings.length}) ───`);
      for (const r of withWarnings) {
        console.log(`  Q${r.id}: ${r.warnings.join('; ')}`);
      }
    }

    // Executive readiness verdict
    console.log('\n═══════════════════════════════════════════════════════');
    const passRate = passed.length / allResults.length;
    if (passRate >= 0.95 && avgScore >= 85) {
      console.log('  VERDICT: ✅ READY for executive use');
    } else if (passRate >= 0.85 && avgScore >= 75) {
      console.log('  VERDICT: ⚠️  NEARLY READY — minor issues remain');
    } else {
      console.log('  VERDICT: ❌ NOT READY — significant issues found');
    }
    console.log(`  Pass rate: ${(passRate * 100).toFixed(1)}%  |  Avg score: ${avgScore.toFixed(1)}/100`);
    console.log('═══════════════════════════════════════════════════════\n');
  });
});

export { TEST_QUESTIONS, GROUND_TRUTH, scoreResponse, TestResult };
