/**
 * finalizeGeneratedRequirements — BC #10108536393.
 *
 * These two steps run AFTER the generation job is marked `completed`, and used
 * to be fire-and-forget with a bare console.error. Three failure modes were all
 * invisible while producing the same student-visible symptom (empty task list +
 * Cory reporting "Nothing to execute"). These tests pin that every one of them
 * now leaves a durable, queryable trace on the job row — and that the happy path
 * still writes nothing, so a clean run stays clean.
 */

jest.mock('../../services/requirementsMaterializeService', () => ({
  materializeRequirementsFromDocument: jest.fn(),
}));
jest.mock('../../services/studentTaskService', () => ({
  createTasksFromRequirements: jest.fn(),
}));
jest.mock('../../models/StudentTask', () => ({ count: jest.fn() }));

// Import-time dependency graph of the service under test — stubbed so importing
// it never reaches a real DB/OpenAI client.
jest.mock('../../models/Project', () => ({ findOne: jest.fn(), findByPk: jest.fn() }));
jest.mock('../../models/RequirementsGenerationJob', () => ({ findByPk: jest.fn(), create: jest.fn() }));
jest.mock('../../models', () => ({ ArtifactDefinition: {}, AssignmentSubmission: {} }));
jest.mock('../../services/projectRequirementsContextService', () => ({ buildProjectRequirementsContext: jest.fn() }));
jest.mock('../../services/artifactVersionService', () => ({ createNewVersion: jest.fn() }));
jest.mock('../../services/projectService', () => ({
  attachArtifactToProject: jest.fn(), createProjectForEnrollment: jest.fn(), getProjectByEnrollment: jest.fn(),
}));
jest.mock('../../services/portfolioEnhancementService', () => ({ refreshProjectOutputs: jest.fn() }));
jest.mock('../../services/openaiInstrumented', () => ({ getInstrumentedOpenAI: jest.fn() }));
jest.mock('openai', () => jest.fn().mockImplementation(() => ({})));

import { finalizeGeneratedRequirements, POST_GENERATION_MARKER } from '../../services/requirementsGenerationService';
import { materializeRequirementsFromDocument } from '../../services/requirementsMaterializeService';
import { createTasksFromRequirements } from '../../services/studentTaskService';
import StudentTask from '../../models/StudentTask';

const mockMaterialize = materializeRequirementsFromDocument as jest.Mock;
const mockCreateTasks = createTasksFromRequirements as jest.Mock;
const mockTaskCount = (StudentTask as any).count as jest.Mock;

const PROJECT_ID = 'project-uuid-001';
const DOCUMENT = 'x'.repeat(5000);

function makeJob() {
  return { id: 'job-uuid-001', update: jest.fn().mockResolvedValue(undefined) } as any;
}

/** The message written to error_message, or null when nothing was recorded. */
function recordedMessage(job: any): string | null {
  const call = job.update.mock.calls.find((c: any[]) => c[0] && 'error_message' in c[0]);
  return call ? call[0].error_message : null;
}

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(console, 'log').mockImplementation(() => {});
  jest.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('finalizeGeneratedRequirements', () => {
  it('happy path: materializes, seeds tasks, and records nothing on the job', async () => {
    mockMaterialize.mockResolvedValue(8);
    mockCreateTasks.mockResolvedValue(undefined);
    mockTaskCount.mockResolvedValue(8);
    const job = makeJob();

    await finalizeGeneratedRequirements(job, PROJECT_ID, DOCUMENT);

    expect(mockMaterialize).toHaveBeenCalledWith(PROJECT_ID, DOCUMENT);
    expect(mockCreateTasks).toHaveBeenCalledWith(PROJECT_ID);
    // A clean run must not write a diagnostic — error_message stays empty.
    expect(recordedMessage(job)).toBeNull();
  });

  it('mode 1 — materialization throws: records the failure and stops before seeding', async () => {
    mockMaterialize.mockRejectedValue(new Error('parser exploded'));
    const job = makeJob();

    await finalizeGeneratedRequirements(job, PROJECT_ID, DOCUMENT);

    expect(mockCreateTasks).not.toHaveBeenCalled();
    const msg = recordedMessage(job);
    expect(msg).toContain(POST_GENERATION_MARKER);
    expect(msg).toContain('parser exploded');
  });

  it('mode 2 — materialization yields 0 requirements: records it even though nothing threw', async () => {
    mockMaterialize.mockResolvedValue(0);
    const job = makeJob();

    await finalizeGeneratedRequirements(job, PROJECT_ID, DOCUMENT);

    // This is the mode that raised no error at all before this change.
    expect(mockCreateTasks).not.toHaveBeenCalled();
    const msg = recordedMessage(job);
    expect(msg).toContain(POST_GENERATION_MARKER);
    expect(msg).toContain('0 requirements');
  });

  it('mode 3 — seeding no-ops silently (0 tasks): records it despite no throw', async () => {
    mockMaterialize.mockResolvedValue(8);
    mockCreateTasks.mockResolvedValue(undefined); // returns void, no throw
    mockTaskCount.mockResolvedValue(0);
    const job = makeJob();

    await finalizeGeneratedRequirements(job, PROJECT_ID, DOCUMENT);

    const msg = recordedMessage(job);
    expect(msg).toContain(POST_GENERATION_MARKER);
    expect(msg).toContain('0 tasks');
  });

  it('seeding throws: records the failure and notes requirements did materialize', async () => {
    mockMaterialize.mockResolvedValue(8);
    mockCreateTasks.mockRejectedValue(new Error('task seed failed'));
    const job = makeJob();

    await finalizeGeneratedRequirements(job, PROJECT_ID, DOCUMENT);

    const msg = recordedMessage(job);
    expect(msg).toContain(POST_GENERATION_MARKER);
    expect(msg).toContain('task seed failed');
    expect(msg).toContain('8');
  });

  it('never throws when the diagnostic write itself fails (telemetry must not break the caller)', async () => {
    mockMaterialize.mockRejectedValue(new Error('parser exploded'));
    const job = makeJob();
    job.update.mockRejectedValue(new Error('DB unavailable'));

    await expect(finalizeGeneratedRequirements(job, PROJECT_ID, DOCUMENT)).resolves.toBeUndefined();
  });

  it('boundary: a task-count read failure does not by itself flag an otherwise-successful run', async () => {
    mockMaterialize.mockResolvedValue(8);
    mockCreateTasks.mockResolvedValue(undefined);
    mockTaskCount.mockRejectedValue(new Error('count unavailable'));
    const job = makeJob();

    await finalizeGeneratedRequirements(job, PROJECT_ID, DOCUMENT);

    // taskCount stays null (not 0), so this must not be misreported as "0 tasks".
    expect(recordedMessage(job)).toBeNull();
  });
});
