import { maskEmail, redactForLogs, redactSensitive, redactObjectForLogs } from '../../utils/piiRedaction';

describe('piiRedaction (TBI audit P0-3)', () => {
  describe('redactSensitive — must strip identifiers that cannot leave our systems', () => {
    it('redacts SSNs', () => {
      expect(redactSensitive('SSN is 123-45-6789 ok')).toBe('SSN is [REDACTED-SSN] ok');
    });
    it('redacts payment-card numbers (16 digits, with or without spaces)', () => {
      expect(redactSensitive('card 4111 1111 1111 1111 end')).toBe('card [REDACTED-CARD] end');
      expect(redactSensitive('4111111111111111')).toBe('[REDACTED-CARD]');
    });
    it('does NOT strip names or emails (legitimate personalization)', () => {
      const t = 'Hi Jane Doe (jane@acme.com), welcome';
      expect(redactSensitive(t)).toBe(t);
    });
    it('leaves short digit runs (order ids) alone', () => {
      expect(redactSensitive('order 12345 shipped')).toBe('order 12345 shipped');
    });
    it('handles empty input', () => {
      expect(redactSensitive('')).toBe('');
    });
  });

  describe('redactForLogs — must mask PII written to logs', () => {
    it('masks emails to first-char + domain', () => {
      expect(redactForLogs('to jane@acme.com now')).toBe('to j***@acme.com now');
    });
    it('masks US phone numbers to last 4', () => {
      expect(redactForLogs('call (512) 555-1234')).toBe('call ***-***-1234');
      expect(redactForLogs('call +1 512-555-1234')).toBe('call ***-***-1234');
    });
  });

  describe('maskEmail', () => {
    it('keeps the first character and domain', () => {
      expect(maskEmail('alice@example.com')).toBe('a***@example.com');
    });
  });

  describe('redactObjectForLogs', () => {
    it('redacts string values and leaves non-strings', () => {
      const out = redactObjectForLogs({ email: 'bob@x.io', score: 42 });
      expect(out.email).toBe('b***@x.io');
      expect(out.score).toBe(42);
    });
  });
});
