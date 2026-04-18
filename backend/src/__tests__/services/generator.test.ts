import { Request, Response } from 'express';

jest.mock('../../models', () => ({
  LeadSource: {
    findOne: jest.fn(),
  },
  EntryPoint: {
    findOne: jest.fn(),
  },
  FormDefinition: {
    findOne: jest.fn(),
  },
}));

import { getGenerator } from '../../controllers/generatorController';
import { LeadSource, EntryPoint, FormDefinition } from '../../models';

function buildReq(sourceSlug: string, entrySlug: string): Request {
  return { params: { sourceSlug, entrySlug } } as any;
}
function buildRes() {
  const res: any = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res as Response;
}

describe('getGenerator', () => {
  beforeEach(() => jest.clearAllMocks());

  it('returns 404 when source is unknown', async () => {
    (LeadSource.findOne as jest.Mock).mockResolvedValue(null);
    const res = buildRes();
    await getGenerator(buildReq('nope', 'x'), res);
    expect(res.status).toHaveBeenCalledWith(404);
  });

  it('returns 404 when entry point is unknown', async () => {
    (LeadSource.findOne as jest.Mock).mockResolvedValue({ id: 's1', slug: 'colaberry', name: 'Colaberry', domain: 'colaberry.ai' });
    (EntryPoint.findOne as jest.Mock).mockResolvedValue(null);
    const res = buildRes();
    await getGenerator(buildReq('colaberry', 'nope'), res);
    expect(res.status).toHaveBeenCalledWith(404);
  });

  it('returns webhook_url, sample_payload, curl, and js_embed on success', async () => {
    (LeadSource.findOne as jest.Mock).mockResolvedValue({ id: 's1', slug: 'colaberry', name: 'Colaberry', domain: 'colaberry.ai' });
    (EntryPoint.findOne as jest.Mock).mockResolvedValue({
      id: 'e1',
      slug: 'request_demo_form',
      name: 'Request Demo',
      page: '/demo',
      form_name: 'request-demo',
    });
    (FormDefinition.findOne as jest.Mock).mockResolvedValue({
      id: 'f1',
      field_map: { name: 'name', email: 'email', company: 'company' },
      required_fields: ['email'],
      version: 1,
    });

    const res = buildRes();
    await getGenerator(buildReq('colaberry', 'request_demo_form'), res);

    expect(res.json).toHaveBeenCalled();
    const payload = (res.json as jest.Mock).mock.calls[0][0];
    expect(payload.webhook_url).toContain('/api/leads/ingest?source=colaberry&entry=request_demo_form');
    expect(payload.sample_payload.email).toBe('lead@example.com');
    expect(payload.sample_payload.name).toBe('Jane Doe');
    expect(payload.curl).toContain("curl -X POST");
    expect(payload.js_embed).toContain('data-colaberry-form="request_demo_form"');
  });
});
