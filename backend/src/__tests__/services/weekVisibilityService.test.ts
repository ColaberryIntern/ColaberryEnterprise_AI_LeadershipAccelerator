/**
 * Week visibility service unit tests — BC #9985688999 (Classroom Week View)
 *
 * Tests:
 *   1. initWeekVisibility() — idempotency (safe to call twice)
 *   2. getWeekVisibility() — returns correct map
 *   3. revealNextActivity() — reveals correct next item; no-op if already visible
 */

const mockFindOrCreate = jest.fn();
const mockFindAll = jest.fn();
const mockUpdate = jest.fn();
const mockCourseLinkFindOne = jest.fn();

jest.mock('../../config/database', () => ({
  sequelize: { authenticate: jest.fn(), close: jest.fn(), query: jest.fn(), define: jest.fn() },
  connectDatabase: jest.fn(),
}));

jest.mock('../../models/WeekItemVisibility', () => ({
  __esModule: true,
  default: {
    findOrCreate: mockFindOrCreate,
    findAll: mockFindAll,
  },
  ACTIVITY_SEQUENCE: ['warm_up', 'lab', 'video_critique', 'post_quiz', 'mock_interview'],
}));

jest.mock('../../models/CurriculumCourseLink', () => ({
  __esModule: true,
  default: { findOne: mockCourseLinkFindOne },
}));

import { initWeekVisibility, getWeekVisibility, revealNextActivity } from '../../services/weekVisibilityService';

beforeEach(() => jest.clearAllMocks());

/* ─── initWeekVisibility ─────────────────────────────────────────────────── */

describe('initWeekVisibility', () => {
  it('calls findOrCreate for each of the 5 activity types', async () => {
    mockFindOrCreate.mockResolvedValue([{}, true]);
    await initWeekVisibility('enrollment-1', 1);
    expect(mockFindOrCreate).toHaveBeenCalledTimes(5);
  });

  it('seeds warm_up as visible and all others as hidden', async () => {
    mockFindOrCreate.mockResolvedValue([{}, true]);
    await initWeekVisibility('enrollment-1', 1);

    const warmUpCall = mockFindOrCreate.mock.calls.find(
      (call) => call[0]?.where?.item_type === 'warm_up'
    );
    expect(warmUpCall?.[0]?.defaults?.visible).toBe(true);

    const labCall = mockFindOrCreate.mock.calls.find(
      (call) => call[0]?.where?.item_type === 'lab'
    );
    expect(labCall?.[0]?.defaults?.visible).toBe(false);
  });

  it('is idempotent — calling twice does not throw', async () => {
    mockFindOrCreate.mockResolvedValue([{}, false]); // second call returns existing
    await initWeekVisibility('enrollment-1', 1);
    await initWeekVisibility('enrollment-1', 1);
    expect(mockFindOrCreate).toHaveBeenCalledTimes(10); // 5 per call
  });
});

/* ─── getWeekVisibility ─────────────────────────────────────────────────── */

describe('getWeekVisibility', () => {
  it('returns a map with correct visibility states', async () => {
    mockFindAll.mockResolvedValue([
      { item_type: 'warm_up', visible: true, revealed_at: new Date('2026-07-03') },
      { item_type: 'lab', visible: false, revealed_at: null },
    ]);

    const map = await getWeekVisibility('enrollment-1', 1);

    expect(map['warm_up'].visible).toBe(true);
    expect(map['lab'].visible).toBe(false);
    expect(map['video_critique'].visible).toBe(false); // default for missing rows
  });

  it('fills in false for any item not yet in the DB', async () => {
    mockFindAll.mockResolvedValue([]); // no rows yet
    const map = await getWeekVisibility('enrollment-1', 1);
    expect(Object.values(map).every((v) => !v.visible)).toBe(true);
  });
});

/* ─── revealNextActivity ─────────────────────────────────────────────────── */

describe('revealNextActivity', () => {
  beforeEach(() => {
    // getWeekVisibility (findAll) returns all hidden except warm_up
    mockFindAll.mockResolvedValue([
      { item_type: 'warm_up', visible: true, revealed_at: new Date() },
      { item_type: 'lab', visible: false, revealed_at: null },
      { item_type: 'video_critique', visible: false, revealed_at: null },
      { item_type: 'post_quiz', visible: false, revealed_at: null },
      { item_type: 'mock_interview', visible: false, revealed_at: null },
    ]);
  });

  it('reveals lab after warm_up is completed', async () => {
    const fakeRow = { visible: false, update: mockUpdate };
    mockFindOrCreate.mockResolvedValue([fakeRow, false]);

    const result = await revealNextActivity('enrollment-1', 1, 'warm_up');

    expect(result.revealed).toBe('lab');
    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ visible: true })
    );
  });

  it('returns null revealed when mock_interview (last item) is completed', async () => {
    mockFindOrCreate.mockResolvedValue([{ visible: true, update: jest.fn() }, false]);
    const result = await revealNextActivity('enrollment-1', 1, 'mock_interview');
    expect(result.revealed).toBeNull();
  });

  it('does not call update when next item is already visible (idempotent)', async () => {
    const alreadyVisible = { visible: true, update: mockUpdate };
    mockFindOrCreate.mockResolvedValue([alreadyVisible, false]);

    await revealNextActivity('enrollment-1', 1, 'warm_up');

    expect(mockUpdate).not.toHaveBeenCalled();
  });
});
