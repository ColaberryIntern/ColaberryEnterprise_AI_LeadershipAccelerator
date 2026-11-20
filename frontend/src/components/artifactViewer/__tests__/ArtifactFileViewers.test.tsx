import React from 'react';
import { createRoot, Root } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import { ArtifactFileViewer, KIND_STYLE } from '../ArtifactFileViewers';
import type { ArtifactFile, ArtifactSource } from '../../../services/artifactViewerTypes';

/**
 * The two kinds that used to open nowhere (Ali, 15 Nov 2026: "I can't see an image here - the html
 * viewer isn't working either").
 *
 * An image fell through to the download button, so an intern's infographic was a button. An .html
 * page was classified as text, so the viewer printed its SOURCE under "Markdown/text: wrong format"
 * - telling the intern to convert the exact format the Internship Report asks them to produce.
 *
 * Same react-dom/client + act convention as the studio tests (no RTL in this repo).
 */

let container: HTMLDivElement; let root: Root;
async function render(node: React.ReactElement): Promise<void> { await act(async () => { root.render(node); }); }

beforeEach(() => {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  (global as unknown as { URL: typeof URL }).URL.createObjectURL = jest.fn(() => 'blob:fake');
  (global as unknown as { URL: typeof URL }).URL.revokeObjectURL = jest.fn();
});
afterEach(async () => { await act(async () => { root.unmount(); }); container.remove(); jest.restoreAllMocks(); });

const file = (over: Partial<ArtifactFile>): ArtifactFile =>
  ({ name: 'x', kind: 'other', available: true, text: null, table: null, note: null, ...over });

const source = (over: Partial<ArtifactSource> = {}): ArtifactSource => ({
  file: jest.fn(async () => new Blob(['bytes'])),
  preview: jest.fn(async () => '<p>preview</p>'),
  xlsx: jest.fn(async () => new Blob([''])),
  ...over,
});

describe('image artifacts', () => {
  it('paints the picture in the page instead of offering only a download', async () => {
    const s = source();
    await render(<ArtifactFileViewer id="a1" file={file({ name: 'Municipal_Briefing.png', kind: 'image' })} source={s} />);
    const img = container.querySelector('img');
    expect(img).not.toBeNull();
    expect(img?.getAttribute('alt')).toBe('Municipal_Briefing.png');
    expect(img?.getAttribute('src')).toBe('blob:fake');
  });

  it('re-labels the Blob by extension, because the file route sends every non-PDF as octet-stream', async () => {
    const s = source();
    await render(<ArtifactFileViewer id="a1" file={file({ name: 'shot.JPG', kind: 'image' })} source={s} />);
    expect(s.file).toHaveBeenCalledWith('a1', 'image/jpeg');
  });

  it('keeps the download, and says so, when the bytes cannot be fetched', async () => {
    const s = source({ file: jest.fn(async () => { throw new Error('nope'); }) });
    await render(<ArtifactFileViewer id="a1" file={file({ name: 'a.png', kind: 'image' })} source={s} />);
    expect(container.textContent).toContain('Could not load this image.');
    expect(container.querySelector('button')).not.toBeNull();
  });
});

describe('html artifacts', () => {
  const page = '<!doctype html><title>Field guide</title><p>hello';

  it('renders the page, in a sandbox with nothing enabled', async () => {
    await render(<ArtifactFileViewer id="a2" file={file({ name: 'guide.html', kind: 'html', text: page })} source={source()} />);
    const frame = container.querySelector('iframe');
    expect(frame).not.toBeNull();
    expect(frame?.getAttribute('srcdoc')).toBe(page);
    // Empty sandbox: no scripts, no same-origin, no forms, no popups. The attribute must EXIST and be empty.
    expect(frame?.getAttribute('sandbox')).toBe('');
  });

  it('never prints the markup as source, and never calls it the wrong format', async () => {
    await render(<ArtifactFileViewer id="a2" file={file({ name: 'guide.html', kind: 'html', text: page })} source={source()} />);
    expect(container.querySelector('pre')).toBeNull();
    expect(container.textContent).not.toContain('wrong format');
    expect(container.textContent).toContain('Web page');
  });

  it('offers the download when the page was too large to read', async () => {
    await render(<ArtifactFileViewer id="a2" file={file({ name: 'big.html', kind: 'html', text: null, note: 'file too large to show' })} source={source()} />);
    expect(container.querySelector('iframe')).toBeNull();
    expect(container.textContent).toContain('file too large to show');
  });

  it('is badged like the Internship Report chip, not like markdown', () => {
    expect(KIND_STYLE.html.label).toBe('Web page');
    expect(KIND_STYLE.text.label).toContain('wrong format');
  });
});
