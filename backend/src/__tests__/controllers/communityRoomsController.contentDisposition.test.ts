import http from 'http';
import { contentDispositionHeader } from '../../controllers/communityRoomsController';

/**
 * contentDispositionHeader — found live 2026-08-05: a recording titled
 * "July 2026 - AI Systems Architect — recording" (em-dash) crashed the
 * download route with Node's ERR_INVALID_CHAR, because HTTP header values
 * must be Latin-1 and the raw title was interpolated straight into
 * Content-Disposition. Session/room titles routinely carry em-dashes and
 * middle-dots ("Week 1 · Build Day — Foundations"), so this wasn't specific
 * to one recording — every download of a resource with such a title was
 * broken. The real regression test here is feeding the produced header
 * value into Node's actual header-validation path (http.OutgoingMessage),
 * not just asserting string shape, since that validation is the exact thing
 * that was throwing in production.
 */
function assertValidHeaderValue(value: string): void {
  const res = new http.OutgoingMessage();
  expect(() => res.setHeader('Content-Disposition', value)).not.toThrow();
}

describe('contentDispositionHeader', () => {
  it('produces a header Node accepts for a title containing an em-dash and middle-dot', () => {
    const header = contentDispositionHeader('July 2026 - AI Systems Architect — recording');
    assertValidHeaderValue(header);
    expect(header).toContain('filename="July 2026 - AI Systems Architect _ recording"');
    expect(header).toContain("filename*=UTF-8''July%202026%20-%20AI%20Systems%20Architect%20%E2%80%94%20recording");
  });

  it('produces a header Node accepts for a title with emoji and accented characters', () => {
    const header = contentDispositionHeader('Café Résumé 🎉.pdf');
    assertValidHeaderValue(header);
  });

  it('leaves a plain ASCII title unchanged in the fallback filename', () => {
    const header = contentDispositionHeader('Setup_Guide.pdf');
    expect(header).toBe(`attachment; filename="Setup_Guide.pdf"; filename*=UTF-8''Setup_Guide.pdf`);
  });

  it('strips quotes and CRLF from the fallback filename (header/response-splitting safety)', () => {
    const header = contentDispositionHeader('evil"\r\nX-Injected: true');
    assertValidHeaderValue(header);
    expect(header).not.toMatch(/[\r\n]/); // no raw CR/LF anywhere in the header
    // The fallback filename= value (between the first pair of quotes) must contain no embedded quote.
    const fallbackValue = header.match(/filename="([^]*?)"; filename\*=/)?.[1];
    expect(fallbackValue).toBe('evilX-Injected: true');
  });
});
