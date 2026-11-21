import express from 'express';
import request from 'supertest';

const mockFindIntake = jest.fn();
const mockStore = jest.fn();
const mockSoon = jest.fn();

jest.mock('../../services/enterpriseIntake/enterpriseIntakeService', () => ({ findIntake: (t: string) => mockFindIntake(t) }));
jest.mock('../../services/enterpriseIntake/enterpriseIntakeSchedule', () => ({
  ScheduleRefused: class extends Error {},
  CalendarUnavailable: class extends Error {},
  interviewPlanSchema: {},
  meetingSchema: {},
  bookMeeting: jest.fn(),
  setInterviewPlan: jest.fn(),
  listMeetingSlots: jest.fn(),
}));
jest.mock('../../services/enterpriseIntake/enterpriseIntakeFiles', () => {
  class ClientFileRefused extends Error { constructor(public code: string, m: string, public http = 400) { super(m); } }
  return { ClientFileRefused, storeClientFile: (...a: any[]) => mockStore(...a), postFilesSoon: (id: string) => mockSoon(id) };
});

import { handleUploadClientFile } from '../enterpriseIntakeScheduleController';
import { ClientFileRefused } from '../../services/enterpriseIntake/enterpriseIntakeFiles';
import { CLIENT_FILE_MAX_BYTES } from '../../config/enterpriseIntakeUpload';

const app = express();
app.post('/api/enterprise/intake/:token/files', handleUploadClientFile);
const TOKEN = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
const url = `/api/enterprise/intake/${TOKEN}/files`;

beforeEach(() => {
  jest.clearAllMocks();
  mockFindIntake.mockResolvedValue({ id: TOKEN });
  mockStore.mockResolvedValue([{ name: 'plan.pdf', size: 8 }]);
  jest.spyOn(console, 'error').mockImplementation(() => undefined);
});

describe('POST /api/enterprise/intake/:token/files', () => {
  it('stores one file and starts the Basecamp post', async () => {
    const r = await request(app).post(url).attach('file', Buffer.from('%PDF-1.7'), 'plan.pdf');
    expect(r.status).toBe(201);
    expect(r.body).toEqual({ files: [{ name: 'plan.pdf', size: 8 }] });
    expect(mockStore.mock.calls[0][1]).toMatchObject({ originalName: 'plan.pdf', size: 8 });
    expect(mockSoon).toHaveBeenCalledWith(TOKEN);
  });

  it('unknown token is 404 and nothing is stored', async () => {
    mockFindIntake.mockResolvedValue(null);
    const r = await request(app).post(url).attach('file', Buffer.from('%PDF-1.7'), 'plan.pdf');
    expect(r.status).toBe(404);
    expect(mockStore).not.toHaveBeenCalled();
  });

  it('a wrong extension is a 400 with a readable message', async () => {
    const r = await request(app).post(url).attach('file', Buffer.from('MZ'), 'tool.exe');
    expect(r.status).toBe(400);
    expect(r.body.code).toBe('type');
    expect(mockStore).not.toHaveBeenCalled();
  });

  it('over 25 MB is a JSON 413, not a crash', async () => {
    const r = await request(app).post(url).attach('file', Buffer.alloc(CLIENT_FILE_MAX_BYTES + 10, 0x41), 'big.txt');
    expect(r.status).toBe(413);
    expect(r.body).toEqual({ error: 'Each file must be 25 MB or smaller.', code: 'too_large' });
  });

  it('no file is a 400', async () => {
    const r = await request(app).post(url).field('x', 'y');
    expect(r.status).toBe(400);
    expect(r.body.code).toBe('no_file');
  });

  it('a refusal from the service keeps its status', async () => {
    mockStore.mockRejectedValue(new (ClientFileRefused as any)('too_many', 'You can share up to 5 files.', 409));
    const r = await request(app).post(url).attach('file', Buffer.from('%PDF-1.7'), 'plan.pdf');
    expect(r.status).toBe(409);
    expect(r.body).toEqual({ error: 'You can share up to 5 files.', code: 'too_many' });
  });
});
