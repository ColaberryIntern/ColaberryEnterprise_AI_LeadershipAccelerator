/**
 * studentCertificationService — the claim lifecycle behind AI Architect (D4).
 * Happy path, the failure paths a student or reviewer can hit, and the two
 * idempotency promises: one open claim per track, and a retried approval
 * neither double-latches nor throws.
 */
jest.mock('../../../models/StudentCertification', () => ({
  __esModule: true,
  default: { findOne: jest.fn(), findAll: jest.fn(), findByPk: jest.fn(), create: jest.fn() },
}));
jest.mock('../../../config/upload', () => ({ CERT_DIR: '/tmp/certs' }));
jest.mock('../../progression/milestoneService', () => ({ latchCertificationMilestone: jest.fn() }));
jest.mock('../../progression/promotionService', () => ({ evaluateForEnrollment: jest.fn() }));
jest.mock('fs', () => ({ promises: { access: jest.fn() } }));

import { promises as fs } from 'fs';
import StudentCertification from '../../../models/StudentCertification';
import { latchCertificationMilestone } from '../../progression/milestoneService';
import { evaluateForEnrollment } from '../../progression/promotionService';
import {
  submitCertification, reviewCertification, listCertifications, getCertificationFile, CertificationError,
} from '../studentCertificationService';

const findOne = StudentCertification.findOne as unknown as jest.Mock;
const findAll = StudentCertification.findAll as unknown as jest.Mock;
const findByPk = StudentCertification.findByPk as unknown as jest.Mock;
const create = StudentCertification.create as unknown as jest.Mock;
const latch = latchCertificationMilestone as unknown as jest.Mock;
const evaluate = evaluateForEnrollment as unknown as jest.Mock;
const access = fs.access as unknown as jest.Mock;

function row(over: Record<string, unknown> = {}) {
  const r: any = {
    id: 'cert-1', enrollment_id: 'e1', track: 'cca_f', status: 'pending',
    file_name: 'abc.pdf', file_mime: 'application/pdf', original_name: 'cert.pdf',
    credential_id: null, passed_on: null, note: null, submitted_at: new Date('2026-09-16T12:00:00Z'),
    reviewed_at: null, reviewed_by: null, review_note: null,
    ...over,
  };
  r.update = jest.fn(async (patch: any) => Object.assign(r, patch));
  return r;
}
const file = { filename: 'abc.pdf', mimetype: 'application/pdf', originalname: 'cert.pdf' };

beforeEach(() => {
  jest.clearAllMocks();
  latch.mockResolvedValue(true);
  evaluate.mockResolvedValue({ level: 'ai_architect', rank: 5, promoted: true });
  access.mockResolvedValue(undefined);
});

describe('submitCertification', () => {
  it('files a pending claim with the multer filename (never a client path)', async () => {
    findOne.mockResolvedValue(null);
    create.mockImplementation(async (attrs: any) => row(attrs));
    const v = await submitCertification({ enrollmentId: 'e1', file: { ...file, filename: '../../etc/passwd.pdf' }, credentialId: 'ABC-123', passedOn: '2026-09-10' });
    expect(create).toHaveBeenCalledWith(expect.objectContaining({ enrollment_id: 'e1', track: 'cca_f', status: 'pending', file_name: 'passwd.pdf', credential_id: 'ABC-123', passed_on: '2026-09-10' }));
    expect(v.status).toBe('pending');
  });

  it('refuses a second claim while one is pending, and says so', async () => {
    findOne.mockResolvedValue(row());
    await expect(submitCertification({ enrollmentId: 'e1', file })).rejects.toMatchObject({ code: 'CertificationAlreadyOpen', status: 409 });
    expect(create).not.toHaveBeenCalled();
  });

  it('refuses a claim when one is already approved', async () => {
    findOne.mockResolvedValue(row({ status: 'approved' }));
    await expect(submitCertification({ enrollmentId: 'e1', file })).rejects.toMatchObject({ code: 'CertificationAlreadyOpen' });
  });

  it('allows a new claim after a rejection (the open-claim lookup excludes rejected)', async () => {
    findOne.mockResolvedValue(null);
    create.mockImplementation(async (attrs: any) => row(attrs));
    await submitCertification({ enrollmentId: 'e1', file });
    const where = findOne.mock.calls[0][0].where;
    expect(where.status).toBeDefined();
    expect(JSON.stringify(where)).not.toContain('rejected');
  });

  it('falls back to the default track for an unknown one', async () => {
    findOne.mockResolvedValue(null);
    create.mockImplementation(async (attrs: any) => row(attrs));
    await submitCertification({ enrollmentId: 'e1', track: 'made_up', file });
    expect(create.mock.calls[0][0].track).toBe('cca_f');
  });
});

describe('reviewCertification', () => {
  it('approval records the reviewer, latches the milestone and re-ranks', async () => {
    const r = row();
    findByPk.mockResolvedValue(r);
    const out = await reviewCertification('cert-1', 'approved', 'ali@colaberry.com', 'Verified on claudecertifications.com');
    expect(r.update).toHaveBeenCalledWith(expect.objectContaining({ status: 'approved', reviewed_by: 'ali@colaberry.com', review_note: 'Verified on claudecertifications.com' }));
    expect(latch).toHaveBeenCalledWith('e1', 'cert-1', expect.objectContaining({ track: 'cca_f', reviewed_by: 'ali@colaberry.com' }));
    expect(evaluate).toHaveBeenCalledWith('e1');
    expect(out).toMatchObject({ milestone_latched: true, promotion: { level: 'ai_architect', rank: 5, promoted: true } });
    expect(out.certification.status).toBe('approved');
  });

  it('rejection records the decision and touches neither milestone nor rank', async () => {
    const r = row();
    findByPk.mockResolvedValue(r);
    const out = await reviewCertification('cert-1', 'rejected', 'ali@colaberry.com', 'Wrong document');
    expect(r.status).toBe('rejected');
    expect(latch).not.toHaveBeenCalled();
    expect(evaluate).not.toHaveBeenCalled();
    expect(out).toMatchObject({ milestone_latched: false, promotion: null });
  });

  it('re-approving an approved row is a no-op, not an error', async () => {
    const r = row({ status: 'approved', reviewed_by: 'ram@colaberry.com' });
    findByPk.mockResolvedValue(r);
    const out = await reviewCertification('cert-1', 'approved', 'ali@colaberry.com');
    expect(r.update).not.toHaveBeenCalled();
    expect(latch).not.toHaveBeenCalled();
    expect(out.certification.reviewed_by).toBe('ram@colaberry.com');
  });

  it('rejecting an approved row, or deciding a rejected one, is refused', async () => {
    findByPk.mockResolvedValue(row({ status: 'approved' }));
    await expect(reviewCertification('cert-1', 'rejected', 'x')).rejects.toMatchObject({ code: 'CertificationAlreadyReviewed', status: 409 });
    findByPk.mockResolvedValue(row({ status: 'rejected' }));
    await expect(reviewCertification('cert-1', 'approved', 'x')).rejects.toMatchObject({ code: 'CertificationAlreadyReviewed' });
  });

  it('a promotion failure does not lose the approval', async () => {
    const r = row();
    findByPk.mockResolvedValue(r);
    evaluate.mockRejectedValue(new Error('db down'));
    const errSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    const out = await reviewCertification('cert-1', 'approved', 'ali@colaberry.com');
    expect(r.status).toBe('approved');
    expect(out.milestone_latched).toBe(true);
    expect(out.promotion).toBeNull();
    expect(String(errSpy.mock.calls[0]?.[0])).toContain('certification_promotion_failed');
    errSpy.mockRestore();
  });

  it('404s on an unknown id', async () => {
    findByPk.mockResolvedValue(null);
    await expect(reviewCertification('nope', 'approved', 'x')).rejects.toMatchObject({ code: 'CertificationNotFound', status: 404 });
  });
});

describe('listCertifications', () => {
  it('defaults to the pending queue and carries the enrollment id for staff', async () => {
    findAll.mockResolvedValue([row()]);
    const out = await listCertifications();
    expect(findAll.mock.calls[0][0].where).toEqual({ status: 'pending' });
    expect(out[0]).toMatchObject({ id: 'cert-1', enrollment_id: 'e1', status: 'pending' });
  });
});

describe('getCertificationFile', () => {
  it('serves the owner and staff, refuses another student, and 404s a missing file', async () => {
    findByPk.mockResolvedValue(row());
    expect(await getCertificationFile('cert-1', 'e1')).toMatchObject({ path: expect.stringContaining('abc.pdf'), mime: 'application/pdf' });
    expect(await getCertificationFile('cert-1', null)).toMatchObject({ mime: 'application/pdf' });
    await expect(getCertificationFile('cert-1', 'someone-else')).rejects.toMatchObject({ code: 'CertificationForbidden', status: 403 });
    access.mockRejectedValue(new Error('ENOENT'));
    await expect(getCertificationFile('cert-1', 'e1')).rejects.toBeInstanceOf(CertificationError);
  });

  it('guards the stored name against traversal even though multer wrote it', async () => {
    findByPk.mockResolvedValue(row({ file_name: '../../etc/passwd' }));
    const f = await getCertificationFile('cert-1', null);
    expect(f.path.replace(/\\/g, '/')).toBe('/tmp/certs/passwd');
  });
});
