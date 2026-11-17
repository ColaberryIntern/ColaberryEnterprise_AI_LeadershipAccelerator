import React from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import { MemoryRouter } from 'react-router-dom';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

/**
 * /book gives the e-book for a form. Ali, 2026-11-17: "We can give them a free
 * electronic copy but not the paperback. Make them fill out a form for it and it
 * should go in as a Trust before Intelligence brand lead."
 *
 * What this pins:
 *  1. No download until the form is sent: the link is not on the page before.
 *  2. The lead is the Trust Before Intelligence brand: `source` is the string that
 *     leadSourceGroups files under that label (checked against the backend file, so
 *     a rename on either side fails here).
 *  3. Consent is required and not pre-ticked, as on every other public form.
 *  4. The page never says "free" (site copy rule), and offers no paperback.
 */
jest.mock('../../../utils/api', () => ({
  __esModule: true,
  default: { post: jest.fn() },
}));
jest.mock('../../../services/utmService', () => ({ getUTMParams: () => ({}) }));
jest.mock('../../../utils/tracker', () => ({ identifyVisitor: jest.fn() }));

/* eslint-disable import/first */
import fs from 'fs';
import path from 'path';
import api from '../../../utils/api';
import { BookV2, EBOOK_LEAD_SOURCE, EBOOK_URL } from '../BookV2';
/* eslint-enable import/first */

const post = api.post as jest.Mock;

let host: HTMLDivElement;
let root: Root;

beforeEach(() => {
  post.mockReset();
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
  act(() => {
    root.render(
      <MemoryRouter initialEntries={['/book']}>
        <BookV2 />
      </MemoryRouter>,
    );
  });
});

afterEach(() => {
  act(() => root.unmount());
  host.remove();
});

const q = <T extends Element>(sel: string): T => host.querySelector(sel) as T;

/** React tracks input values itself; set through the native setter so onChange fires. */
function type(sel: string, value: string): void {
  const el = q<HTMLInputElement>(sel);
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
  act(() => {
    setter.call(el, value);
    el.dispatchEvent(new Event('input', { bubbles: true }));
  });
}

async function submit(): Promise<void> {
  await act(async () => {
    q<HTMLFormElement>('#cbv2-book-copy form').dispatchEvent(
      new Event('submit', { bubbles: true, cancelable: true }),
    );
  });
}

const downloadLink = (): HTMLAnchorElement | null => host.querySelector(`a[href="${EBOOK_URL}"]`);

describe('/book e-book form', () => {
  it('shows no download before the form is sent', () => {
    expect(downloadLink()).toBeNull();
    expect(host.innerHTML).not.toContain(EBOOK_URL);
  });

  it('does not send without a name, an email and the consent tick', async () => {
    expect(q<HTMLInputElement>('#bk-consent').checked).toBe(false);
    await submit();
    expect(post).not.toHaveBeenCalled();
    expect(host.textContent).toContain('Please tell us your name');
    expect(host.textContent).toContain('Please give us a work email');
    expect(host.textContent).toContain('You must agree to be contacted');
    expect(downloadLink()).toBeNull();
  });

  it('sends a Trust Before Intelligence lead, then shows the download', async () => {
    post.mockResolvedValue({ data: { leadId: 1 } });
    type('#bk-name', 'Dana Reader');
    type('#bk-email', 'dana@example.com');
    type('#bk-company', 'Acme');
    type('#bk-role', 'COO');
    act(() => q<HTMLInputElement>('#bk-consent').click());
    await submit();

    expect(post).toHaveBeenCalledTimes(1);
    const [url, body] = post.mock.calls[0];
    expect(url).toBe('/api/leads');
    expect(body).toMatchObject({
      name: 'Dana Reader',
      email: 'dana@example.com',
      company: 'Acme',
      title: 'COO',
      source: 'trustbeforeintelligence',
      form_type: 'book_ebook_request',
      consent_contact: true,
    });

    const link = downloadLink();
    expect(link).not.toBeNull();
    expect(link!.hasAttribute('download')).toBe(true);
  });

  it('keeps the form, with an error, when the send fails', async () => {
    post.mockRejectedValue(new Error('network'));
    type('#bk-name', 'Dana Reader');
    type('#bk-email', 'dana@example.com');
    act(() => q<HTMLInputElement>('#bk-consent').click());
    await submit();
    expect(downloadLink()).toBeNull();
    expect(host.textContent).toContain('That did not send');
  });
});

describe('/book e-book wiring', () => {
  it('uses the source string the backend files under Trust Before Intelligence', () => {
    const groups = fs.readFileSync(
      path.join(__dirname, '..', '..', '..', '..', '..', 'backend', 'src', 'services', 'leads', 'leadSourceGroups.ts'),
      'utf8',
    );
    const block = groups.slice(groups.indexOf("label: 'Trust Before Intelligence'"));
    expect(block.slice(0, 300)).toContain(`sources: ['${EBOOK_LEAD_SOURCE}']`);
  });

  it('serves the file outside /book/, which would shadow the page route', () => {
    expect(EBOOK_URL.startsWith('/book/')).toBe(false);
    expect(EBOOK_URL).toMatch(/\.pdf$/);
  });

  it('never says "free" and offers no paperback', () => {
    const text = host.textContent ?? '';
    expect(text).not.toMatch(/\bfree\b/i);
    expect(text).toContain('The paperback is not part of this offer.');
  });
});
