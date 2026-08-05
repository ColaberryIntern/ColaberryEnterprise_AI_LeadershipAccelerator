import { sequelize } from '../../../config/database';
import { getLifecycleMode } from '../capeLifecycleModeService';
import { listPersonas, lookupEnrollment, ALL_PERSONA_SLUGS } from '../capeGovernancePersonaService';

jest.mock('../../../config/database', () => ({ sequelize: { query: jest.fn() } }));
jest.mock('../capeLifecycleModeService', () => ({ getLifecycleMode: jest.fn() }));

const mockQuery = sequelize.query as unknown as jest.Mock;
const mockGetLifecycleMode = getLifecycleMode as unknown as jest.Mock;

beforeEach(() => {
  jest.clearAllMocks();
});

describe('listPersonas', () => {
  it('happy path: 5 distinct candidates classify into all 5 personas, each with real enrollment_id/email', async () => {
    mockQuery.mockResolvedValue([
      { id: 'e-foundation', email: 'a@x.com' },
      { id: 'e-cold-start', email: 'b@x.com' },
      { id: 'e-builder', email: 'c@x.com' },
      { id: 'e-returning', email: 'd@x.com' },
      { id: 'e-architect', email: 'e@x.com' },
    ]);
    mockGetLifecycleMode.mockImplementation(async (enrollmentId: string) => {
      const modeByEnrollment: Record<string, string> = {
        'e-foundation': 'foundation', 'e-cold-start': 'experienced_cold_start', 'e-builder': 'active_builder',
        'e-returning': 'returning_after_absence', 'e-architect': 'architect_track',
      };
      return { mode: modeByEnrollment[enrollmentId], days_since_last_activity: null, reasoning: 'x' };
    });

    const result = await listPersonas();
    expect(result).toHaveLength(5);
    for (const slug of ALL_PERSONA_SLUGS) {
      const match = result.find((r) => r.persona === slug)!;
      expect(match.enrollment_id).not.toBeNull();
      expect(match.note).toBeNull();
    }
    expect(result.find((r) => r.persona === 'new_no_resume')?.enrollment_id).toBe('e-foundation');
    expect(result.find((r) => r.persona === 'near_architect_learner')?.enrollment_id).toBe('e-architect');
  });

  it('never fabricates: a persona with no matching candidate returns enrollment_id:null + an honest note, while others still resolve', async () => {
    mockQuery.mockResolvedValue([{ id: 'e-1', email: 'a@x.com' }]);
    mockGetLifecycleMode.mockResolvedValue({ mode: 'foundation', days_since_last_activity: null, reasoning: 'x' });

    const result = await listPersonas();
    const foundation = result.find((r) => r.persona === 'new_no_resume')!;
    expect(foundation.enrollment_id).toBe('e-1');

    const architect = result.find((r) => r.persona === 'near_architect_learner')!;
    expect(architect.enrollment_id).toBeNull();
    expect(architect.note).toMatch(/no matching account found/i);
  });

  it('degrades honestly with zero candidates: all 5 personas return null + note, never a throw', async () => {
    mockQuery.mockResolvedValue([]);
    const result = await listPersonas();
    expect(result).toHaveLength(5);
    expect(result.every((r) => r.enrollment_id === null)).toBe(true);
    expect(result.every((r) => typeof r.note === 'string')).toBe(true);
    expect(mockGetLifecycleMode).not.toHaveBeenCalled();
  });

  it('fail-soft: a classification failure for one candidate is skipped, does not abort the whole scan', async () => {
    mockQuery.mockResolvedValue([
      { id: 'e-broken', email: 'broken@x.com' },
      { id: 'e-ok', email: 'ok@x.com' },
    ]);
    mockGetLifecycleMode.mockImplementation(async (enrollmentId: string) => {
      if (enrollmentId === 'e-broken') throw new Error('ledger unavailable');
      return { mode: 'foundation', days_since_last_activity: null, reasoning: 'x' };
    });

    const result = await listPersonas();
    const foundation = result.find((r) => r.persona === 'new_no_resume')!;
    expect(foundation.enrollment_id).toBe('e-ok');
  });

  it('fail-soft: a candidate-scan query failure returns all personas as no-match, never throws', async () => {
    mockQuery.mockRejectedValue(new Error('db unavailable'));
    const result = await listPersonas();
    expect(result).toHaveLength(5);
    expect(result.every((r) => r.enrollment_id === null)).toBe(true);
  });

  it('scan is bounded (LIMIT parameter present, not an unbounded full-table scan)', async () => {
    mockQuery.mockResolvedValue([]);
    await listPersonas();
    expect(mockQuery).toHaveBeenCalledWith(
      expect.stringContaining('LIMIT :limit'),
      expect.objectContaining({ replacements: { limit: expect.any(Number) } }),
    );
  });
});

describe('lookupEnrollment', () => {
  it('happy path: a UUID query looks up by id', async () => {
    const uuid = '123e4567-e89b-12d3-a456-426614174000';
    mockQuery.mockResolvedValue([{ enrollment_id: uuid, email: 'a@x.com' }]);
    const result = await lookupEnrollment(uuid);
    expect(result).toEqual({ enrollment_id: uuid, email: 'a@x.com' });
    expect(mockQuery).toHaveBeenCalledWith(expect.stringContaining('WHERE id = :q'), expect.anything());
  });

  it('happy path: a non-UUID query looks up by email (ILIKE)', async () => {
    mockQuery.mockResolvedValue([{ enrollment_id: 'e-1', email: 'student@example.com' }]);
    const result = await lookupEnrollment('student@example.com');
    expect(result).toEqual({ enrollment_id: 'e-1', email: 'student@example.com' });
    expect(mockQuery).toHaveBeenCalledWith(expect.stringContaining('WHERE email ILIKE :q'), expect.anything());
  });

  it('security: an injection-attempt string is passed as a parameterized replacement, never string-concatenated into the SQL', async () => {
    mockQuery.mockResolvedValue([]);
    const injection = "'; DROP TABLE enrollments; --";
    await lookupEnrollment(injection);
    // The SQL template itself must never contain the raw injected string —
    // it must only appear inside the `replacements` object, which Sequelize
    // parameterizes safely.
    const [sql, options] = mockQuery.mock.calls[0];
    expect(String(sql)).not.toContain('DROP TABLE');
    expect(options.replacements.q).toBe(injection);
  });

  it('boundary: an empty/whitespace-only query returns null without querying the DB', async () => {
    const result = await lookupEnrollment('   ');
    expect(result).toBeNull();
    expect(mockQuery).not.toHaveBeenCalled();
  });

  it('failure path: no match returns null, not a throw', async () => {
    mockQuery.mockResolvedValue([]);
    const result = await lookupEnrollment('nobody@example.com');
    expect(result).toBeNull();
  });

  it('failure path: a DB error returns null (fail-soft), not a throw', async () => {
    mockQuery.mockRejectedValue(new Error('db unavailable'));
    const result = await lookupEnrollment('someone@example.com');
    expect(result).toBeNull();
  });
});
