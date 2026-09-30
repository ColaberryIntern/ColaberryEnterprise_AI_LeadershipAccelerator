/**
 * readAttachmentsTool — the security and failure behaviour, which is where the
 * value is. The happy path (bytes in, image part out) matters less than these:
 *
 *   - another student's id must be indistinguishable from a nonexistent one
 *   - a malformed id must not reach the uuid column (that is a 500 on a chat)
 *   - an unreadable file must produce a `skipped` the agent can talk about,
 *     never a thrown error that costs the student their whole message
 *   - going over the ceiling must be REPORTED, not silently truncated
 */
jest.mock('../../../../models/AgentAttachment', () => ({ __esModule: true, default: { findOne: jest.fn() } }));
jest.mock('../../../../config/upload', () => ({ AGENT_ATTACHMENT_DIR: '/tmp/agent-attachments-test' }));
jest.mock('fs/promises', () => ({ __esModule: true, default: { readFile: jest.fn() } }));
jest.mock('../imageNormalizer', () => ({
  normalizeImageForVision: jest.fn(),
  rasterizePdfFirstPage: jest.fn(),
}));

import fs from 'fs/promises';
import AgentAttachment from '../../../../models/AgentAttachment';
import { normalizeImageForVision, rasterizePdfFirstPage } from '../imageNormalizer';
import { readAttachments, attachmentInstruction, MAX_ATTACHMENTS_PER_TURN } from '../readAttachmentsTool';

const mockFindOne = AgentAttachment.findOne as unknown as jest.Mock;
const mockReadFile = fs.readFile as unknown as jest.Mock;
const mockNormalize = normalizeImageForVision as unknown as jest.Mock;
const mockRasterize = rasterizePdfFirstPage as unknown as jest.Mock;

const OWNER = '11111111-1111-4111-8111-111111111111';
const ID = (n: number) => `2222222${n}-2222-4222-8222-222222222222`;

function row(over: Record<string, unknown> = {}) {
  return { id: ID(1), enrollment_id: OWNER, mime: 'image/png', stored_name: 'a.png', filename: 'screenshot.png', ...over };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockReadFile.mockResolvedValue(Buffer.from('bytes'));
  mockNormalize.mockResolvedValue({ mime: 'image/png', dataUrl: 'data:image/png;base64,AAAA' });
});

describe('readAttachments — happy path', () => {
  it('returns a filename label then an image part for a readable image', async () => {
    mockFindOne.mockResolvedValue(row());
    const r = await readAttachments(OWNER, [{ id: ID(1), name: 'screenshot.png' }]);

    expect(r.attached).toBe(1);
    expect(r.skipped).toEqual([]);
    expect(r.parts).toEqual([
      { type: 'text', text: '[attached file: screenshot.png]' },
      { type: 'image_url', image_url: { url: 'data:image/png;base64,AAAA' } },
    ]);
  });

  it('rasterizes a PDF rather than sending it as an image', async () => {
    mockFindOne.mockResolvedValue(row({ mime: 'application/pdf', stored_name: 'a.pdf', filename: 'plan.pdf' }));
    mockRasterize.mockResolvedValue(Buffer.from('png-bytes'));

    const r = await readAttachments(OWNER, [{ id: ID(1) }]);

    expect(mockRasterize).toHaveBeenCalled();
    expect(r.attached).toBe(1);
  });

  it('does nothing at all for an empty ref list', async () => {
    const r = await readAttachments(OWNER, []);
    expect(r).toEqual({ parts: [], skipped: [], attached: 0 });
    expect(mockFindOne).not.toHaveBeenCalled();
  });
});

describe('readAttachments — ownership', () => {
  it('scopes the lookup to the requesting enrollment', async () => {
    mockFindOne.mockResolvedValue(row());
    await readAttachments(OWNER, [{ id: ID(1) }]);
    expect(mockFindOne).toHaveBeenCalledWith({ where: { id: ID(1), enrollment_id: OWNER } });
  });

  it("reports another student's attachment as not_found, exactly like a missing one", async () => {
    mockFindOne.mockResolvedValue(null); // the owner-scoped query finds nothing
    const r = await readAttachments(OWNER, [{ id: ID(3), name: 'theirs.png' }]);

    expect(r.attached).toBe(0);
    expect(r.skipped).toEqual([
      { id: ID(3), name: 'theirs.png', reason: 'not_found', detail: 'That file could not be found.' },
    ]);
  });
});

describe('readAttachments — bad input', () => {
  it('never queries with a malformed id (which would 500 on the uuid column)', async () => {
    const r = await readAttachments(OWNER, [{ id: 'STORY-999' }]);
    expect(mockFindOne).not.toHaveBeenCalled();
    expect(r.skipped[0].reason).toBe('not_found');
  });

  it('skips a row whose file is gone from the volume', async () => {
    mockFindOne.mockResolvedValue(row());
    mockReadFile.mockRejectedValue(new Error('ENOENT'));

    const r = await readAttachments(OWNER, [{ id: ID(1) }]);
    expect(r.attached).toBe(0);
    expect(r.skipped[0].reason).toBe('unreadable');
  });

  it('skips bytes that are not a decodable image instead of throwing', async () => {
    mockFindOne.mockResolvedValue(row());
    mockNormalize.mockRejectedValue(new Error('unsupported image'));

    const r = await readAttachments(OWNER, [{ id: ID(1) }]);
    expect(r.attached).toBe(0);
    expect(r.skipped[0].reason).toBe('unreadable');
  });

  it('skips a PDF that cannot be rasterized', async () => {
    mockFindOne.mockResolvedValue(row({ mime: 'application/pdf' }));
    mockRasterize.mockResolvedValue(null); // pdftoppm missing or PDF unrenderable

    const r = await readAttachments(OWNER, [{ id: ID(1) }]);
    expect(r.attached).toBe(0);
    expect(r.skipped[0].reason).toBe('unreadable');
  });
});

describe('readAttachments — the per-turn ceiling', () => {
  it('reads up to the ceiling and REPORTS the overflow rather than dropping it silently', async () => {
    mockFindOne.mockImplementation(async ({ where }: any) => row({ id: where.id }));
    const refs = Array.from({ length: MAX_ATTACHMENTS_PER_TURN + 2 }, (_, i) => ({ id: ID(i), name: `f${i}.png` }));

    const r = await readAttachments(OWNER, refs);

    expect(r.attached).toBe(MAX_ATTACHMENTS_PER_TURN);
    expect(r.skipped).toHaveLength(2);
    expect(r.skipped.every((s) => s.reason === 'over_limit')).toBe(true);
  });
});

describe('attachmentInstruction', () => {
  it('is empty when nothing was attached and nothing was skipped', () => {
    expect(attachmentInstruction({ parts: [], skipped: [], attached: 0 })).toBe('');
  });

  it('tells the agent it can see the images, and never to claim otherwise', () => {
    const text = attachmentInstruction({ parts: [], skipped: [], attached: 2 });
    expect(text).toContain('attached 2 files');
    expect(text).toContain('Never say you cannot see images');
  });

  it('names what could not be read so the agent can say so out loud', () => {
    const text = attachmentInstruction({
      parts: [], attached: 0,
      skipped: [{ id: ID(1), name: 'broken.png', reason: 'unreadable', detail: 'That file could not be opened.' }],
    });
    expect(text).toContain('broken.png');
    expect(text).toContain('could not be opened');
  });
});
