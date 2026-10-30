/**
 * C94: capturing which ad and which placement, and turning stored UTM data into keys the strict signup route accepts.
 */
import { captureUTMFromURL, getUTMParams, getSignupAcquisitionFields } from '../utmService';

const KEY = 'cb_utm_params';
const store = (v: Record<string, string>) => window.localStorage.setItem(KEY, JSON.stringify({ storedAt: new Date().toISOString(), ...v }));
const setUrl = (search: string) => window.history.replaceState({}, '', `/lp/x${search}`);

afterEach(() => { window.localStorage.clear(); setUrl(''); });

describe('captureUTMFromURL', () => {
  it('stores utm_content and utm_term alongside source, medium and campaign (a real Meta ad link)', () => {
    setUrl('?fbclid=abc&utm_medium=paid&utm_source=fb&utm_id=1&utm_content=52708445138434&utm_term=52708443249434&utm_campaign=52708443249234');
    captureUTMFromURL();
    expect(getUTMParams()).toMatchObject({
      utmSource: 'fb', utmMedium: 'paid', utmCampaign: '52708443249234', utmContent: '52708445138434', utmTerm: '52708443249434',
    });
  });

  it('a link carrying only utm_content still counts as an ad visit and is stored', () => {
    setUrl('?utm_content=ad-7');
    captureUTMFromURL();
    expect(getUTMParams().utmContent).toBe('ad-7');
  });

  it('an entry stored before C94 (no content or term) still reads, with them empty', () => {
    store({ utmSource: 'fb', utmCampaign: 'c', utmMedium: 'paid' });
    expect(getUTMParams()).toMatchObject({ utmSource: 'fb', utmContent: '', utmTerm: '' });
  });
});

describe('getSignupAcquisitionFields', () => {
  it('uses the source|medium convention every other lead form uses, plus ad and placement', () => {
    store({ utmSource: 'ig', utmMedium: 'paid', utmCampaign: 'camp', utmContent: 'ad', utmTerm: 'set' });
    expect(getSignupAcquisitionFields()).toMatchObject({
      utm_source: 'ig|paid', utm_campaign: 'camp', utm_content: 'ad', utm_term: 'set',
    });
  });

  it('omits empty values: absent means not known, never an invented default', () => {
    store({ utmSource: 'fb', utmMedium: '', utmCampaign: '', utmContent: '', utmTerm: '' });
    const f = getSignupAcquisitionFields();
    expect(f.utm_source).toBe('fb');
    for (const k of ['utm_campaign', 'utm_content', 'utm_term'] as const) expect(f).not.toHaveProperty(k);
  });

  it('omits a value longer than the server cap (255) rather than sending one the strict route would reject', () => {
    store({ utmSource: 'fb', utmMedium: '', utmCampaign: 'c', utmContent: 'x'.repeat(256), utmTerm: 'x'.repeat(255) });
    const f = getSignupAcquisitionFields();
    expect(f).not.toHaveProperty('utm_content');
    expect(f.utm_term).toHaveLength(255);
  });

  it('sends page_url only when it is http(s) and within 500 characters', () => {
    setUrl('?a=1');
    expect(getSignupAcquisitionFields().page_url).toMatch(/^http:\/\/localhost\/lp\/x\?a=1$/);
    setUrl(`?long=${'y'.repeat(600)}`);
    expect(getSignupAcquisitionFields()).not.toHaveProperty('page_url');
  });

  it('with nothing stored, returns no UTM keys at all', () => {
    const f = getSignupAcquisitionFields();
    for (const k of ['utm_source', 'utm_campaign', 'utm_content', 'utm_term'] as const) expect(f).not.toHaveProperty(k);
  });
});
