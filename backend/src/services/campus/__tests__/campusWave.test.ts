/**
 * C5 wave: an ordinary DM through the ordinary rule, sent at most once per 10 minutes per pair, never to AI staff.
 */
jest.mock('../../../models/RoomMessage', () => ({ __esModule: true, default: { findOne: jest.fn() } }));
jest.mock('../../communityRooms/dmService', () => {
  class DmError extends Error { constructor(m: string) { super(m); this.name = 'DmError'; } }
  return { DmError, openDm: jest.fn(), sendDmMessage: jest.fn() };
});
jest.mock('../../reese/reeseIdentitySeed', () => ({ getReeseEnrollmentId: jest.fn() }));
jest.mock('../../curriculum/daraIdentitySeed', () => ({ getDaraEnrollmentId: jest.fn() }));

import RoomMessage from '../../../models/RoomMessage';
import { openDm, sendDmMessage, DmError } from '../../communityRooms/dmService';
import { getReeseEnrollmentId } from '../../reese/reeseIdentitySeed';
import { getDaraEnrollmentId } from '../../curriculum/daraIdentitySeed';
import { waveAt, WAVE_TEXT, WAVE_WINDOW_MS } from '../campusWave';

const NOW = new Date('2026-10-18T15:00:00Z');
const findOne = RoomMessage.findOne as unknown as jest.Mock;
const ago = (ms: number) => new Date(NOW.getTime() - ms);

beforeEach(() => {
  jest.clearAllMocks();
  (getReeseEnrollmentId as jest.Mock).mockResolvedValue('reese-1');
  (getDaraEnrollmentId as jest.Mock).mockResolvedValue('dara-1');
  (openDm as jest.Mock).mockResolvedValue({ roomId: 'room-1' });
  (sendDmMessage as jest.Mock).mockResolvedValue({ id: 'msg-1' });
  findOne.mockResolvedValue(null);
});

describe('waveAt', () => {
  it('first wave: opens the DM through the ordinary rule and sends the wave text once', async () => {
    await expect(waveAt('me', 'coh-1', 'mate', NOW)).resolves.toEqual({ sent: true, reason: 'sent', roomId: 'room-1' });
    expect(openDm).toHaveBeenCalledWith('me', 'mate', 'coh-1');
    expect(sendDmMessage).toHaveBeenCalledTimes(1);
    expect((sendDmMessage as jest.Mock).mock.calls[0].slice(1, 3)).toEqual(['room-1', WAVE_TEXT]);
    expect((sendDmMessage as jest.Mock).mock.calls[0][0]).toMatchObject({ enrollmentId: 'me', isAdmin: false });
  });

  it('a second wave inside 10 minutes sends nothing (persisted state, so any tab or reload)', async () => {
    findOne.mockResolvedValue({ content: WAVE_TEXT, created_at: ago(WAVE_WINDOW_MS - 1000) });
    await expect(waveAt('me', 'coh-1', 'mate', NOW)).resolves.toEqual({ sent: false, reason: 'already_waved', roomId: 'room-1' });
    expect(sendDmMessage).not.toHaveBeenCalled();
    expect(findOne.mock.calls[0][0].where).toEqual({ room_id: 'room-1', enrollment_id: 'me', deleted_at: null });
  });

  it('after 10 minutes, waving again sends', async () => {
    findOne.mockResolvedValue({ content: WAVE_TEXT, created_at: ago(WAVE_WINDOW_MS) });
    await expect(waveAt('me', 'coh-1', 'mate', NOW)).resolves.toMatchObject({ sent: true });
  });

  it('if my last message was something else, the wave sends', async () => {
    findOne.mockResolvedValue({ content: 'see you at the lab', created_at: ago(1000) });
    await expect(waveAt('me', 'coh-1', 'mate', NOW)).resolves.toMatchObject({ sent: true });
  });

  it('the DM rule refuses (other cohort): the usual DmError, nothing sent', async () => {
    (openDm as jest.Mock).mockRejectedValue(new DmError('You can only message people in your cohort'));
    await expect(waveAt('me', 'coh-1', 'stranger', NOW)).rejects.toMatchObject({ name: 'DmError', message: 'You can only message people in your cohort' });
    expect(sendDmMessage).not.toHaveBeenCalled();
  });

  it.each(['reese-1', 'dara-1'])('waving at AI staff (%s) is refused before any room is opened', async (id) => {
    await expect(waveAt('me', 'coh-1', id, NOW)).rejects.toMatchObject({ name: 'WaveError', error_class: 'WaveToAiStaff' });
    expect(openDm).not.toHaveBeenCalled();
    expect(sendDmMessage).not.toHaveBeenCalled();
  });

  it('fail closed: if an AI identity lookup throws, nothing is opened or sent (even a staff sender cannot reach an agent)', async () => {
    (getReeseEnrollmentId as jest.Mock).mockRejectedValue(new TypeError('db down'));
    await expect(waveAt('staff-1', null, 'reese-1', NOW)).rejects.toThrow('db down');
    expect(openDm).not.toHaveBeenCalled();
    expect(sendDmMessage).not.toHaveBeenCalled();
  });

  it('waving at yourself is refused', async () => {
    await expect(waveAt('me', 'coh-1', 'me', NOW)).rejects.toMatchObject({ error_class: 'InvalidWaveTarget' });
    expect(openDm).not.toHaveBeenCalled();
  });
});
