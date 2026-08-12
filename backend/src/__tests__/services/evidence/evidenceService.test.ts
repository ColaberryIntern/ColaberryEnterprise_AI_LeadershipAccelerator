import { EvidenceArtifact, EvidenceLink } from '../../../models';
import { recordEvidenceArtifact, getEvidenceForTicket, EvidenceValidationError } from '../../../services/evidence/evidenceService';

jest.mock('../../../config/database', () => ({ sequelize: { query: jest.fn() } }));
jest.mock('../../../models', () => ({
  EvidenceArtifact: { findOne: jest.fn(), create: jest.fn(), findAll: jest.fn() },
  EvidenceLink: { findOrCreate: jest.fn(), findAll: jest.fn() },
}));

const artifactFindOne = EvidenceArtifact.findOne as unknown as jest.Mock;
const artifactCreate = EvidenceArtifact.create as unknown as jest.Mock;
const artifactFindAll = EvidenceArtifact.findAll as unknown as jest.Mock;
const linkFindOrCreate = EvidenceLink.findOrCreate as unknown as jest.Mock;
const linkFindAll = EvidenceLink.findAll as unknown as jest.Mock;

beforeEach(() => {
  jest.clearAllMocks();
  linkFindOrCreate.mockResolvedValue([{ id: 'link-1' }, true]);
});

const TICKET_ID = '11111111-1111-4111-8111-111111111111';
const EVENT_ID = '22222222-2222-4222-8222-222222222222';

describe('recordEvidenceArtifact', () => {
  it('happy path: creates a new artifact and links it when none exists yet', async () => {
    artifactFindOne.mockResolvedValue(null);
    const created = { id: 'art-1', ticket_id: TICKET_ID, storage_ref: '/shots/a.png' };
    artifactCreate.mockResolvedValue(created);

    const result = await recordEvidenceArtifact({
      ticketId: TICKET_ID,
      artifactType: 'screenshot',
      storageRef: '/shots/a.png',
    } as any);

    expect(result).toBe(created);
    expect(artifactCreate).toHaveBeenCalledTimes(1);
    expect(linkFindOrCreate).toHaveBeenCalledWith(
      expect.objectContaining({ where: { evidence_id: 'art-1', ticket_id: TICKET_ID } }),
    );
  });

  it('idempotency: a second call with the same ticket+storageRef returns the existing artifact and does not create a duplicate row', async () => {
    const existing = { id: 'art-1', ticket_id: TICKET_ID, storage_ref: '/shots/a.png' };
    artifactFindOne.mockResolvedValue(existing);

    const result = await recordEvidenceArtifact({
      ticketId: TICKET_ID,
      artifactType: 'screenshot',
      storageRef: '/shots/a.png',
    } as any);

    expect(result).toBe(existing);
    expect(artifactCreate).not.toHaveBeenCalled();
    expect(linkFindOrCreate).toHaveBeenCalledTimes(1);
  });

  it('dedups by (ticketId, sourceEventId) when no storageRef is given', async () => {
    const existing = { id: 'art-2', ticket_id: TICKET_ID, source_event_id: EVENT_ID };
    artifactFindOne.mockResolvedValue(existing);

    const result = await recordEvidenceArtifact({
      ticketId: TICKET_ID,
      artifactType: 'log',
      sourceEventId: EVENT_ID,
    } as any);

    expect(result).toBe(existing);
    expect(artifactFindOne).toHaveBeenCalledWith({ where: { ticket_id: TICKET_ID, source_event_id: EVENT_ID } });
  });

  it('failure/boundary: rejects an input with no reference field before touching the DB', async () => {
    await expect(
      recordEvidenceArtifact({ ticketId: TICKET_ID, artifactType: 'log' } as any),
    ).rejects.toThrow(EvidenceValidationError);
    expect(artifactFindOne).not.toHaveBeenCalled();
    expect(artifactCreate).not.toHaveBeenCalled();
  });

  it('failure/boundary: rejects a malformed ticketId (not a UUID) before touching the DB', async () => {
    await expect(
      recordEvidenceArtifact({ ticketId: 'not-a-uuid', artifactType: 'log', storageRef: '/x.png' } as any),
    ).rejects.toThrow(EvidenceValidationError);
    expect(artifactFindOne).not.toHaveBeenCalled();
  });
});

describe('getEvidenceForTicket', () => {
  it("happy path: returns artifacts for the ticket's links, most recent first", async () => {
    linkFindAll.mockResolvedValue([{ evidence_id: 'art-1' }, { evidence_id: 'art-2' }]);
    artifactFindAll.mockResolvedValue([{ id: 'art-2' }, { id: 'art-1' }]);

    const result = await getEvidenceForTicket(TICKET_ID);

    expect(result).toEqual([{ id: 'art-2' }, { id: 'art-1' }]);
  });

  it('boundary: a ticket with no linked evidence returns an empty array without querying artifacts', async () => {
    linkFindAll.mockResolvedValue([]);

    const result = await getEvidenceForTicket(TICKET_ID);

    expect(result).toEqual([]);
    expect(artifactFindAll).not.toHaveBeenCalled();
  });
});
