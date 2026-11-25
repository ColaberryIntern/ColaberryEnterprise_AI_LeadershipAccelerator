import {
  platformBuildFromDto, platformBuildChanged, usableLink, REFRESH_BEFORE_EXPIRY_MS, startsWithoutStory000,
} from '../platformBuildLinks';

const NOW = Date.parse('2026-11-24T12:00:00Z');
const inHours = (h: number) => new Date(NOW + h * 3600_000).toISOString();

const dto = (over: Record<string, unknown> = {}) => ({
  state: 'ready',
  command_center_url: '/api/platform-view/tok/',
  demo_url: '/api/platform-view/tok/demo/',
  command_center_version: 1,
  demo_version: 1,
  link_expires_at: inHours(12),
  ...over,
});

describe('platformBuildFromDto', () => {
  it('maps the server shape', () => {
    expect(platformBuildFromDto(dto())).toEqual({
      state: 'ready', commandCenterUrl: '/api/platform-view/tok/', demoUrl: '/api/platform-view/tok/demo/',
      commandCenterVersion: 1, demoVersion: 1, expiresAt: inHours(12),
    });
  });

  it('accepts only platform paths, so a bad response cannot plant a link', () => {
    const out = platformBuildFromDto(dto({ command_center_url: 'https://evil.example/', demo_url: 'javascript:alert(1)' }));
    expect(out?.commandCenterUrl).toBeNull();
    expect(out?.demoUrl).toBeNull();
  });

  it('treats an absent or unknown state as no build', () => {
    expect(platformBuildFromDto(undefined)).toBeNull();
    expect(platformBuildFromDto({ state: 'weird' })).toBeNull();
  });
});

describe('platformBuildChanged', () => {
  const held = platformBuildFromDto(dto())!;

  it('ignores a new signature on the same build, so syncs keep the fast path', () => {
    const next = platformBuildFromDto(dto({ command_center_url: '/api/platform-view/other/' }))!;
    expect(platformBuildChanged(held, next, NOW)).toBe(false);
  });

  it('adopts a new version, a new state, or the first build', () => {
    expect(platformBuildChanged(held, platformBuildFromDto(dto({ demo_version: 2 })), NOW)).toBe(true);
    expect(platformBuildChanged(held, platformBuildFromDto(dto({ state: 'failed' })), NOW)).toBe(true);
    expect(platformBuildChanged(null, held, NOW)).toBe(true);
    expect(platformBuildChanged(held, null, NOW)).toBe(true);
    expect(platformBuildChanged(null, null, NOW)).toBe(false);
  });

  it('replaces a held link that is within the refresh window of expiring', () => {
    const ageing = { ...held, expiresAt: new Date(NOW + REFRESH_BEFORE_EXPIRY_MS - 1).toISOString() };
    expect(platformBuildChanged(ageing, platformBuildFromDto(dto()), NOW)).toBe(true);
  });
});

describe('usableLink', () => {
  it('hides an expired link rather than opening a "not ready" page', () => {
    expect(usableLink('/x', inHours(1), NOW)).toBe('/x');
    expect(usableLink('/x', inHours(-1), NOW)).toBeNull();
    expect(usableLink('/x', null, NOW)).toBeNull();
    expect(usableLink(null, inHours(1), NOW)).toBeNull();
  });
});

describe('startsWithoutStory000', () => {
  const lists = (...ids: string[]) => [{ tasks: ids.map((storyId) => ({ storyId })) }];
  const platformBuild = platformBuildFromDto(dto());

  it('needs both the platform build and a loaded board with no Story 000', () => {
    expect(startsWithoutStory000({ platformBuild, lists: lists('STORY-001') })).toBe(true);
    expect(startsWithoutStory000({ platformBuild, lists: lists('STORY-000', 'STORY-001') })).toBe(false);
    expect(startsWithoutStory000({ platformBuild: null, lists: lists('STORY-001') })).toBe(false);
    expect(startsWithoutStory000({ platformBuild, lists: [] })).toBe(false);
    expect(startsWithoutStory000(undefined)).toBe(false);
  });
});
