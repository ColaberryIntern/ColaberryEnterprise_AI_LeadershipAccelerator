import { initialTab } from '../PortfolioPage';

/** The interview emails link to /portal/portfolio?tab=hire; anything else opens Overview. */
describe('initialTab', () => {
  it('opens a named tab', () => {
    expect(initialTab('?tab=hire')).toBe('hire');
    expect(initialTab('?x=1&tab=publishing')).toBe('publishing');
  });

  it('falls back to Overview for no tab, an unknown one, or junk', () => {
    expect(initialTab('')).toBe('overview');
    expect(initialTab('?tab=admin')).toBe('overview');
    expect(initialTab('?tab=%3Cscript%3E')).toBe('overview');
  });
});
