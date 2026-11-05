/**
 * govProposalSignatures — required forms seed as unsigned; recording a signed copy flips to signed; the fatal set
 * is the required-and-unsigned forms.
 */
const findOrCreate = jest.fn();
const findAll = jest.fn();

jest.mock('../../../../models/GovProposalFormSignature', () => ({ __esModule: true, default: { findOrCreate: (...a: any[]) => findOrCreate(...a), findAll: (...a: any[]) => findAll(...a) } }));

import { syncRequiredSignatures, missingRequiredSignatures, recordSignature } from '../govProposalSignatures';

const plain = (v: any) => ({ get: () => ({ ...v }) });
beforeEach(() => jest.clearAllMocks());

describe('govProposalSignatures', () => {
  it('seeds an unsigned row per required form', async () => {
    findOrCreate.mockResolvedValue([{ update: jest.fn() }, true]);
    await syncRequiredSignatures('dp-1', [{ key: 'hsp' }, { key: 'execution_of_offer', signerRole: 'President' }]);
    expect(findOrCreate).toHaveBeenCalledTimes(2);
    expect(findOrCreate.mock.calls[0][0].where).toMatchObject({ delivery_project_id: 'dp-1', form_key: 'hsp' });
  });

  it('missingRequiredSignatures returns the required + unsigned form keys', async () => {
    findAll.mockResolvedValue([plain({ form_key: 'hsp' }), plain({ form_key: 'execution_of_offer' })]);
    expect(await missingRequiredSignatures('dp-1')).toEqual(['hsp', 'execution_of_offer']);
    expect(findAll).toHaveBeenCalledWith({ where: { delivery_project_id: 'dp-1', required: true, status: 'unsigned' } });
  });

  it('recordSignature flips the row to signed with the file on record', async () => {
    const update = jest.fn();
    findOrCreate.mockResolvedValue([{ update }, false]);
    await recordSignature('dp-1', 'hsp', 'President', '/uploads/hsp-signed.pdf', 'me');
    expect(update).toHaveBeenCalledWith(expect.objectContaining({ status: 'signed', signed_file_path: '/uploads/hsp-signed.pdf' }));
  });
});
