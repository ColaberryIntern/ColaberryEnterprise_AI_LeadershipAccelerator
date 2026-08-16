/**
 * attachmentStore — idempotency, which is the non-negotiable here (CLAUDE.md).
 * Dragging the same screenshot in twice, or a browser retrying a flaky upload,
 * must not produce two rows, two files on the volume, and two copies of the
 * same image billed to a vision call.
 */
jest.mock('../../../../models/AgentAttachment', () => ({
  __esModule: true,
  default: { findOne: jest.fn(), create: jest.fn(), findAll: jest.fn() },
}));
jest.mock('../../../../config/upload', () => ({
  AGENT_ATTACHMENT_DIR: '/tmp/agent-attachments-test',
  AGENT_ATTACHMENT_MIMES: { 'image/png': '.png', 'image/jpeg': '.jpg', 'application/pdf': '.pdf' },
}));
jest.mock('fs/promises', () => ({
  __esModule: true,
  default: { readFile: jest.fn(), writeFile: jest.fn(), mkdir: jest.fn(), unlink: jest.fn(), access: jest.fn() },
}));

import fs from 'fs/promises';
import AgentAttachment from '../../../../models/AgentAttachment';
import { storeAttachment, loadAttachmentFile } from '../attachmentStore';

const mockFindOne = AgentAttachment.findOne as unknown as jest.Mock;
const mockCreate = AgentAttachment.create as unknown as jest.Mock;
const mockWrite = fs.writeFile as unknown as jest.Mock;
const mockUnlink = fs.unlink as unknown as jest.Mock;
const mockAccess = fs.access as unknown as jest.Mock;

const OWNER = '11111111-1111-4111-8111-111111111111';
const OTHER = '99999999-9999-4999-8999-999999999999';

const file = (name = 'shot.png', body = 'the-same-bytes') => ({
  originalname: name, mimetype: 'image/png', buffer: Buffer.from(body),
});

beforeEach(() => {
  jest.clearAllMocks();
  (fs.mkdir as unknown as jest.Mock).mockResolvedValue(undefined);
  mockWrite.mockResolvedValue(undefined);
  mockUnlink.mockResolvedValue(undefined);
  mockAccess.mockResolvedValue(undefined);
});

describe('storeAttachment — first upload', () => {
  it('writes the file and creates the row', async () => {
    mockFindOne.mockResolvedValue(null);
    mockCreate.mockImplementation(async (v: any) => ({ id: 'new-id', ...v }));

    const r = await storeAttachment(OWNER, file());

    expect(mockWrite).toHaveBeenCalledTimes(1);
    expect(mockCreate).toHaveBeenCalledTimes(1);
    expect(r.deduped).toBe(false);
    expect(r.id).toBe('new-id');
    // The hash is what dedupe keys on — it must be a real sha256 of the bytes.
    expect(mockCreate.mock.calls[0][0].sha256).toHaveLength(64);
  });

  // The display name is handed to the model as `[attached file: ...]`, so a
  // leaked path would put the student's local directory structure in the
  // prompt. Both separators are asserted regardless of the host OS — the
  // Windows case is the one that matters, and it is exactly the one a Linux
  // `path.basename` silently lets through.
  it.each([
    ['C:\\Users\\me\\secret\\shot.png', 'windows path'],
    ['/home/me/secret/shot.png', 'posix path'],
    ['shot.png', 'bare name'],
  ])('reduces %s (%s) to the bare filename', async (given) => {
    mockFindOne.mockResolvedValue(null);
    mockCreate.mockImplementation(async (v: any) => ({ id: 'new-id', ...v }));

    await storeAttachment(OWNER, file(given));

    expect(mockCreate.mock.calls[0][0].filename).toBe('shot.png');
  });

  it('falls back to a generic name when the client sends none', async () => {
    mockFindOne.mockResolvedValue(null);
    mockCreate.mockImplementation(async (v: any) => ({ id: 'new-id', ...v }));

    await storeAttachment(OWNER, { originalname: '', mimetype: 'image/png', buffer: Buffer.from('x') });

    expect(mockCreate.mock.calls[0][0].filename).toBe('attachment.png');
  });
});

describe('storeAttachment — idempotency', () => {
  it('returns the existing row for the same bytes, writing nothing new', async () => {
    mockFindOne.mockResolvedValue({
      id: 'existing-id', filename: 'shot.png', mime: 'image/png', byte_size: 14,
    });

    const r = await storeAttachment(OWNER, file());

    expect(r).toEqual({ id: 'existing-id', filename: 'shot.png', mime: 'image/png', byte_size: 14, deduped: true });
    expect(mockWrite).not.toHaveBeenCalled();
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it('produces the same end state when the same upload runs twice', async () => {
    mockFindOne.mockResolvedValueOnce(null);
    mockCreate.mockImplementation(async (v: any) => ({ id: 'stable-id', ...v }));
    const first = await storeAttachment(OWNER, file());

    mockFindOne.mockResolvedValueOnce({ id: 'stable-id', filename: 'shot.png', mime: 'image/png', byte_size: 14 });
    const second = await storeAttachment(OWNER, file());

    expect(second.id).toBe(first.id);
    expect(mockCreate).toHaveBeenCalledTimes(1); // exactly one row ever created
    expect(mockWrite).toHaveBeenCalledTimes(1);  // exactly one file ever written
  });

  it('dedupes per owner, so two students uploading identical bytes get their own rows', async () => {
    mockFindOne.mockResolvedValue(null);
    mockCreate.mockImplementation(async (v: any) => ({ id: `id-for-${v.enrollment_id}`, ...v }));

    const a = await storeAttachment(OWNER, file());
    const b = await storeAttachment(OTHER, file());

    expect(a.id).not.toBe(b.id);
    expect(mockFindOne.mock.calls[0][0].where.enrollment_id).toBe(OWNER);
    expect(mockFindOne.mock.calls[1][0].where.enrollment_id).toBe(OTHER);
  });

  it('resolves a lost unique-index race to the winner and cleans up its own orphan file', async () => {
    mockFindOne
      .mockResolvedValueOnce(null)                                                     // fast path missed
      .mockResolvedValueOnce({ id: 'winner-id', filename: 'shot.png', mime: 'image/png', byte_size: 14 });
    mockCreate.mockRejectedValue(Object.assign(new Error('duplicate key'), { name: 'SequelizeUniqueConstraintError' }));

    const r = await storeAttachment(OWNER, file());

    expect(r.id).toBe('winner-id');
    expect(r.deduped).toBe(true);
    expect(mockUnlink).toHaveBeenCalledTimes(1); // the duplicate file did not stay on the volume
  });

  it('rethrows a create failure that is NOT a lost race', async () => {
    mockFindOne.mockResolvedValue(null); // still nothing after the failure
    mockCreate.mockRejectedValue(new Error('connection terminated'));

    await expect(storeAttachment(OWNER, file())).rejects.toThrow('connection terminated');
  });
});

describe('loadAttachmentFile — owner scoping', () => {
  it('resolves an owned attachment', async () => {
    mockFindOne.mockResolvedValue({ mime: 'image/png', stored_name: 'a.png', filename: 'shot.png' });
    const r = await loadAttachmentFile(OWNER, 'some-id');
    expect(r).toMatchObject({ mime: 'image/png', filename: 'shot.png' });
  });

  it("returns null for someone else's attachment", async () => {
    mockFindOne.mockResolvedValue(null);
    expect(await loadAttachmentFile(OTHER, 'some-id')).toBeNull();
  });

  it('returns null when the row exists but the file does not', async () => {
    mockFindOne.mockResolvedValue({ mime: 'image/png', stored_name: 'a.png', filename: 'shot.png' });
    mockAccess.mockRejectedValue(new Error('ENOENT'));
    expect(await loadAttachmentFile(OWNER, 'some-id')).toBeNull();
  });
});
