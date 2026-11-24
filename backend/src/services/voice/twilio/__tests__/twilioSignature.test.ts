import { canonicalWebhookUrl, computeTwilioSignature, isValidTwilioSignature, signaturePayload } from '../twilioSignature';

/** The worked example on https://www.twilio.com/docs/usage/security (read 2026-11-24), verbatim. */
const DOC = {
  token: '12345',
  url: 'https://example.com/myapp.php?foo=1&bar=2',
  params: { Digits: '1234', To: '+18005551212', From: '+14158675310', Caller: '+14158675310', CallSid: 'CA1234567890ABCDE' },
  signature: 'L/OH5YylLD5NRKLltdqwSvS0BnU=',
};

describe('Twilio signature (VS2.1)', () => {
  it("reproduces Twilio's documented example exactly", () => {
    expect(signaturePayload(DOC.url, DOC.params)).toBe('https://example.com/myapp.php?foo=1&bar=2CallSidCA1234567890ABCDECaller+14158675310Digits1234From+14158675310To+18005551212');
    expect(computeTwilioSignature(DOC.token, DOC.url, DOC.params)).toBe(DOC.signature);
    expect(isValidTwilioSignature(DOC.token, DOC.url, DOC.params, DOC.signature)).toBe(true);
  });

  it.each([
    ['a tampered parameter', DOC.token, DOC.url, { ...DOC.params, Digits: '9999' }, DOC.signature],
    ['an added parameter', DOC.token, DOC.url, { ...DOC.params, Extra: 'x' }, DOC.signature],
    ['a tampered query string', DOC.token, 'https://example.com/myapp.php?foo=2&bar=2', DOC.params, DOC.signature],
    ['the wrong auth token', '54321', DOC.url, DOC.params, DOC.signature],
    ['a truncated signature', DOC.token, DOC.url, DOC.params, DOC.signature.slice(0, 10)],
    ['no signature header', DOC.token, DOC.url, DOC.params, undefined],
    ['no auth token configured (fail closed)', undefined, DOC.url, DOC.params, DOC.signature],
  ])('rejects %s', (_n, token, url, params, sig) => {
    expect(isValidTwilioSignature(token, url, params, sig)).toBe(false);
  });

  it('sorts case-sensitively (Unix order: uppercase before lowercase)', () => {
    expect(signaturePayload('u', { b: '1', B: '2', a: '3' })).toBe('uB2a3b1');
  });

  it('includes every value of a repeated key, in received order', () => {
    expect(signaturePayload('u', { StatusCallbackEvent: ['initiated', 'ringing'] })).toBe('uStatusCallbackEventinitiatedStatusCallbackEventringing');
  });

  describe('canonicalWebhookUrl', () => {
    it('takes the origin from config and the path+query from the request, byte for byte', () => {
      expect(canonicalWebhookUrl('https://enterprise.colaberry.ai', '/api/webhook/voice/twilio/status?ref=a.b%2Bc'))
        .toBe('https://enterprise.colaberry.ai/api/webhook/voice/twilio/status?ref=a.b%2Bc');
    });
    it('drops a port, as Twilio does for HTTPS voice callbacks', () => {
      expect(canonicalWebhookUrl('https://enterprise.colaberry.ai:8443', '/x')).toBe('https://enterprise.colaberry.ai/x');
    });
    it('ignores any path on the base (the request path is authoritative)', () => {
      expect(canonicalWebhookUrl('https://enterprise.colaberry.ai/ignored/', '/x?y=1')).toBe('https://enterprise.colaberry.ai/x?y=1');
    });
  });
});
