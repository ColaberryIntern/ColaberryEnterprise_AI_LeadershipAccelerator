/**
 * W32: the client sign-in email. Escaped, on brand blue, plain words, no em dashes.
 */
import { buildEnterpriseClientLinkHtml } from '../emailService';

const LINK = 'https://enterprise.colaberry.ai/my-pilot/status?token=abc.def';

it('greets by first name, names the company, and links the button to the sign-in link', () => {
  const html = buildEnterpriseClientLinkHtml({ to: 'dana@acme.test', fullName: 'Dana Reyes', company: 'Acme Logistics', link: LINK });
  expect(html).toContain('Hi Dana,');
  expect(html).toContain('Acme Logistics');
  expect(html).toContain(`href="${LINK}"`);
  expect(html).toContain('works for 7 days');
  expect(html).not.toMatch(/[–—]/);
});

it('escapes what the visitor typed', () => {
  const html = buildEnterpriseClientLinkHtml({
    to: 'x@y.test',
    fullName: '<script>alert(1)</script>',
    company: '"><img src=x onerror=alert(1)>',
    link: 'https://enterprise.colaberry.ai/my-pilot/status?token="x"',
  });
  expect(html).not.toContain('<script>');
  expect(html).not.toContain('<img');
  expect(html).toContain('token=&quot;x&quot;');
});
