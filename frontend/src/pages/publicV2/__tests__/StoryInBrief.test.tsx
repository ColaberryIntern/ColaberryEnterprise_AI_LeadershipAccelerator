import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import StoryInBrief from '../StoryInBrief';

const beats = [
  { label: 'Before', text: 'The funnel report was read once and trusted for months.' },
  { label: 'What we built', text: 'A weekly report that names one move.' },
  { label: 'What happened', text: 'Each edition grades the last move.' },
  { label: 'Why it matters', text: 'The reporting grows with every decision.' },
];

function dom(html: string): HTMLElement {
  const host = document.createElement('div');
  host.innerHTML = html;
  return host;
}

describe('StoryInBrief', () => {
  it('draws every beat, numbered, in order, under one heading', () => {
    const host = dom(renderToStaticMarkup(<StoryInBrief beats={beats} />));
    expect(host.querySelector('h2')?.textContent).toBe('The story in brief');
    const items = Array.from(host.querySelectorAll('li'));
    expect(items).toHaveLength(4);
    expect(items[0].textContent).toContain('1Before');
    expect(items[3].textContent).toContain('Why it matters');
  });

  it('draws nothing for a record without beats', () => {
    expect(renderToStaticMarkup(<StoryInBrief beats={[]} />)).toBe('');
  });

  it('is not one of the page sections the suite counts', () => {
    const host = dom(renderToStaticMarkup(<StoryInBrief beats={beats} />));
    const band = host.querySelector('[data-testid="story-in-brief"]');
    expect(band).not.toBeNull();
    expect(band?.hasAttribute('data-section')).toBe(false);
  });
});
