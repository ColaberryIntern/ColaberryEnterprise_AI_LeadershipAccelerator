import {
  classifyInitiative,
  computeErrorRatePct,
  isUnhealthy,
  isUntouchedOutcome,
  AgentHealthSnapshot,
  WORKFORCE_HIGH_ERROR_RATE_THRESHOLD_PCT,
  WORKFORCE_HIGH_ERROR_RATE_MIN_COUNT,
} from '../staleInitiativeResolutionRules';

function healthMap(entries: Record<string, AgentHealthSnapshot>): Map<string, AgentHealthSnapshot> {
  return new Map(Object.entries(entries));
}

describe('computeErrorRatePct / isUnhealthy — boundary values', () => {
  it('run_count=0 never divides by zero', () => {
    expect(computeErrorRatePct(0, 0)).toBe(0);
    expect(isUnhealthy(0, 0)).toBe(false);
  });

  it('exactly at the rate threshold (20%) is healthy — condition is strictly ">"', () => {
    // 20/100 = 20% exactly
    expect(isUnhealthy(100, 20)).toBe(false);
  });

  it('just above the rate threshold with error_count>=10 is unhealthy', () => {
    // 21/100 = 21%
    expect(isUnhealthy(100, 21)).toBe(true);
  });

  it('high rate but error_count below the minimum count is healthy (both conditions required)', () => {
    // 90% rate but only 9 errors
    expect(isUnhealthy(10, 9)).toBe(false);
  });

  it('high rate with error_count exactly at the minimum count is unhealthy', () => {
    // 100% rate, 10 errors
    expect(isUnhealthy(10, 10)).toBe(true);
  });

  it('imports the real PR #1482 constants, not re-declared magic numbers', () => {
    expect(WORKFORCE_HIGH_ERROR_RATE_THRESHOLD_PCT).toBe(20);
    expect(WORKFORCE_HIGH_ERROR_RATE_MIN_COUNT).toBe(10);
  });
});

describe('classifyInitiative — department alert window', () => {
  it('matches "<Dept> department triggered N alerts in 24h" -> dept_alert_cancelled', () => {
    const result = classifyInitiative(
      { id: 'i1', title: 'Finance department triggered 6 alerts in 24h' },
      healthMap({}),
      {},
    );
    expect(result.outcome).toBe('dept_alert_cancelled');
    expect(result.target_initiative_status).toBe('cancelled');
    expect(result.target_ticket_status).toBe('cancelled');
    expect(result.evidence_note).toMatch(/24-hour observation window expired/);
    expect(result.evidence_note).toMatch(/Finance/);
  });

  it('handles a multi-word department name (e.g. "Analytics Engine")', () => {
    const result = classifyInitiative(
      { id: 'i2', title: 'Analytics Engine department triggered 6 alerts in 24h' },
      healthMap({}),
      {},
    );
    expect(result.outcome).toBe('dept_alert_cancelled');
    expect(result.evidence_note).toMatch(/Analytics Engine/);
  });
});

describe('classifyInitiative — explicit exclusion (OpenclawLearningOptimizationAgent has N% error rate)', () => {
  it('excludes regardless of the live number differing from the title\'s stale snapshot', () => {
    // Title says 84% (a stale snapshot from creation time); live data now reads 83.45%.
    // The exclusion must match by agent name + pattern shape, not the literal percentage.
    const result = classifyInitiative(
      { id: 'i3', title: 'OpenclawLearningOptimizationAgent has 84% error rate' },
      healthMap({
        OpenclawLearningOptimizationAgent: { status: 'idle', enabled: true, run_count: 882, error_count: 736 },
      }),
      {},
    );
    expect(result.outcome).toBe('explicitly_excluded');
    expect(result.target_initiative_status).toBeNull();
    expect(result.target_ticket_status).toBeNull();
    expect(isUntouchedOutcome(result.outcome)).toBe(true);
  });

  it('excludes even with a different embedded percentage in the title', () => {
    const result = classifyInitiative(
      { id: 'i3b', title: 'OpenclawLearningOptimizationAgent has 12% error rate' },
      healthMap({}),
      {},
    );
    expect(result.outcome).toBe('explicitly_excluded');
  });

  it('does NOT exclude the sibling "is in error state" row for the same agent — it goes through the normal health check and independently lands on still_unhealthy given real production numbers', () => {
    const result = classifyInitiative(
      { id: 'i4', title: 'OpenclawLearningOptimizationAgent is in error state' },
      healthMap({
        OpenclawLearningOptimizationAgent: { status: 'idle', enabled: true, run_count: 882, error_count: 736 },
      }),
      {},
    );
    expect(result.outcome).toBe('still_unhealthy');
    expect(result.target_initiative_status).toBeNull();
  });
});

describe('classifyInitiative — healthy agent', () => {
  it('resolves to healthy_completed when current rate is well under threshold', () => {
    const result = classifyInitiative(
      { id: 'i5', title: 'AccessControlGuardianAgent is in error state' },
      healthMap({
        AccessControlGuardianAgent: { status: 'idle', enabled: true, run_count: 152, error_count: 1 },
      }),
      {},
    );
    expect(result.outcome).toBe('healthy_completed');
    expect(result.target_initiative_status).toBe('completed');
    expect(result.target_ticket_status).toBe('done');
    expect(result.agent_name).toBe('AccessControlGuardianAgent');
    expect(result.evidence_note).toMatch(/152/);
    expect(result.evidence_note).toMatch(/PR #1482/);
  });

  it('also matches the "has N% error rate" pattern for a non-excluded agent', () => {
    const result = classifyInitiative(
      { id: 'i5b', title: 'SomeAgent has 3% error rate' },
      healthMap({ SomeAgent: { status: 'idle', enabled: true, run_count: 1000, error_count: 30 } }),
      {},
    );
    expect(result.outcome).toBe('healthy_completed');
  });
});

describe('classifyInitiative — still unhealthy', () => {
  it('leaves the initiative untouched when the agent is still over threshold', () => {
    const result = classifyInitiative(
      { id: 'i6', title: 'CampaignQAAgent is in error state' },
      healthMap({ CampaignQAAgent: { status: 'active', enabled: true, run_count: 100, error_count: 40 } }),
      {},
    );
    expect(result.outcome).toBe('still_unhealthy');
    expect(result.target_initiative_status).toBeNull();
    expect(result.target_ticket_status).toBeNull();
  });
});

describe('classifyInitiative — retired agent', () => {
  it('retired agent resolves to retired_completed, citing the retirement reason not a health snapshot', () => {
    const result = classifyInitiative(
      { id: 'i7', title: 'CompanyStrategicCycle is in error state' },
      healthMap({
        CompanyStrategicCycle: { status: 'paused', enabled: false, run_count: 644, error_count: 4 },
      }),
      { CompanyStrategicCycle: 'retired 2026-08-15 — duplicate registration; run manually via companyRoutes' },
    );
    expect(result.outcome).toBe('retired_completed');
    expect(result.target_initiative_status).toBe('completed');
    expect(result.target_ticket_status).toBe('done');
    expect(result.evidence_note).toMatch(/retired/);
    expect(result.evidence_note).toMatch(/duplicate registration/);
  });

  it('retirement wins even when the agent\'s own live numbers would independently look healthy (not just "happens to also be healthy")', () => {
    // CompanyStrategicCycle's real live rate (0.62%) IS well under threshold — this test
    // proves the retired branch is reached FIRST and the evidence text is the retirement
    // fact, never conflated with a health-check pass.
    const result = classifyInitiative(
      { id: 'i7b', title: 'CompanyStrategicCycle is in error state' },
      healthMap({
        CompanyStrategicCycle: { status: 'paused', enabled: false, run_count: 644, error_count: 4 },
      }),
      { CompanyStrategicCycle: 'retired reason' },
    );
    expect(result.outcome).toBe('retired_completed');
    expect(result.evidence_note).not.toMatch(/PR #1482/); // not the healthy-branch evidence text
  });

  it('retired agent with no live ai_agents row still resolves (rows are kept, not deleted, but defensive anyway)', () => {
    const result = classifyInitiative(
      { id: 'i7c', title: 'SomeRetiredAgent is in error state' },
      healthMap({}),
      { SomeRetiredAgent: 'retired for testing' },
    );
    expect(result.outcome).toBe('retired_completed');
    expect(result.evidence_note).toMatch(/no matching ai_agents row found live/);
  });
});

describe('classifyInitiative — agent not found', () => {
  it('unresolvable agent name -> ambiguous_skipped', () => {
    const result = classifyInitiative(
      { id: 'i8', title: 'SomeUnknownAgentThatNoLongerExists is in error state' },
      healthMap({}),
      {},
    );
    expect(result.outcome).toBe('ambiguous_skipped');
    expect(result.target_initiative_status).toBeNull();
  });
});

describe('classifyInitiative — unrecognized title pattern', () => {
  it('a title matching neither pattern (e.g. the real "is slow (Ns avg)" survivor row) is ambiguous_skipped, not force-fit', () => {
    const result = classifyInitiative(
      { id: 'i9', title: 'CampaignQAAgent is slow (120.1s avg)' },
      healthMap({ CampaignQAAgent: { status: 'idle', enabled: true, run_count: 595, error_count: 1 } }),
      {},
    );
    expect(result.outcome).toBe('ambiguous_skipped');
    expect(result.target_initiative_status).toBeNull();
    expect(result.evidence_note).toMatch(/does not match any recognized/);
  });
});

describe('classifyInitiative — full production breakdown reproduction', () => {
  // REAL production data, not synthetic. Both arrays below are a literal, unedited
  // transcription of two live queries run against production Postgres during this
  // run's own DISCOVER phase (2026-08-15, `docker exec accelerator-db psql -U
  // accelerator -d accelerator_prod`):
  //
  //   SELECT title FROM strategic_initiatives WHERE status='proposed' ORDER BY title;
  //     -> exactly 68 rows, transcribed verbatim below.
  //   SELECT agent_name, status, enabled, run_count, error_count FROM ai_agents
  //     WHERE agent_name IN (<the 59 names parsed from the 59 "is in error state"
  //     titles above>);
  //     -> exactly 59 rows, transcribed verbatim below.
  //
  // This is the real production baseline `execution-contract.md`'s "Expected
  // resolution breakdown" table was derived from — this test proves the shipped
  // classifier reproduces that exact table (57/1/7/1/1/1) against the real data, not
  // a proxy.
  const REAL_PRODUCTION_TITLES: string[] = [
    'AccessControlGuardianAgent is in error state',
    'AdmissionsAssistantAgent is in error state',
    'AdmissionsCallbackManagementAgent is in error state',
    'AdmissionsCallComplianceMonitor is in error state',
    'AdmissionsConversationContinuityAgent is in error state',
    'AdmissionsConversationMemoryAgent is in error state',
    'AdmissionsConversationTaskMonitor is in error state',
    'AdmissionsConversionArchitect is in error state',
    'Admissions department triggered 5 alerts in 24h',
    'AdmissionsExecutiveUpdateAgent is in error state',
    'AdmissionsHighIntentLeadAgent is in error state',
    'AdmissionsIntentDetectionAgent is in error state',
    'AdmissionsProactiveOutreachAgent is in error state',
    'AdmissionsSuperAgent is in error state',
    'AdmissionsVisitorActivityAgent is in error state',
    'AgentBehaviorMonitorAgent is in error state',
    'AISafetyMonitorAgent is in error state',
    'AlumniNetworkArchitect is in error state',
    'Analytics Engine department triggered 6 alerts in 24h',
    'CampaignHealthScanner is in error state',
    'Campaign Operations department triggered 6 alerts in 24h',
    'CampaignOpsSuperAgent is in error state',
    'CampaignQAAgent is in error state',
    'CampaignQAAgent is slow (120.1s avg)',
    'CampaignRepairAgent is in error state',
    'CampaignSelfHealingAgent is in error state',
    'CompanyStrategicCycle is in error state',
    'ContentEngineSuperAgent is in error state',
    'Finance department triggered 6 alerts in 24h',
    'FinanceIntelligenceArchitect is in error state',
    'FinanceSuperAgent is in error state',
    'GovernanceStrategyArchitect is in error state',
    'GrowthExperimentArchitect is in error state',
    'InfrastructureEvolutionArchitect is in error state',
    'InsightArchitect is in error state',
    'Lead Intelligence department triggered 6 alerts in 24h',
    'LeadIntelligenceSuperAgent is in error state',
    'LearningInnovationArchitect is in error state',
    'OfferRoutingAgent is in error state',
    'OpenclawBrowserWorkerAgent is in error state',
    'OpenclawContentResponseAgent is in error state',
    'OpenclawConversationDetectionAgent is in error state',
    'OpenclawEngagementMonitorAgent is in error state',
    'OpenclawInfraMonitorAgent is in error state',
    'OpenclawLearningOptimizationAgent has 84% error rate',
    'OpenclawLearningOptimizationAgent is in error state',
    'OpenclawLinkedInCommentMonitorAgent is in error state',
    'OpenclawMarketSignalAgent is in error state',
    'OpenclawQualityGateAgent is in error state',
    'OperationsOptimizationArchitect is in error state',
    'OrchestrationEcosystemArchitect is in error state',
    'OrchestrationHealthAgent is in error state',
    'PartnershipExpansionArchitect is in error state',
    'Partnerships department triggered 7 alerts in 24h',
    'PartnershipSuperAgent is in error state',
    'PlatformInnovationArchitect is in error state',
    'RuntimeThreatMonitorAgent is in error state',
    'SecretDetectionAgent is in error state',
    'SecurityDirectorAgent is in error state',
    'SkoolBrowserWorker is in error state',
    'SkoolContentResponse is in error state',
    'SkoolNotificationResponse is in error state',
    'SkoolSignalDetection is in error state',
    'SkoolSupervisor is in error state',
    'StrategyFuturesArchitect is in error state',
    'StudentSuccessArchitect is in error state',
    'System Resilience department triggered 9 alerts in 24h',
    'WorkforceIntelligence is in error state',
  ];

  const REAL_PRODUCTION_AGENT_HEALTH: Record<string, AgentHealthSnapshot> = {
    AccessControlGuardianAgent: { status: 'idle', enabled: true, run_count: 152, error_count: 1 },
    AdmissionsAssistantAgent: { status: 'idle', enabled: true, run_count: 21171, error_count: 74 },
    AdmissionsCallbackManagementAgent: { status: 'idle', enabled: true, run_count: 42137, error_count: 991 },
    AdmissionsCallComplianceMonitor: { status: 'idle', enabled: true, run_count: 14070, error_count: 179 },
    AdmissionsConversationContinuityAgent: { status: 'idle', enabled: true, run_count: 42210, error_count: 835 },
    AdmissionsConversationMemoryAgent: { status: 'idle', enabled: true, run_count: 7214, error_count: 23 },
    AdmissionsConversationTaskMonitor: { status: 'idle', enabled: true, run_count: 106973, error_count: 605 },
    AdmissionsConversionArchitect: { status: 'idle', enabled: true, run_count: 603, error_count: 2 },
    AdmissionsExecutiveUpdateAgent: { status: 'idle', enabled: true, run_count: 893, error_count: 6 },
    AdmissionsHighIntentLeadAgent: { status: 'idle', enabled: true, run_count: 21629, error_count: 48 },
    AdmissionsIntentDetectionAgent: { status: 'idle', enabled: true, run_count: 20927, error_count: 88 },
    AdmissionsProactiveOutreachAgent: { status: 'idle', enabled: true, run_count: 43212, error_count: 294 },
    AdmissionsSuperAgent: { status: 'idle', enabled: true, run_count: 6672, error_count: 44 },
    AdmissionsVisitorActivityAgent: { status: 'idle', enabled: true, run_count: 21671, error_count: 46 },
    AgentBehaviorMonitorAgent: { status: 'idle', enabled: true, run_count: 21241, error_count: 305 },
    AISafetyMonitorAgent: { status: 'idle', enabled: true, run_count: 42082, error_count: 347 },
    AlumniNetworkArchitect: { status: 'idle', enabled: true, run_count: 603, error_count: 3 },
    CampaignHealthScanner: { status: 'idle', enabled: true, run_count: 14539, error_count: 66 },
    CampaignOpsSuperAgent: { status: 'idle', enabled: true, run_count: 6555, error_count: 37 },
    CampaignQAAgent: { status: 'idle', enabled: true, run_count: 595, error_count: 1 },
    CampaignRepairAgent: { status: 'idle', enabled: true, run_count: 10798, error_count: 42 },
    CampaignSelfHealingAgent: { status: 'idle', enabled: true, run_count: 7215, error_count: 49 },
    CompanyStrategicCycle: { status: 'paused', enabled: false, run_count: 644, error_count: 4 },
    ContentEngineSuperAgent: { status: 'idle', enabled: true, run_count: 6802, error_count: 325 },
    FinanceIntelligenceArchitect: { status: 'idle', enabled: true, run_count: 582, error_count: 3 },
    FinanceSuperAgent: { status: 'idle', enabled: true, run_count: 6834, error_count: 266 },
    GovernanceStrategyArchitect: { status: 'idle', enabled: true, run_count: 586, error_count: 9 },
    GrowthExperimentArchitect: { status: 'idle', enabled: true, run_count: 591, error_count: 2 },
    InfrastructureEvolutionArchitect: { status: 'idle', enabled: true, run_count: 572, error_count: 13 },
    InsightArchitect: { status: 'idle', enabled: true, run_count: 571, error_count: 10 },
    LeadIntelligenceSuperAgent: { status: 'idle', enabled: true, run_count: 6762, error_count: 479 },
    LearningInnovationArchitect: { status: 'idle', enabled: true, run_count: 576, error_count: 2 },
    OfferRoutingAgent: { status: 'idle', enabled: true, run_count: 530, error_count: 3 },
    OpenclawBrowserWorkerAgent: { status: 'idle', enabled: true, run_count: 7088, error_count: 228 },
    OpenclawContentResponseAgent: { status: 'idle', enabled: true, run_count: 7217, error_count: 9 },
    OpenclawConversationDetectionAgent: { status: 'idle', enabled: true, run_count: 7079, error_count: 155 },
    OpenclawEngagementMonitorAgent: { status: 'idle', enabled: true, run_count: 5984, error_count: 73 },
    OpenclawInfraMonitorAgent: { status: 'idle', enabled: true, run_count: 43126, error_count: 364 },
    OpenclawLearningOptimizationAgent: { status: 'idle', enabled: true, run_count: 882, error_count: 736 },
    OpenclawLinkedInCommentMonitorAgent: { status: 'idle', enabled: true, run_count: 287, error_count: 2 },
    OpenclawMarketSignalAgent: { status: 'idle', enabled: true, run_count: 7184, error_count: 20 },
    OpenclawQualityGateAgent: { status: 'idle', enabled: true, run_count: 6195, error_count: 182 },
    OperationsOptimizationArchitect: { status: 'idle', enabled: true, run_count: 593, error_count: 3 },
    OrchestrationEcosystemArchitect: { status: 'idle', enabled: true, run_count: 604, error_count: 1 },
    OrchestrationHealthAgent: { status: 'idle', enabled: true, run_count: 43720, error_count: 291 },
    PartnershipExpansionArchitect: { status: 'idle', enabled: true, run_count: 564, error_count: 2 },
    PartnershipSuperAgent: { status: 'idle', enabled: true, run_count: 6677, error_count: 496 },
    PlatformInnovationArchitect: { status: 'idle', enabled: true, run_count: 570, error_count: 2 },
    RuntimeThreatMonitorAgent: { status: 'idle', enabled: true, run_count: 43009, error_count: 318 },
    SecretDetectionAgent: { status: 'idle', enabled: true, run_count: 896, error_count: 4 },
    SecurityDirectorAgent: { status: 'idle', enabled: true, run_count: 21595, error_count: 36 },
    SkoolBrowserWorker: { status: 'idle', enabled: true, run_count: 7447, error_count: 44 },
    SkoolContentResponse: { status: 'idle', enabled: true, run_count: 7640, error_count: 42 },
    SkoolNotificationResponse: { status: 'idle', enabled: true, run_count: 5143, error_count: 18 },
    SkoolSignalDetection: { status: 'idle', enabled: true, run_count: 4824, error_count: 26 },
    SkoolSupervisor: { status: 'idle', enabled: true, run_count: 30652, error_count: 1197 },
    StrategyFuturesArchitect: { status: 'idle', enabled: true, run_count: 576, error_count: 8 },
    StudentSuccessArchitect: { status: 'idle', enabled: true, run_count: 590, error_count: 4 },
    WorkforceIntelligence: { status: 'idle', enabled: true, run_count: 429, error_count: 3 },
  };

  const REAL_RETIRED_AGENTS: Record<string, string> = {
    StudentProgressMonitor: 'retired 2026-08-15 — nothing consumed its output',
    CompanyStrategicCycle: 'retired 2026-08-15 — duplicate registration; run manually via companyRoutes',
  };

  it('sanity: the fixture itself is really 68 titles and 59 agent snapshots (matches the live counts this test claims to reproduce)', () => {
    expect(REAL_PRODUCTION_TITLES.length).toBe(68);
    expect(Object.keys(REAL_PRODUCTION_AGENT_HEALTH).length).toBe(59);
  });

  it('reproduces the exact 68-row breakdown captured live in execution-contract.md (57/1/7/1/1/1) against the REAL production titles and REAL production ai_agents snapshot, not a proxy', () => {
    const health = healthMap(REAL_PRODUCTION_AGENT_HEALTH);
    const rows = REAL_PRODUCTION_TITLES.map((title, i) => ({ id: `row${i}`, title }));

    const results = rows.map((r) => classifyInitiative(r, health, REAL_RETIRED_AGENTS));
    const counts = results.reduce<Record<string, number>>((acc, r) => {
      acc[r.outcome] = (acc[r.outcome] || 0) + 1;
      return acc;
    }, {});

    expect(counts.healthy_completed).toBe(57);
    expect(counts.retired_completed).toBe(1);
    expect(counts.dept_alert_cancelled).toBe(7);
    expect(counts.still_unhealthy).toBe(1);
    expect(counts.explicitly_excluded).toBe(1);
    expect(counts.ambiguous_skipped).toBe(1);
    expect(rows.length).toBe(68);
    expect(
      (counts.healthy_completed || 0) +
        (counts.retired_completed || 0) +
        (counts.dept_alert_cancelled || 0) +
        (counts.still_unhealthy || 0) +
        (counts.explicitly_excluded || 0) +
        (counts.ambiguous_skipped || 0),
    ).toBe(68);

    // Name the specific rows landing in each untouched category, since those are the
    // ones a bug would most dangerously mis-resolve.
    const stillUnhealthyTitles = results.filter((r) => r.outcome === 'still_unhealthy');
    expect(stillUnhealthyTitles).toHaveLength(1);
    expect(stillUnhealthyTitles[0].agent_name).toBe('OpenclawLearningOptimizationAgent');

    const excludedTitles = rows.filter((_, i) => results[i].outcome === 'explicitly_excluded');
    expect(excludedTitles).toHaveLength(1);
    expect(excludedTitles[0].title).toBe('OpenclawLearningOptimizationAgent has 84% error rate');

    const ambiguousTitles = rows.filter((_, i) => results[i].outcome === 'ambiguous_skipped');
    expect(ambiguousTitles).toHaveLength(1);
    expect(ambiguousTitles[0].title).toBe('CampaignQAAgent is slow (120.1s avg)');

    const retiredResult = results.find((r) => r.outcome === 'retired_completed');
    expect(retiredResult?.agent_name).toBe('CompanyStrategicCycle');
  });
});
