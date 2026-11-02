import React from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import { MemoryRouter } from 'react-router-dom';
import AdminAdSpendPage from '../AdminAdSpendPage';
import * as api from '../../../../../services/adSpendApi';

jest.mock('../../../../../services/adSpendApi', () => ({
  ...jest.requireActual('../../../../../services/adSpendApi'),
  getSpendLedger: jest.fn(), deleteSpend: jest.fn(), addSpend: jest.fn(), importSpendCsv: jest.fn(), syncMetaSpend: jest.fn(),
}));

const ledger = {
  from: '2026-08-05', to: '2026-11-02',
  records: [{ id: 7, platform: 'meta', accountId: null, campaignRef: '527', campaignName: 'AI Platform', placement: 'facebook',
    periodStart: '2026-10-01', periodEnd: '2026-10-07', amountCents: 70000, impressions: null, clicks: null,
    source: 'manual', enteredBy: 'ali@colaberry.com', note: null, updatedAt: '2026-10-08T12:00:00Z' }],
  sync: { meta: { configured: false, accountId: null, reason: 'META_ADS_ACCESS_TOKEN and META_AD_ACCOUNT_ID are not set.' }, lastSync: null },
  knownCampaigns: [{ utmSource: 'fb', utmCampaign: '527', signups: 274, lastSignup: '2026-11-01T12:00:00Z' }],
};

let el: HTMLDivElement; let root: Root;
beforeEach(() => { el = document.createElement('div'); document.body.appendChild(el); root = createRoot(el); });
afterEach(() => { act(() => root.unmount()); el.remove(); jest.clearAllMocks(); });

async function render() {
  await act(async () => { root.render(<MemoryRouter><AdminAdSpendPage /></MemoryRouter>); });
}

describe('AdminAdSpendPage', () => {
  it('lists recorded spend and explains what Meta needs when it is not connected', async () => {
    (api.getSpendLedger as jest.Mock).mockResolvedValue(ledger);
    await render();
    expect(el.querySelectorAll('[data-testid="spend-row"]')).toHaveLength(1);
    expect(el.textContent).toContain('$700.00');
    expect(el.textContent).toContain('Oct 1 – 7');
    expect(el.querySelector('[data-testid="meta-not-configured"]')?.textContent).toContain('META_ADS_ACCESS_TOKEN');
  });

  it('deletes only on the second click, with no browser dialog', async () => {
    (api.getSpendLedger as jest.Mock).mockResolvedValue(ledger);
    (api.deleteSpend as jest.Mock).mockResolvedValue(undefined);
    const confirmSpy = jest.spyOn(window, 'confirm');
    await render();
    const first = el.querySelector('button[aria-label^="Delete $700.00"]') as HTMLButtonElement;
    await act(async () => { first.click(); });
    expect(api.deleteSpend).not.toHaveBeenCalled();
    const second = Array.from(el.querySelectorAll('button')).find((b) => b.textContent === 'Delete' && b.className.includes('btn-danger')) as HTMLButtonElement;
    await act(async () => { second.click(); });
    expect(api.deleteSpend).toHaveBeenCalledWith(7);
    expect(confirmSpy).not.toHaveBeenCalled();
    confirmSpy.mockRestore();
  });

  it('shows an error with a retry when the ledger fails to load', async () => {
    (api.getSpendLedger as jest.Mock).mockRejectedValue(new Error('500'));
    await render();
    expect(el.textContent).toContain('Ad spend could not be loaded.');
    expect(el.textContent).toContain('Try again');
  });
});
