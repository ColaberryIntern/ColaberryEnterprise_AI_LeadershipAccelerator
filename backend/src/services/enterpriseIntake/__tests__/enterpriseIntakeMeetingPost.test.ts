const mockEnv: Record<string, unknown> = { enterpriseIntakeBcProjectId: '47502609' };
const mockFindByPk = jest.fn();
const mockFindAll = jest.fn();
const mockUpdate = jest.fn();
const mockPost = jest.fn();
const mockTick = jest.fn();

jest.mock('../../../config/env', () => ({ env: mockEnv }));
jest.mock('../../../models/EnterpriseIntake', () => ({
  __esModule: true,
  default: { findByPk: (...a: any[]) => mockFindByPk(...a), findAll: (...a: any[]) => mockFindAll(...a), update: (...a: any[]) => mockUpdate(...a) },
}));
jest.mock('../../ops/basecampClient', () => ({ bcPost: (...a: any[]) => mockPost(...a) }));
jest.mock('../enterpriseIntakeBasecamp', () => ({
  esc: (v: unknown) => String(v ?? '').replace(/</g, '&lt;'),
  intakeBasecampEnabled: () => Boolean(mockEnv.enterpriseIntakeBcProjectId),
  tickStep: (...a: any[]) => mockTick(...a),
}));

import { MAX_MEETING_POST_ATTEMPTS, meetingCommentHtml, postMeetingToList, syncMeetingPosts } from '../enterpriseIntakeMeetingPost';

const row = (over: Record<string, any> = {}): any => ({
  id: 'i-1', bc_todolist_id: '999', bc_checklist_ready_at: new Date(), meeting_start: new Date('2026-11-23T15:00:00Z'),
  meeting_link: 'https://meet.google.com/abc', interviewed_at: null, interview_mode: 'later', interview_scheduled_for: new Date('2026-11-22T20:00:00Z'),
  bc_meeting_posted_at: null, bc_meeting_attempts: 0, ...over,
});

beforeEach(() => {
  jest.clearAllMocks();
  mockEnv.enterpriseIntakeBcProjectId = '47502609';
  mockUpdate.mockResolvedValue([1]);
  mockPost.mockResolvedValue({ id: 1 });
  mockTick.mockResolvedValue(true);
  jest.spyOn(console, 'log').mockImplementation(() => undefined);
  jest.spyOn(console, 'error').mockImplementation(() => undefined);
});

describe('meeting on the Basecamp list', () => {
  it('says the time in Central, the Meet link and the interview state', () => {
    const h = meetingCommentHtml(row());
    expect(h).toContain('Monday, November 23 at 9:00 AM Central');
    expect(h).toContain('https://meet.google.com/abc');
    expect(h).toContain('scheduled for Sunday, November 22 at 2:00 PM Central');
  });

  it('posts once and ticks "Book the scoping meeting"', async () => {
    mockFindByPk.mockResolvedValue(row());
    expect(await postMeetingToList('i-1')).toBe('posted');
    expect(mockPost).toHaveBeenCalledWith('/buckets/47502609/recordings/999/comments.json', { content: expect.stringContaining('Meeting with Ali booked') });
    expect(mockTick).toHaveBeenCalledWith('47502609', '999', 'meeting');
    mockFindByPk.mockResolvedValue(row({ bc_meeting_posted_at: new Date() }));
    expect(await postMeetingToList('i-1')).toBe('done');
    expect(mockPost).toHaveBeenCalledTimes(1);
  });

  it('a lost claim posts nothing; not ready without a list or meeting; off without a project', async () => {
    mockFindByPk.mockResolvedValue(row());
    mockUpdate.mockResolvedValueOnce([0]);
    expect(await postMeetingToList('i-1')).toBe('done');
    mockFindByPk.mockResolvedValue(row({ bc_todolist_id: null }));
    expect(await postMeetingToList('i-1')).toBe('not_ready');
    mockEnv.enterpriseIntakeBcProjectId = '';
    expect(await postMeetingToList('i-1')).toBe('off');
    expect(mockPost).not.toHaveBeenCalled();
  });

  it(`a failure releases the claim; attempt ${MAX_MEETING_POST_ATTEMPTS} is dead-lettered`, async () => {
    mockPost.mockRejectedValue(new Error('BC 500'));
    mockFindByPk.mockResolvedValue(row());
    expect(await postMeetingToList('i-1')).toBe('failed');
    expect(mockUpdate).toHaveBeenLastCalledWith({ bc_meeting_posted_at: null }, { where: { id: 'i-1' } });
    mockFindByPk.mockResolvedValue(row({ bc_meeting_attempts: MAX_MEETING_POST_ATTEMPTS - 1 }));
    await postMeetingToList('i-1');
    expect((console.error as jest.Mock).mock.calls.some((c) => String(c[0]).includes('enterprise_intake_dead_letter'))).toBe(true);
    mockFindByPk.mockResolvedValue(row({ bc_meeting_attempts: MAX_MEETING_POST_ATTEMPTS }));
    mockPost.mockClear();
    expect(await postMeetingToList('i-1')).toBe('done');
    expect(mockPost).not.toHaveBeenCalled();
  });

  it('a failed tick is logged, the post still counts', async () => {
    mockTick.mockRejectedValue(new Error('tick'));
    mockFindByPk.mockResolvedValue(row());
    expect(await postMeetingToList('i-1')).toBe('posted');
    expect((console.error as jest.Mock).mock.calls.some((c) => String(c[0]).includes('enterprise_meeting_tick_failed'))).toBe(true);
  });

  it('the sweep posts what is due', async () => {
    mockFindAll.mockResolvedValue([{ id: 'i-1' }]);
    mockFindByPk.mockResolvedValue(row());
    expect(await syncMeetingPosts()).toEqual({ posted: 1, failed: 0 });
  });
});
