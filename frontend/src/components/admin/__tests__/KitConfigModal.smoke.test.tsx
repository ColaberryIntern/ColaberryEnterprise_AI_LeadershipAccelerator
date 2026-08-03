import React from 'react';
import { createRoot } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import { MemoryRouter } from 'react-router-dom';
import KitConfigModal from '../KitConfigModal';
import { KitConfig, KitConfigDefaults } from '../kitConfig/types';

/**
 * classkit-live-polish (T006). A genuine mounted render (not just
 * `renderToStaticMarkup`, which never fires `useEffect` and so never gets
 * past this component's "Loading configuration…" state) proving
 * `initialCategory` actually drives which category panel opens.
 */

jest.mock('../../../utils/api', () => ({
  __esModule: true,
  default: { get: jest.fn(), put: jest.fn(), post: jest.fn() },
}));
// eslint-disable-next-line @typescript-eslint/no-var-requires
const api = require('../../../utils/api').default;

const emptyCA = { enabled: true, max: null, overrides: null };
const config: KitConfig = {
  storyBeats: emptyCA, theaterEnabled: true, buildBayDetail: false, evidenceOverrides: null,
  teach: emptyCA, prompts: emptyCA, interactions: emptyCA,
  opening: { coldOpen: { enabled: false, override: null }, hook: { enabled: false, override: null }, resultPreview: { enabled: false, override: null } },
};
const defaults: KitConfigDefaults = {
  dayKind: 'architecture', week: 2, teach: [], prompts: [], interactions: [], storyBeats: [], evidence: [],
  opening: { coldOpen: null, hook: null, resultPreview: null }, checkpoints: [], breakSegment: null, segments: [],
};

async function mount(initialCategory?: 'storyBeats' | 'teach') {
  (api.get as jest.Mock).mockResolvedValue({ data: { config, defaults } });
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  await act(async () => {
    root.render(
      <MemoryRouter>
        <KitConfigModal sessionId="s1" sessionTitle="Week 2" onClose={() => {}} showToast={() => {}} initialCategory={initialCategory} />
      </MemoryRouter>,
    );
    // Flush the resolved api.get() microtask + the resulting re-render.
    await Promise.resolve();
    await Promise.resolve();
  });
  const html = container.innerHTML;
  root.unmount();
  document.body.removeChild(container);
  return html;
}

describe('KitConfigModal initialCategory (classkit-live-polish T006)', () => {
  it('defaults to the Story Beats tab when initialCategory is omitted', async () => {
    const html = await mount(undefined);
    const storyBeatsNav = html.slice(html.indexOf('Story Beats') - 60, html.indexOf('Story Beats'));
    expect(storyBeatsNav).toContain('active');
  });

  it('opens on the Lessons tab when initialCategory="teach" is passed', async () => {
    const html = await mount('teach');
    const lessonsNav = html.slice(html.indexOf('Lessons') - 60, html.indexOf('Lessons'));
    expect(lessonsNav).toContain('active');
    // And Story Beats must NOT be the active one in this case.
    const storyBeatsNav = html.slice(html.indexOf('Story Beats') - 60, html.indexOf('Story Beats'));
    expect(storyBeatsNav).not.toContain('active');
  });
});
