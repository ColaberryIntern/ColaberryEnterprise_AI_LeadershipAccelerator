/**
 * The 360° profile payload, as one contract.
 *
 * Extracted from PersonProfilePage on 2026-09-09 when an audit of every
 * person-keyed table in production added twelve panels and the page passed
 * every reasonable size ceiling.
 *
 * Every field mirrors a server type in backend/src/services/adminOs/panels.
 * A panel the caller may not see is ABSENT from the payload rather than empty,
 * so `undefined` here means "not permitted" and `null` means "permitted, but
 * this person has none". The tabs depend on that distinction.
 */

export interface AcquisitionPanel {
  phone: string | null; role: string | null; companySize: string | null;
  industry: string | null; linkedinUrl: string | null;
  source: string | null; formType: string | null; utmSource: string | null;
  utmCampaign: string | null; pageUrl: string | null; interestArea: string | null;
  message: string | null; firstSeen: string | null;
  pipelineStage: string | null; leadScore: number | null; temperature: string | null;
  temperatureUpdatedAt: string | null; qualificationLevel: string | null;
  interestLevel: string | null; maturityScore: number | null;
  status: string | null; assignedAdmin: string | null; lastContactedAt: string | null;
  notes: string | null; consentContact: boolean | null;
  evaluating90Days: boolean | null; createdAt: string | null;
  leadId: number | null; leadScoreMax: number;
}

export interface VisitorData {
  id?: string;
  intent_score?: number;
  intent_level?: string;
  total_sessions?: number;
  total_pageviews?: number;
  first_seen_at?: string;
  last_seen_at?: string;
  device_type?: string;
  behavioral_signals?: Array<{ signal_type?: string } | string>;
  sessions?: Array<{
    started_at?: string; duration_seconds?: number; pageview_count?: number;
    entry_page?: string; exit_page?: string;
  }>;
}

export interface TempEntry {
  from_temperature?: string; to_temperature?: string;
  changed_by?: string; lead_score?: number; created_at?: string;
}

export interface AppointmentRow {
  kind: string; title: string | null; scheduledAt: string | null;
  status: string | null; notes: string | null; meetLink: string | null;
}

export interface AutomationRow {
  type: string; status: string | null; detail: string | null; createdAt: string | null;
}

export interface LearningRow {
  enrollmentId: string; cohortId: string | null; status: string | null;
  tier: string | null; enrollmentType: string | null; enrolledAt: string | null;
}

export interface BillingRow {
  enrollmentId: string; paymentStatus: string | null;
  paymentMethod: string | null; amountPaid: number | null;
}

export interface TimelineEvent {
  occurredAt: string; domain: string; source: string; type: string; summary: string | null;
  /** How many identical events this row stands for. 1 for an ordinary event. */
  occurrences: number;
}

export interface TrustPanel {
  leadIds: number[];
  enrollmentIds: string[];
  matchMethod: string;
  tracedToLead: boolean;
  consentRecorded: boolean | null;
  lastActivity: string | null;
  gaps: Array<{ field: string; reason: string }>;
}

export interface Journey {
  firstTouch: string | null; lastActivity: string | null; daysKnown: number | null;
  sessions: number; pageEvents: number; campaigns: number; emailsSent: number;
  enrollments: number; intentScore: number | null;
  cardsCompleted: number; sessionsAttended: number;
}

// ── Programme panels, added 2026-09-09 ──────────────────────────────────────

export interface StatusCount { status: string; count: number }

export interface ClassActivityPanel {
  attendanceByStatus: StatusCount[];
  attendanceTotal: number;
  /** Null when no register was taken. Never 0 standing in for "no data". */
  attendanceRate: number | null;
  recentSessions: Array<{
    title: string | null; sessionDate: string | null;
    status: string | null; durationMinutes: number | null;
  }>;
  presenceEvents: number;
  pollResponses: number;
  pulseChecks: number;
  lastSeenInClass: string | null;
}

export interface CurriculumPanel {
  byStatus: StatusCount[];
  completed: number;
  total: number;
  completionRate: number | null;
  quizzesTaken: number;
  averageQuizScore: number | null;
  totalAttempts: number;
  lastCompleted: { title: string | null; type: string | null; week: number | null; at: string | null } | null;
  weeksTouched: number;
  reflections: number;
  surveys: number;
}

export interface ProjectRow {
  id: string; name: string | null; organizationName: string | null;
  industry: string | null; stage: string | null;
  businessProblem: string | null; useCase: string | null;
  maturityScore: number | null; healthScore: number | null;
  velocityScore: number | null; stabilityScore: number | null;
  requirementsCompletionPct: number | null;
  githubRepoUrl: string | null; portfolioUrl: string | null;
  openTasks: number; doneTasks: number;
  createdAt: string | null; updatedAt: string | null; archivedAt: string | null;
}

export interface CaseStudyRow {
  id: string; slug: string | null; title: string | null; status: string | null;
  visibility: string | null; organizationDisplayName: string | null;
  organizationIsAnonymised: boolean | null; industry: string | null;
  primaryCapability: string | null; approvedAt: string | null;
  publishedCount: number; snapshotCount: number; projectName: string | null;
}

export interface CapstoneRow {
  id: string; slug: string | null; status: string | null; visibility: string | null;
  version: number | null; publishedAt: string | null; projectName: string | null;
}

export interface CertPrepPanel {
  sessions: Array<{
    trackId: string | null; status: string | null; scaledScore: number | null;
    correctCount: number | null; totalCount: number | null; completedAt: string | null;
  }>;
  evidenceMapped: number;
  evidenceVerified: number;
  platformUsageNote: string | null;
}

export interface WorkPanel {
  projects: ProjectRow[];
  caseStudies: CaseStudyRow[];
  capstones: CapstoneRow[];
  portfolio: Array<{ kind: string; title: string | null; status: string | null; at: string | null }>;
  certPrep: CertPrepPanel;
  clientOrganisations: string[];
}

export interface AccountPanel {
  owns: Array<{
    id: string; name: string | null; status: string | null;
    organizationType: string | null; memberCount: number; createdAt: string | null;
  }>;
  memberOf: Array<{
    orgId: string; orgName: string | null; role: string | null;
    team: string | null; inviteStatus: string | null; joinedAt: string | null;
  }>;
  tenantContext: Array<{
    tenantName: string | null; relationshipType: string | null;
    status: string | null; firstTouchAt: string | null; lastTouchAt: string | null;
  }>;
  sponsor: { companyName: string | null; billingStatus: string | null } | null;
  accountType: 'organisation_owner' | 'organisation_member' | 'sponsor_contact' | 'individual';
}

export interface SubscriptionRow {
  id: string; plan: string | null; status: string | null; amountCents: number | null;
  startedAt: string | null; currentPeriodEnd: string | null;
  canceledAt: string | null; cancelReason: string | null;
  appliedCreditCents: number | null; hasPaysimpleCustomer: boolean;
}

export interface BillingDetailPanel {
  subscriptions: SubscriptionRow[];
  activeCount: number; failedCount: number; canceledCount: number;
  creditsCents: number; refundsCents: number;
  lastReminder: { kind: string | null; status: string | null; sentAt: string | null } | null;
  failuresSinceLastSuccess: number;
  currentPeriodEnd: string | null;
}

export interface SkillsPanel {
  level: { slug: string | null; rank: number | null; architectReadiness: number | null; promotedAt: string | null } | null;
  competencies: Array<{ domainId: string; confidence: number | null; evidenceCount: number | null; lastEvidenceAt: string | null }>;
  architectureSkills: Array<{ skillId: string; proficiency: number | null; confidence: number | null; evidenceCount: number | null }>;
  evidenceRecords: number; validatedEvidence: number; skillEvidence: number;
  resumeSkillClaims: number; xpTotal: number | null; pointsTotal: number | null;
}

export interface MentorPanel {
  mentorTurns: number;
  lastTurnAt: string | null;
  memory: { summary: string | null; goals: string | null; lastDistilledOn: string | null } | null;
  assessments: Array<{
    kind: string | null; score: number | null; passed: boolean | null;
    week: number | null; attemptNumber: number | null; submittedAt: string | null;
  }>;
  architectEvaluations: Array<{ weekNumber: number | null; overallScore: number | null; evaluatedAt: string | null }>;
}

export interface ContentPanel {
  podcasts: number; blogPosts: number; videos: number;
  feedImpressions: number; feedInteractions: number; aiPulseExposures: number;
  lastConsumedAt: string | null;
  recent: Array<{ kind: string; title: string | null; at: string | null; seenCount: number | null }>;
}

export interface CommunityPanel {
  level: number | null; points: number | null;
  posts: number; likesGiven: number; contributions: number; pointsEvents: number;
  rooms: Array<{ role: string | null; accessState: string | null; joinedAt: string | null }>;
  roomMessages: number; referrals: number;
}

export interface ProfileContextPanel {
  industry: string | null; companyName: string | null; companySize: string | null;
  role: string | null; goal: string | null; aiMaturityLevel: number | null;
  identifiedUseCase: string | null; linkedinUrl: string | null;
  resumeFileName: string | null; resumeUploadedAt: string | null;
  githubRepos: Array<{ repoUrl: string | null; language: string | null; fileCount: number | null; lastSyncAt: string | null }>;
}

export interface CommunicationOutcome { outcome: string; at: string | null; channel: string | null }

export interface CommunicationMessage {
  id: string;
  direction: 'inbound' | 'outbound';
  channel: string | null;
  subject: string | null;
  body: string | null;
  sentAt: string | null;
  scheduledFor: string | null;
  status: string | null;
  aiGenerated: boolean;
  stepIndex: number | null;
  toAddress: string | null;
  source: string;
  outcomes: CommunicationOutcome[];
}

export interface CommunicationThread {
  campaignId: string | null;
  campaignName: string;
  campaignStatus: string | null;
  enrollmentStatus: string | null;
  stepIndex: number | null;
  totalSteps: number | null;
  enrolledAt: string | null;
  lastActivityAt: string | null;
  touchpoints: number | null;
  responses: number | null;
  messages: CommunicationMessage[];
}

export interface CommunicationsPanel {
  threads: CommunicationThread[];
  totalMessages: number;
  totalCampaigns: number;
  totalOutcomes: number;
  inboundCount: number;
  /** True when the message cap was hit, so the UI can say so. */
  truncated: boolean;
}

export interface CcppEnrolment {
  className: string | null; courseName: string | null;
  classStartDate: string | null; enrollmentDate: string | null;
  fee: number | null; hired: boolean; certified: boolean;
  cancelled: boolean; courseFormat: string | null; reenrolled: boolean;
}

export interface CcppDisc {
  dominance: number | null; influencer: number | null;
  steadiness: number | null; compliance: number | null;
  leadership: number | null; negotiation: number | null;
  flexibility: number | null; goalOrientation: number | null;
  dominantTrait: string | null;
}

/** What they did with Colaberry BEFORE this platform. */
export interface CcppHistory {
  /** False when CCPP could not be reached — not the same as "no history". */
  available: boolean;
  unavailableReason: string | null;
  enrolments: CcppEnrolment[];
  totalListedFees: number | null;
  everHired: boolean | null;
  everCertified: boolean | null;
  firstEnrolledAt: string | null;
  lastEnrolledAt: string | null;
  payments: {
    paysimpleCount: number | null; paysimpleAmount: number | null;
    paypalCount: number | null; paypalAmount: number | null;
  } | null;
  disc: CcppDisc | null;
}

export interface StrategyBrief {
  mode: 'sales' | 'coaching' | 'winback';
  modeReason: string;
  markdown: string;
  basis: string[];
  gaps: string[];
  generatedAt: string;
}

export interface Profile {
  email: string; name: string | null; stage: string; tracedToLead: boolean;
  company: string | null; title: string | null;
  acquisition?: AcquisitionPanel | null;
  learning?: LearningRow[];
  billing?: BillingRow[];
  engagement?: { sessions: number; firstSeen: string | null; lastSeen: string | null; sites: string[] } | null;
  appointments?: AppointmentRow[];
  automation?: AutomationRow[];
  classActivity?: ClassActivityPanel | null;
  curriculum?: CurriculumPanel | null;
  work?: WorkPanel | null;
  account?: AccountPanel | null;
  billingDetail?: BillingDetailPanel | null;
  communications?: CommunicationsPanel | null;
  history?: CcppHistory | null;
  skills?: SkillsPanel | null;
  mentor?: MentorPanel | null;
  content?: ContentPanel | null;
  community?: CommunityPanel | null;
  profileContext?: ProfileContextPanel | null;
  intentSuppressedReason?: string;
  trust?: TrustPanel;
  journey?: Journey;
  timeline?: TimelineEvent[];
  timelineDomains?: string[];
  withheldPanels: string[];
}
