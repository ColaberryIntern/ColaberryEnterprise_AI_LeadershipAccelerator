import axios from 'axios';
import { syncUserProgress, getUserProgress } from '../skilljarSyncService';
import StudentSkilljarProgress from '../../models/StudentSkilljarProgress';

jest.mock('axios');
// Auto-mock the model. Jest still runs the module once to discover its shape, so
// env.ts must supply a valid databaseUrl string (below) to let Sequelize construct.
jest.mock('../../models/StudentSkilljarProgress');
jest.mock('../../config/env', () => ({
  env: {
    skilljarApiKey: 'test-key',
    skilljarBaseUrl: 'https://api.skilljar.com/v1',
    nodeEnv: 'test',
    // Required so Sequelize can construct when Jest introspects StudentSkilljarProgress.
    databaseUrl: 'postgres://accelerator:accelerator@localhost:5432/accelerator_dev',
  },
}));

const mockedAxios = axios as jest.Mocked<typeof axios>;
const MockedProgress = StudentSkilljarProgress as jest.Mocked<typeof StudentSkilljarProgress>;

const MOCK_USER = { id: 'sj-user-1', email: 'kes@test.com', first_name: 'Kes', last_name: 'Test' };
const MOCK_PROGRESS = [
  {
    user_id: 'sj-user-1',
    course_id: 'c1',
    course_title: 'Claude Code 101',
    course_url: 'https://anthropic.skilljar.com/claude-code-101',
    percent_complete: 100,
    is_complete: true,
    date_completed: '2026-06-20T10:00:00Z',
  },
  {
    user_id: 'sj-user-1',
    course_id: 'c2',
    course_title: 'Claude Code in Action',
    course_url: 'https://anthropic.skilljar.com/claude-code-in-action',
    percent_complete: 50,
    is_complete: false,
    date_completed: null,
  },
  // Course NOT in our tracked list — should be filtered out
  {
    user_id: 'sj-user-1',
    course_id: 'c99',
    course_title: 'Unrelated Course',
    course_url: 'https://anthropic.skilljar.com/some-other-course',
    percent_complete: 80,
    is_complete: false,
    date_completed: null,
  },
];

describe('skilljarSyncService', () => {
  let mockAxiosInstance: any;

  beforeEach(() => {
    jest.clearAllMocks();
    mockAxiosInstance = { get: jest.fn() };
    mockedAxios.create = jest.fn().mockReturnValue(mockAxiosInstance);
    MockedProgress.upsert = jest.fn().mockResolvedValue([{} as any, true]);
  });

  function setupHappyPath() {
    mockAxiosInstance.get
      .mockResolvedValueOnce({ data: { results: [MOCK_USER], next: null } })
      .mockResolvedValueOnce({ data: { results: MOCK_PROGRESS, next: null } });
  }

  describe('syncUserProgress', () => {
    it('happy path: syncs only the 2 tracked courses, returns correct counts', async () => {
      setupHappyPath();
      const result = await syncUserProgress('kes@test.com');

      expect(result.email).toBe('kes@test.com');
      expect(result.skilljar_user_id).toBe('sj-user-1');
      expect(result.courses_synced).toBe(2);
      expect(result.courses_completed).toBe(1);
      expect(result.error).toBeNull();
    });

    it('filters out courses not in TRACKED_COURSE_URLS', async () => {
      setupHappyPath();
      await syncUserProgress('kes@test.com');

      const upsertCalls = (MockedProgress.upsert as jest.Mock).mock.calls;
      expect(upsertCalls).toHaveLength(2);
      const upsertedUrls = upsertCalls.map((c: any[]) => c[0].course_url);
      expect(upsertedUrls).not.toContain('https://anthropic.skilljar.com/some-other-course');
    });

    it('idempotent: calling twice with same inputs results in upserts, not duplicate rows', async () => {
      setupHappyPath();
      setupHappyPath();

      await syncUserProgress('kes@test.com');
      await syncUserProgress('kes@test.com');

      // upsert is the idempotency mechanism — 2 calls × 2 courses = 4 upserts, no inserts
      expect(MockedProgress.upsert).toHaveBeenCalledTimes(4);
    });

    it('returns user_not_found gracefully when email has no Skilljar account', async () => {
      mockAxiosInstance.get.mockResolvedValueOnce({ data: { results: [], next: null } });

      const result = await syncUserProgress('nobody@test.com');

      expect(result.skilljar_user_id).toBeNull();
      expect(result.courses_synced).toBe(0);
      expect(result.error).toBeNull();
      expect(MockedProgress.upsert).not.toHaveBeenCalled();
    });

    it('returns TimeoutError when Skilljar API times out', async () => {
      const apiError = new Error('timeout of 15000ms exceeded');
      mockAxiosInstance.get.mockRejectedValueOnce(apiError);

      const result = await syncUserProgress('kes@test.com');

      expect(result.error).toBe('TimeoutError');
      expect(result.courses_synced).toBe(0);
      expect(MockedProgress.upsert).not.toHaveBeenCalled();
    });

    it('returns AuthError message when SKILLJAR_API_KEY is missing', async () => {
      jest.resetModules();
      jest.doMock('../../config/env', () => ({
        env: {
          skilljarApiKey: '',
          skilljarBaseUrl: 'https://api.skilljar.com/v1',
          nodeEnv: 'test',
          databaseUrl: 'postgres://accelerator:accelerator@localhost:5432/accelerator_dev',
        },
      }));
      const { syncUserProgress: syncNoKey } = await import('../skilljarSyncService');

      const result = await syncNoKey('kes@test.com');
      expect(result.error).toContain('SKILLJAR_API_KEY not set');
    });
  });

  describe('getUserProgress', () => {
    it('returns mapped progress rows from DB', async () => {
      MockedProgress.findAll = jest.fn().mockResolvedValue([
        {
          course_url: 'https://anthropic.skilljar.com/claude-code-101',
          course_title: 'Claude Code 101',
          percent_complete: 100,
          completed: true,
          completed_at: new Date('2026-06-20'),
          last_synced_at: new Date('2026-06-25'),
        },
      ] as any);

      const rows = await getUserProgress('kes@test.com');

      expect(rows).toHaveLength(1);
      expect(rows[0].completed).toBe(true);
      expect(rows[0].percent_complete).toBe(100);
    });

    it('returns empty array when DB query fails (fail-soft)', async () => {
      MockedProgress.findAll = jest.fn().mockRejectedValue(new Error('DB down'));

      const rows = await getUserProgress('kes@test.com');
      expect(rows).toEqual([]);
    });
  });
});
