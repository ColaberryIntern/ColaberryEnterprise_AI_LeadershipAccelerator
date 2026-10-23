import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import AccountArtifactsCard from '../AccountArtifactsCard';

/**
 * C8.5 acceptance: "Links only, no duplication."
 *
 * `renderToStaticMarkup` never runs effects, so this exercises the card's initial render
 * only. That is enough for the assertion that matters most here, which is about what the
 * card must NEVER contain: a way to put a document into the app. A file input on this
 * card would be the "second canonical location" the ticket forbids, and it would be
 * invisible to any test that only checked the happy path.
 */
function render() {
  return renderToStaticMarkup(
    <MemoryRouter><AccountArtifactsCard organizationId="org-1" /></MemoryRouter>,
  );
}

describe('AccountArtifactsCard', () => {
  it('renders without crashing before any data arrives', () => {
    expect(() => render()).not.toThrow();
  });

  it('OFFERS NO WAY TO UPLOAD A DOCUMENT', () => {
    // The structural guarantee. The card takes a URL; it does not take a file.
    const html = render();
    expect(html).not.toMatch(/type="file"/);
    expect(html).not.toMatch(/enctype="multipart\/form-data"/);
    expect(html).not.toMatch(/<input[^>]*accept=/);
  });

  it('says plainly that it stores nothing', () => {
    // The reader needs to know these are pointers, or they will assume the app has a
    // copy and stop opening the canonical one.
    const html = render();
    expect(html).toContain('data-testid="artifacts-links-only-note"');
    expect(html).toMatch(/Nothing is stored here/);
  });

  it('asks for a canonical URL, which is the whole mechanism', () => {
    const html = render();
    expect(html).toContain('Canonical URL');
    expect(html).toContain('id="artifact-url"');
  });

  it('offers exactly the seven artifact kinds C8.5 names', () => {
    const html = render();
    for (const label of ['Deck', 'Research', 'Account brief', 'Proposal',
      'Contract', 'Pilot outcome', 'Case study']) {
      expect(html).toContain(`>${label}</option>`);
    }
    expect((html.match(/<option /g) || [])).toHaveLength(7);
  });

  it('disables the submit until a title and a URL are both present', () => {
    // Guards the empty-row case without needing the effect to run.
    expect(render()).toMatch(/<button[^>]*type="submit"[^>]*disabled/);
  });
});
