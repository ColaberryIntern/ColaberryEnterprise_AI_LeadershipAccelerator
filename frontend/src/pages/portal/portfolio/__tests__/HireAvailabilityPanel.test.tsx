import React from 'react';
import HireAvailabilityPanel from '../HireAvailabilityPanel';
import * as api from '../../../../services/hireListingApi';
import * as H from '../../../admin/__fixtures__/domHarness';

/**
 * The learner's availability: their own words, saved or cleared on purpose, and nothing
 * shown at all when they have no portfolio page to attach it to.
 */
jest.mock('../../../../services/hireListingApi');
const mocked = api as jest.Mocked<typeof api>;

afterEach(() => { H.unmount(); jest.clearAllMocks(); });

async function render(): Promise<void> {
  H.mount(<HireAvailabilityPanel />, '/');
  await H.settle();
}

describe('HireAvailabilityPanel', () => {
  it('loads the saved words and lets the learner clear them', async () => {
    mocked.fetchHireListingSettings.mockResolvedValue({ availability: { status: 'open', label: 'Open to FDE roles' }, spotlight: false });
    mocked.setHireAvailability.mockResolvedValue({ availability: null, spotlight: false });
    await render();
    expect((H.el('hire-availability-label') as HTMLInputElement).value).toBe('Open to FDE roles');
    H.click('hire-availability-clear');
    await H.settle();
    expect(mocked.setHireAvailability).toHaveBeenCalledWith(null);
    expect(H.el('hire-availability-message').textContent).toContain('Cleared');
  });

  it('saves the learner\'s own status and words, trimmed', async () => {
    mocked.fetchHireListingSettings.mockResolvedValue({ availability: null, spotlight: false });
    mocked.setHireAvailability.mockResolvedValue({ availability: { status: 'interviewing', label: 'Interviewing' }, spotlight: false });
    await render();
    expect(H.query('hire-availability-clear')).toBeNull(); // nothing set, nothing to clear
    H.setValue('hire-availability-kind', 'interviewing');
    H.setValue('hire-availability-label', '  Interviewing  ');
    H.click('hire-availability-save');
    await H.settle();
    expect(mocked.setHireAvailability).toHaveBeenCalledWith({ status: 'interviewing', label: 'Interviewing' });
  });

  it('will not save an empty label', async () => {
    mocked.fetchHireListingSettings.mockResolvedValue({ availability: null, spotlight: false });
    await render();
    expect((H.el('hire-availability-save') as HTMLButtonElement).disabled).toBe(true);
  });

  it('says so when a save fails, and keeps what the learner typed', async () => {
    mocked.fetchHireListingSettings.mockResolvedValue({ availability: null, spotlight: false });
    mocked.setHireAvailability.mockRejectedValue(new Error('500'));
    await render();
    H.setValue('hire-availability-label', 'Open');
    H.click('hire-availability-save');
    await H.settle();
    expect(H.el('hire-availability-message').textContent).toContain('did not save');
    expect((H.el('hire-availability-label') as HTMLInputElement).value).toBe('Open');
  });

  it('renders nothing when the learner has no portfolio page yet', async () => {
    mocked.fetchHireListingSettings.mockRejectedValue(Object.assign(new Error('404'), { response: { status: 404 } }));
    await render();
    expect(H.query('hire-availability-panel')).toBeNull();
  });
});
