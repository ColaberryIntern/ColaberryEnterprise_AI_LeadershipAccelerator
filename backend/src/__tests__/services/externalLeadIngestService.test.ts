// Silence structured-log output so test output stays clean
jest.spyOn(process.stdout, 'write').mockImplementation(() => true);

jest.mock('../../config/env', () => ({
  env: { enterpriseCrmToken: 'valid-test-token-32chars-abcdefgh' },
}));

jest.mock('../../services/leadService', () => ({
  calculateLeadScore: jest.fn().mockReturnValue(55),
}));

jest.mock('../../models/Lead', () => ({
  __esModule: true,
  default: {
    findOne: jest.fn(),
    create: jest.fn(),
  },
}));

import Lead from '../../models/Lead';
import { ingestExternalLead } from '../../services/externalLeadIngestService';
import { v1LeadSchema } from '../../schemas/v1LeadSchema';
import { requireServiceToken } from '../../middlewares/serviceAuthMiddleware';

const findOne = Lead.findOne as jest.Mock;
const create = Lead.create as jest.Mock;

const MINIMAL = {
  name: 'Jane Doe',
  email: 'jane@acmecorp.com',
  source: 'training.colaberry.com',
};

const EXISTING = { id: 42, created_at: new Date('2026-06-01T00:00:00Z') };

/* ------------------------------------------------------------------ */
/*  Service — ingestExternalLead                                        */
/* ------------------------------------------------------------------ */

describe('ingestExternalLead', () => {
  beforeEach(() => {
    findOne.mockReset();
    create.mockReset();
  });

  afterAll(() => {
    jest.restoreAllMocks();
  });

  it('creates a new lead and returns was_duplicate: false (happy path)', async () => {
    findOne.mockResolvedValue(null); // no strapi_lead_id match, no email match
    const newLead = { id: 99, created_at: new Date('2026-06-09T10:00:00Z') };
    create.mockResolvedValue(newLead);

    const result = await ingestExternalLead({ ...MINIMAL, strapi_lead_id: 'strapi-001' });

    expect(result.was_duplicate).toBe(false);
    expect(result.id).toBe(99);
    expect(create).toHaveBeenCalledTimes(1);
  });

  it('returns existing row by strapi_lead_id+source without creating (idempotency tier 1)', async () => {
    findOne.mockResolvedValueOnce(EXISTING); // strapi_lead_id match → early return

    const result = await ingestExternalLead({ ...MINIMAL, strapi_lead_id: 'strapi-001' });

    expect(result.was_duplicate).toBe(true);
    expect(result.id).toBe(42);
    expect(create).not.toHaveBeenCalled();
    // Only one findOne call (tier 1); tier 2 never reached
    expect(findOne).toHaveBeenCalledTimes(1);
  });

  it('returns existing row by email without creating (idempotency tier 2)', async () => {
    // No strapi_lead_id in payload → tier 1 skipped; tier 2 email check hits existing
    findOne.mockResolvedValueOnce(EXISTING);

    const result = await ingestExternalLead(MINIMAL); // no strapi_lead_id

    expect(result.was_duplicate).toBe(true);
    expect(result.id).toBe(42);
    expect(create).not.toHaveBeenCalled();
    expect(findOne).toHaveBeenCalledTimes(1);
  });

  it('skips strapi_lead_id dedup tier when strapi_lead_id is absent', async () => {
    findOne.mockResolvedValueOnce(null); // email check → no match
    create.mockResolvedValue({ id: 100, created_at: new Date() });

    await ingestExternalLead(MINIMAL); // no strapi_lead_id

    // findOne called once (email only), not twice
    expect(findOne).toHaveBeenCalledTimes(1);
    expect(create).toHaveBeenCalledTimes(1);
  });

  it('re-throws DB errors from Lead.create', async () => {
    findOne.mockResolvedValue(null);
    create.mockRejectedValue(new Error('DB connection lost'));

    await expect(ingestExternalLead(MINIMAL)).rejects.toThrow('DB connection lost');
  });
});

/* ------------------------------------------------------------------ */
/*  Schema — v1LeadSchema Zod validation                               */
/* ------------------------------------------------------------------ */

describe('v1LeadSchema', () => {
  it('accepts a minimal valid payload', () => {
    expect(() => v1LeadSchema.parse(MINIMAL)).not.toThrow();
  });

  it('rejects missing name (400-class)', () => {
    const { name, ...rest } = MINIMAL;
    expect(() => v1LeadSchema.parse(rest)).toThrow();
  });

  it('rejects invalid email', () => {
    expect(() => v1LeadSchema.parse({ ...MINIMAL, email: 'not-an-email' })).toThrow();
  });

  it('rejects missing source', () => {
    const { source, ...rest } = MINIMAL;
    expect(() => v1LeadSchema.parse(rest)).toThrow();
  });

  it('rejects invalid device enum value', () => {
    expect(() => v1LeadSchema.parse({ ...MINIMAL, device: 'smartwatch' })).toThrow();
  });

  it('accepts full payload with all attribution fields', () => {
    expect(() =>
      v1LeadSchema.parse({
        ...MINIMAL,
        strapi_lead_id: 'abc-123',
        company: 'Acme Corp',
        role: 'VP Engineering',
        phone: '555-1234',
        title: 'VP',
        industry: 'Technology',
        company_size: '500-1000',
        message: 'Interested in training',
        consent_contact: true,
        utm_source: 'google',
        utm_medium: 'cpc',
        utm_campaign: 'summer-2026',
        utm_term: 'AI leadership',
        utm_content: 'banner-v2',
        referrer: 'https://google.com',
        landing_page: 'https://training.colaberry.com/register',
        first_touch_at: '2026-06-01T00:00:00Z',
        last_touch_at: '2026-06-09T00:00:00Z',
        last_touch_page: 'https://training.colaberry.com/checkout',
        device: 'mobile',
      })
    ).not.toThrow();
  });
});

/* ------------------------------------------------------------------ */
/*  Middleware — requireServiceToken                                    */
/* ------------------------------------------------------------------ */

describe('requireServiceToken', () => {
  const makeRes = () => {
    const res: any = {};
    res.status = jest.fn().mockReturnValue(res);
    res.json = jest.fn().mockReturnValue(res);
    return res;
  };

  it('returns 401 when Authorization header is missing', () => {
    const req: any = { headers: {}, ip: '127.0.0.1' };
    const res = makeRes();
    const next = jest.fn();

    requireServiceToken(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({ error: 'Service token required' });
    expect(next).not.toHaveBeenCalled();
  });

  it('returns 401 when scheme is not Bearer', () => {
    const req: any = { headers: { authorization: 'Basic dXNlcjpwYXNz' }, ip: '127.0.0.1' };
    const res = makeRes();
    const next = jest.fn();

    requireServiceToken(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  it('returns 401 when token is wrong', () => {
    const req: any = { headers: { authorization: 'Bearer wrong-token' }, ip: '127.0.0.1' };
    const res = makeRes();
    const next = jest.fn();

    requireServiceToken(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({ error: 'Invalid service token' });
    expect(next).not.toHaveBeenCalled();
  });

  it('calls next() when token matches (valid token)', () => {
    const req: any = {
      headers: { authorization: 'Bearer valid-test-token-32chars-abcdefgh' },
      ip: '127.0.0.1',
    };
    const res = makeRes();
    const next = jest.fn();

    requireServiceToken(req, res, next);

    expect(next).toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalled();
  });
});
