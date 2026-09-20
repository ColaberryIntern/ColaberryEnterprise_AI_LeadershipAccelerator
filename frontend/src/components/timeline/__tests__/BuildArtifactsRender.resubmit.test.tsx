import React from 'react';
import { createRoot, Root } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import BuildArtifactsRender from '../BuildArtifactsRender';

jest.mock('../../../utils/portalApi', () => ({ __esModule: true, default: { post: jest.fn(), get: jest.fn() } }));

import portalApi from '../../../utils/portalApi';

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root | null = null;
// CRA's jest config sets resetMocks, which wipes an implementation given in
// the mock factory. Set it per test or the component's project fetch returns
// undefined and every case dies inside useEffect.
beforeEach(() => {
  (portalApi.get as jest.Mock).mockResolvedValue({ data: { projects: [] } });
  (portalApi.post as jest.Mock).mockResolvedValue({ data: {} });
  container = document.createElement('div'); document.body.appendChild(container);
});
afterEach(() => { act(() => root?.unmount()); root = null; container.remove(); });

const BODY = '<h3>Artifact 1</h3><pre>build this</pre>';

function mount(completed: boolean) {
  act(() => {
    const r = createRoot(container);
    root = r;
    r.render(<BuildArtifactsRender bodyHtml={BODY} title="Build" summary="s" variant="drawer" cardId="c1" completed={completed} onComplete={jest.fn()} />);
  });
}

const fileInputs = () => Array.from(container.querySelectorAll('input[type="file"]'));
const buttonText = () => Array.from(container.querySelectorAll('button')).map((b) => b.textContent || '').join(' | ');

// A learner submitted after step 1 of a seven-step build task, and the upload
// control vanished with the card marked complete. She had to email and wait for
// a manual re-open. The completed state already claimed she could keep building.
describe('a submitted build card can still take another file', () => {
  it('offers an upload control after completion, and says what it does to points', () => {
    mount(true);
    expect(container.textContent).toContain('Build submitted');
    expect(buttonText()).toContain('Upload another file');
    expect(fileInputs()).toHaveLength(1);
    expect(container.textContent).toContain('your points do not change');
    expect(container.textContent).toMatch(/Submitted before you were finished, or uploaded the wrong file/);
  });

  it('the completed state no longer promises more building without offering it', () => {
    mount(true);
    const promises = container.textContent || '';
    expect(promises).toContain('keep building more artifacts');
    expect(container.querySelector('.ba-again')).not.toBeNull();
  });

  it('an unsubmitted card is unchanged: no re-upload block before the copy gate is met', () => {
    mount(false);
    expect(container.querySelector('.ba-again')).toBeNull();
    expect(buttonText()).not.toContain('Upload another file');
  });
});
