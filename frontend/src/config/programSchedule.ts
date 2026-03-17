export const PROGRAM_SCHEDULE = {
  totalSessions: 5,
  totalWeeks: 3,
  hoursPerSession: 2,
  totalHours: 10,
  daysOfWeek: ['Tuesday', 'Thursday'] as const,
  daysShort: ['Tue', 'Thu'] as const,
  dayLabels: [
    'Day 1 — Tuesday',
    'Day 2 — Thursday',
    'Day 3 — Tuesday',
    'Day 4 — Thursday',
    'Day 5 — Thursday (Presentations)',
  ] as const,
  weekLabels: ['Week 1', 'Week 2', 'Week 3'] as const,
  format: 'Live virtual sessions',
  summaryBadges: ['5 Sessions', '3 Weeks', '2 Hours Each', 'Tue & Thu'] as const,
  shortDescription:
    '5 sessions over 3 weeks, 2 hours each, held on Tuesdays and Thursdays',
  pricingDescription:
    'The accelerator runs across 5 focused sessions spread over 3 weeks on Tuesdays and Thursdays. Each session is a structured 2-hour working session. Total participant time: approximately 10 hours plus applied work between sessions.',
  sponsorshipTimeline: '5 sessions, 3 weeks',
  heroTagline: 'A 5-Session AI Deployment Accelerator',
  price: '$4,500',
};

export const STANDARD_CTAS = {
  primary: 'Design Your AI System Blueprint',
  secondary: 'Schedule an Executive AI Strategy Call',
} as const;
