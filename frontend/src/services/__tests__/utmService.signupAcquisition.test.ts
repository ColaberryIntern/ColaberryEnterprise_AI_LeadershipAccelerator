/**
 * C94: capturing which ad and which placement, and turning stored UTM data into keys the strict signup route accepts.
 * R22: and sending `utm_medium` as its own key instead of packing it into `utm_source` as `fb|paid`.
 */
import {
  captureUTMFromURL, getUTMParams, getSignupAcquisitionFields, getUTMPayloadFields,
} from '../utmService';

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
  // R22: the medium is its own key. This test asserted `utm_source: 'ig|paid'` until then.
  it('sends the medium as its own field, never concatenated into the source', () => {
    store({ utmSource: 'ig', utmMedium: 'paid', utmCampaign: 'camp', utmContent: 'ad', utmTerm: 'set' });
    expect(getSignupAcquisitionFields()).toMatchObject({
      utm_source: 'ig', utm_medium: 'paid', utm_campaign: 'camp', utm_content: 'ad', utm_term: 'set',
    });
  });

  it('omits empty values: absent means not known, never an invented default', () => {
    store({ utmSource: 'fb', utmMedium: '', utmCampaign: '', utmContent: '', utmTerm: '' });
    const f = getSignupAcquisitionFields();
    expect(f.utm_source).toBe('fb');
    for (const k of ['utm_medium', 'utm_campaign', 'utm_content', 'utm_term'] as const) expect(f).not.toHaveProperty(k);
  });

  // R22. The old code read `utmMedium ? \`${utmSource || 'direct'}|${utmMedium}\` : ...`, so a medium
  // with no source invented the source "direct" and shipped it as `direct|paid`. A medium is not
  // evidence of a source, and this file's own rule is that absent means not known.
  it('a medium with no source reports the medium and claims no source', () => {
    store({ utmSource: '', utmMedium: 'paid', utmCampaign: 'c' });
    const f = getSignupAcquisitionFields();
    expect(f.utm_medium).toBe('paid');
    expect(f).not.toHaveProperty('utm_source');
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

  // C104: what production actually does. The ad lands on a builder page outside the app, so nothing ever calls
  // captureUTMFromURL and storage is empty when the signup page submits; the tags are only on its own URL.
  it('reads a real Meta ad URL on the signup page with storage empty', () => {
    window.history.replaceState({}, '', '/portal/signup?utm_medium=paid&utm_source=fb&utm_id=52708443249234&utm_content=52708445138434&utm_term=52708443249434&utm_campaign=52708443249234');
    expect(window.localStorage.getItem(KEY)).toBeNull();
    expect(getSignupAcquisitionFields()).toMatchObject({
      utm_source: 'fb', utm_medium: 'paid', utm_campaign: '52708443249234',
      utm_content: '52708445138434', utm_term: '52708443249434',
    });
  });

  it("the URL's tags win whole over an older stored visit; nothing is mixed from the two", () => {
    store({ utmSource: 'google', utmMedium: 'cpc', utmCampaign: 'old', utmContent: 'old-ad', utmTerm: 'old-set' });
    setUrl('?utm_source=ig&utm_campaign=new');
    const f = getSignupAcquisitionFields();
    expect(f).toMatchObject({ utm_source: 'ig', utm_campaign: 'new' });
    expect(f).not.toHaveProperty('utm_content');
    expect(f).not.toHaveProperty('utm_term');
    // The stored visit's `cpc` must not ride along with the URL's source either.
    expect(f).not.toHaveProperty('utm_medium');
  });

  it('a URL with no UTM tags falls back to storage', () => {
    store({ utmSource: 'fb', utmMedium: 'paid', utmCampaign: 'c', utmContent: 'ad', utmTerm: 'set' });
    setUrl('?fbclid=abc');
    expect(getSignupAcquisitionFields()).toMatchObject({
      utm_source: 'fb', utm_medium: 'paid', utm_content: 'ad', utm_term: 'set',
    });
  });

  it('with nothing stored, returns no UTM keys at all', () => {
    const f = getSignupAcquisitionFields();
    for (const k of ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term'] as const) {
      expect(f).not.toHaveProperty(k);
    }
  });
});

/**
 * R22: the guard, rather than one more example.
 *
 * Both payload builders used to pack the medium into the source with a pipe, and the cost was not
 * a wrong value but a wrong GROUP KEY: `fb` and `fb|paid` are two channels in every report that
 * groups on source, so one Facebook campaign drew as two lines and the packed one resolved no
 * spend. Asserting "no emitted value contains a pipe" catches the convention coming back by any
 * route, including a new field nobody thought to add an example for.
 */
describe('no payload field ever carries the packed source|medium shape', () => {
  const META_AD_URL =
    '/portal/signup?utm_medium=paid&utm_source=fb&utm_content=52708445138434'
    + '&utm_term=52708443249434&utm_campaign=52708443249234';

  it('getSignupAcquisitionFields emits no pipe, from the URL or from storage', () => {
    window.history.replaceState({}, '', META_AD_URL);
    for (const v of Object.values(getSignupAcquisitionFields())) expect(v).not.toContain('|');
    setUrl('');
    store({ utmSource: 'ig', utmMedium: 'paid', utmCampaign: 'c', utmContent: 'ad', utmTerm: 'set' });
    for (const v of Object.values(getSignupAcquisitionFields())) expect(v).not.toContain('|');
  });

  it('getUTMPayloadFields emits no pipe, and carries the medium separately', () => {
    store({ utmSource: 'fb', utmMedium: 'paid', utmCampaign: 'c' });
    const f = getUTMPayloadFields();
    expect(f).toMatchObject({ utm_source: 'fb', utm_medium: 'paid', utm_campaign: 'c' });
    for (const v of Object.values(f)) if (typeof v === 'string') expect(v).not.toContain('|');
  });

  it('getUTMPayloadFields omits what it does not know rather than inventing it', () => {
    const f = getUTMPayloadFields();
    for (const k of ['utm_source', 'utm_medium', 'utm_campaign'] as const) expect(f[k]).toBeUndefined();
    // page_url is always reported: it is this page, not a claim about where the visitor came from.
    expect(typeof f.page_url).toBe('string');
  });
});
