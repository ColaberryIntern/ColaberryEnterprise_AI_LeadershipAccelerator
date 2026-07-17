import {
  participantStatus, higherTemp, rank, STATUS_TEMP,
  ingestOpenHouseParticipant, ingestOpenHouseBatch,
} from '../openHouseIngestService';
import { Lead, Activity, LeadTemperatureHistory } from '../../models';
import { logActivity } from '../activityService';

jest.mock('../../models', () => ({
  Lead: { findOne: jest.fn(), create: jest.fn() },
  Activity: { findOne: jest.fn() },
  LeadTemperatureHistory: { create: jest.fn() },
}));
jest.mock('../activityService', () => ({ logActivity: jest.fn() }));

describe('openHouseIngestService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (Activity.findOne as jest.Mock).mockResolvedValue(null);
    (LeadTemperatureHistory.create as jest.Mock).mockResolvedValue({});
    (logActivity as jest.Mock).mockResolvedValue({});
  });

  describe('pure helpers', () => {
    it('ranks the interest ladder and picks the warmer of two', () => {
      expect(rank('cold')).toBe(0);
      expect(rank('qualified')).toBe(4);
      expect(higherTemp('cold', 'hot')).toBe('hot');
      expect(higherTemp('qualified', 'hot')).toBe('qualified'); // never downgrade
    });
    it('maps the strongest signal to a status + temperature', () => {
      expect(participantStatus({ email: 'a', registered: true }).status).toBe('registered');
      expect(participantStatus({ email: 'a', registered: true, attended: true }).status).toBe('attended');
      expect(participantStatus({ email: 'a', attended: true, paid: true }).status).toBe('paid');
      expect(STATUS_TEMP).toEqual({ registered: 'warm', attended: 'hot', paid: 'qualified' });
    });
  });

  describe('ingestOpenHouseParticipant', () => {
    it('creates a new lead at the signal temperature with history + activity', async () => {
      (Lead.findOne as jest.Mock).mockResolvedValue(null);
      (Lead.create as jest.Mock).mockResolvedValue({ id: 10, lead_temperature: 'hot' });
      const o = await ingestOpenHouseParticipant({ email: 'New@X.io', name: 'New Person', attended: true }, { apply: true });
      expect(o).toMatchObject({ status: 'attended', lead: 'created', newTemp: 'hot', raised: true, activityLogged: true });
      const created = (Lead.create as jest.Mock).mock.calls[0][0];
      expect(created).toMatchObject({ email: 'new@x.io', source: 'open_house', form_type: 'open_house', lead_temperature: 'hot' });
      expect(LeadTemperatureHistory.create).toHaveBeenCalledWith(expect.objectContaining({ new_temperature: 'hot', trigger_type: 'open_house', trigger_detail: 'open_house_attended' }));
      expect(logActivity).toHaveBeenCalledWith(expect.objectContaining({ type: 'meeting', subject: expect.stringContaining('attended') }));
    });

    it('raises an existing cold lead to hot when they attended', async () => {
      const lead = { id: 5, lead_temperature: 'cold', update: jest.fn() };
      (Lead.findOne as jest.Mock).mockResolvedValue(lead);
      const o = await ingestOpenHouseParticipant({ email: 'e@x.io', attended: true }, { apply: true });
      expect(o).toMatchObject({ lead: 'existing', previousTemp: 'cold', newTemp: 'hot', raised: true });
      expect(lead.update).toHaveBeenCalledWith(expect.objectContaining({ lead_temperature: 'hot' }));
      expect(LeadTemperatureHistory.create).toHaveBeenCalled();
    });

    it('never downgrades a lead already hotter than the signal', async () => {
      const lead = { id: 6, lead_temperature: 'qualified', update: jest.fn() };
      (Lead.findOne as jest.Mock).mockResolvedValue(lead);
      const o = await ingestOpenHouseParticipant({ email: 'e@x.io', attended: true }, { apply: true });
      expect(o).toMatchObject({ newTemp: 'qualified', raised: false });
      expect(lead.update).not.toHaveBeenCalled();
      expect(LeadTemperatureHistory.create).not.toHaveBeenCalled();
    });

    it('paid → qualified', async () => {
      const lead = { id: 7, lead_temperature: 'warm', update: jest.fn() };
      (Lead.findOne as jest.Mock).mockResolvedValue(lead);
      const o = await ingestOpenHouseParticipant({ email: 'e@x.io', paid: true, amountCents: 5000 }, { apply: true });
      expect(o).toMatchObject({ status: 'paid', newTemp: 'qualified', raised: true });
    });

    it('does not double-log the activity (idempotent)', async () => {
      (Lead.findOne as jest.Mock).mockResolvedValue({ id: 8, lead_temperature: 'hot', update: jest.fn() });
      (Activity.findOne as jest.Mock).mockResolvedValue({ id: 'existing' }); // already logged
      const o = await ingestOpenHouseParticipant({ email: 'e@x.io', attended: true }, { apply: true });
      expect(o.activityLogged).toBe(false);
      expect(logActivity).not.toHaveBeenCalled();
    });

    it('dry run writes nothing', async () => {
      (Lead.findOne as jest.Mock).mockResolvedValue(null);
      const o = await ingestOpenHouseParticipant({ email: 'e@x.io', attended: true }, { apply: false });
      expect(o.lead).toBe('would_create');
      expect(Lead.create).not.toHaveBeenCalled();
      expect(logActivity).not.toHaveBeenCalled();
    });
  });

  describe('ingestOpenHouseBatch', () => {
    it('merges duplicate emails to their strongest signal', async () => {
      const lead = { id: 9, lead_temperature: 'cold', update: jest.fn() };
      (Lead.findOne as jest.Mock).mockResolvedValue(lead);
      const summary = await ingestOpenHouseBatch([
        { email: 'dup@x.io', registered: true },
        { email: 'DUP@x.io', attended: true },
        { email: 'dup@x.io', paid: true, amountCents: 5000 },
      ], { apply: true });
      expect(summary.total).toBe(1);               // merged to one person
      expect(summary.by_status.paid).toBe(1);      // strongest signal wins
      expect(lead.update).toHaveBeenCalledWith(expect.objectContaining({ lead_temperature: 'qualified' }));
    });
  });
});
