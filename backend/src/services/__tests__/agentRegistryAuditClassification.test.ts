import { classifyAgent, allClassifiedAgentNames } from '../agentRegistryAuditClassification';

describe('classifyAgent', () => {
  it('classifies a no-source-file agent as confirmed_dead, disable: true', () => {
    const result = classifyAgent('Alumni_Outreach_Agent');
    expect(result).toEqual(expect.objectContaining({ status: 'confirmed_dead', disable: true }));
    expect(result?.note).toMatch(/no source file/i);
  });

  it('classifies a Reporting agent as confirmed_dead, disable: true', () => {
    const result = classifyAgent('NarrativeAgent');
    expect(result).toEqual(expect.objectContaining({ status: 'confirmed_dead', disable: true }));
    expect(result?.note).toMatch(/seed file/i);
  });

  it('classifies a Website Intelligence agent as confirmed_dead, disable: true', () => {
    const result = classifyAgent('WebsiteBrokenLinkAgent');
    expect(result).toEqual(expect.objectContaining({ status: 'confirmed_dead', disable: true }));
  });

  it('classifies an Admissions on-demand agent as confirmed_dead, disable: true', () => {
    const result = classifyAgent('AdmissionsCEORecognitionAgent');
    expect(result).toEqual(expect.objectContaining({ status: 'confirmed_dead', disable: true }));
    expect(result?.note).toMatch(/aiOrchestrator-Ali-AI/);
  });

  it('classifies a Meta sub-agent as internal_pipeline_step under MetaAgentLoop, disable: false', () => {
    const result = classifyAgent('ArchitectureAgent');
    expect(result).toEqual(expect.objectContaining({ status: 'internal_pipeline_step', parentAgent: 'MetaAgentLoop', disable: false }));
  });

  it('classifies an Autonomous sub-agent as internal_pipeline_step under AutonomousEngine, disable: false', () => {
    const result = classifyAgent('RootCauseAgent');
    expect(result).toEqual(expect.objectContaining({ status: 'internal_pipeline_step', parentAgent: 'AutonomousEngine', disable: false }));
  });

  it('classifies a Memory cluster agent as internal_pipeline_step, disable: false', () => {
    const result = classifyAgent('MemoryAgent');
    expect(result).toEqual(expect.objectContaining({ status: 'internal_pipeline_step', disable: false }));
  });

  it('classifies a Strategic cluster agent as internal_pipeline_step under AICOOStrategicCycle, disable: false', () => {
    const result = classifyAgent('GovernanceAgent');
    expect(result).toEqual(expect.objectContaining({ status: 'internal_pipeline_step', parentAgent: 'AICOOStrategicCycle', disable: false }));
  });

  it('returns null for an agent this audit did not enumerate (a genuinely live agent)', () => {
    expect(classifyAgent('PromptMonitorAgent')).toBeNull();
    expect(classifyAgent('MetaAgentLoop')).toBeNull(); // the parent itself, not a sub-step
  });

  it('returns null for a name that does not exist at all', () => {
    expect(classifyAgent('TotallyMadeUpAgentName')).toBeNull();
  });
});

describe('allClassifiedAgentNames', () => {
  it('returns exactly 57 confirmed_dead + 20 internal_pipeline_step = 77 names, no duplicates', () => {
    const names = allClassifiedAgentNames();
    expect(names.length).toBe(77);
    expect(new Set(names).size).toBe(77);
  });
});
