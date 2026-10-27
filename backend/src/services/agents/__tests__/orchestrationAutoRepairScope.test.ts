/**
 * The auto-repair agent must not repair more than it was asked to, or more often than allowed.
 *
 * Two of Quincy's 2026-10-26 findings, both about a repair exceeding its authorization:
 *
 *   - `config.max_repairs_per_run || 10` treated a configured 0 as absent, so the one setting an
 *     operator would use to stop the writes while keeping the scanning gave it the default
 *     budget of ten instead
 *   - promptMonitorAgent flags broken prompt links on ACTIVE mini-sections only, but the repair
 *     cleared the link on every mini-section carrying it, so one flagged active lesson licensed
 *     writes across any number of unflagged inactive ones
 *
 * Mutations that kill a NAMED test:
 *   - restore `config.max_repairs_per_run || 10` and "a configured limit of 0 means no repairs"
 *     fails
 *   - drop `is_active: true` from the MiniSection lookup and "repairs only what the monitor can
 *     flag" fails
 */
jest.mock('../../../models', () => ({
  MiniSection: { findAll: jest.fn() },
  PromptTemplate: { findByPk: jest.fn() },
  ArtifactDefinition: { findAll: jest.fn() },
  AiSystemEvent: { findAll: jest.fn() },
}));
jest.mock('../../aiEventService', () => ({
  logAgentActivity: jest.fn(),
  logAiEvent: jest.fn(),
}));

import { MiniSection, PromptTemplate, AiSystemEvent } from '../../../models';
import { runOrchestrationAutoRepairAgent } from '../orchestrationAutoRepairAgent';

const mockFindings = AiSystemEvent.findAll as unknown as jest.Mock;
const mockMiniSections = MiniSection.findAll as unknown as jest.Mock;
const mockPrompt = PromptTemplate.findByPk as unknown as jest.Mock;

const AGENT_ID = 'agent-row-uuid';
const BROKEN_PROMPT = 'prompt-uuid-broken';

/** One `broken_prompt_fk` finding, the shape the prompt monitor logs. */
const brokenFkFinding = () => ({
  event_type: 'broken_prompt_fk',
  entity_id: BROKEN_PROMPT,
  details: { broken_prompt_id: BROKEN_PROMPT, fk_field: 'concept_prompt_template_id' },
});

/** One `inactive_prompt_referenced` finding. */
const inactivePromptFinding = () => ({
  event_type: 'inactive_prompt_referenced',
  entity_id: 'prompt-uuid-inactive',
  details: { prompt_id: 'prompt-uuid-inactive' },
});

const miniSection = (id: string) => ({
  id,
  title: `lesson ${id}`,
  update: jest.fn().mockResolvedValue({}),
});

beforeEach(() => {
  jest.clearAllMocks();
  mockMiniSections.mockResolvedValue([]);
  mockPrompt.mockResolvedValue(null);
});

describe('the repair budget', () => {
  it('a configured limit of 0 means no repairs', async () => {
    mockFindings.mockResolvedValue([brokenFkFinding()]);
    const rows = [miniSection('ms-1'), miniSection('ms-2')];
    mockMiniSections.mockResolvedValue(rows);

    const result = await runOrchestrationAutoRepairAgent(AGENT_ID, { max_repairs_per_run: 0 });

    expect(result.actions_taken).toHaveLength(0);
    for (const row of rows) expect(row.update).not.toHaveBeenCalled();
  });

  it('an absent limit still means the default of ten', async () => {
    // The fix must not turn "unset" into "off", which would silently stop every repair.
    mockFindings.mockResolvedValue([brokenFkFinding()]);
    const rows = Array.from({ length: 12 }, (_, i) => miniSection(`ms-${i}`));
    mockMiniSections.mockResolvedValue(rows);

    const result = await runOrchestrationAutoRepairAgent(AGENT_ID, {});

    expect(result.actions_taken).toHaveLength(10);
  });

  it('a nonsense limit falls back to the default rather than to zero', async () => {
    mockFindings.mockResolvedValue([brokenFkFinding()]);
    mockMiniSections.mockResolvedValue(Array.from({ length: 12 }, (_, i) => miniSection(`ms-${i}`)));

    const result = await runOrchestrationAutoRepairAgent(AGENT_ID, { max_repairs_per_run: 'lots' });

    expect(result.actions_taken).toHaveLength(10);
  });

  it('honors a limit between zero and the default', async () => {
    mockFindings.mockResolvedValue([brokenFkFinding()]);
    mockMiniSections.mockResolvedValue(Array.from({ length: 12 }, (_, i) => miniSection(`ms-${i}`)));

    const result = await runOrchestrationAutoRepairAgent(AGENT_ID, { max_repairs_per_run: 3 });

    expect(result.actions_taken).toHaveLength(3);
  });
});

describe('the repair scope', () => {
  it('repairs only what the monitor can flag', async () => {
    mockFindings.mockResolvedValue([brokenFkFinding()]);
    mockMiniSections.mockResolvedValue([miniSection('ms-1')]);

    await runOrchestrationAutoRepairAgent(AGENT_ID, {});

    // The filter, not the count, is the assertion: the monitor only looks at active lessons
    // (promptMonitorAgent uses `is_active: true`), so a repair that looks wider than that is
    // writing to rows no finding covered.
    expect(mockMiniSections).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ is_active: true, concept_prompt_template_id: BROKEN_PROMPT }),
    }));
  });

  it('refuses an FK field that is not on the allowlist', async () => {
    mockFindings.mockResolvedValue([{
      event_type: 'broken_prompt_fk',
      entity_id: BROKEN_PROMPT,
      details: { broken_prompt_id: BROKEN_PROMPT, fk_field: 'created_by' },
    }]);

    const result = await runOrchestrationAutoRepairAgent(AGENT_ID, {});

    expect(result.actions_taken).toHaveLength(0);
    expect(mockMiniSections).not.toHaveBeenCalled();
  });

  it('leaves an already-active prompt alone', async () => {
    // Idempotency: the second run over the same finding must change nothing.
    mockFindings.mockResolvedValue([inactivePromptFinding()]);
    const prompt = { is_active: true, name: 'a prompt', update: jest.fn() };
    mockPrompt.mockResolvedValue(prompt);

    const result = await runOrchestrationAutoRepairAgent(AGENT_ID, {});

    expect(prompt.update).not.toHaveBeenCalled();
    expect(result.actions_taken).toHaveLength(0);
  });

  it('logs the repair under the action name the dashboard counts', async () => {
    const { isRepairAction } = await import('../repairActions');
    mockFindings.mockResolvedValue([brokenFkFinding()]);
    mockMiniSections.mockResolvedValue([miniSection('ms-1')]);

    const result = await runOrchestrationAutoRepairAgent(AGENT_ID, {});

    expect(result.actions_taken).toHaveLength(1);
    expect(isRepairAction(result.actions_taken[0].action)).toBe(true);
  });
});
