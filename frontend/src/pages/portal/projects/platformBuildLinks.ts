/**
 * platformBuildLinks - the Command Center and Demo the platform built for a project. PURE.
 *
 * L13.1. The server hosts both and hands the portal a signed link on every project read. The link
 * is new on every read (it carries its own expiry), so comparing URLs would make every sync look
 * like a change and defeat the projects store's same-reference fast path. `platformBuildChanged`
 * compares what actually matters instead: whether there is a build, its state and versions, and
 * whether the link we hold is close enough to expiring that it should be replaced.
 */

export interface PlatformBuildLinks {
  state: 'building' | 'ready' | 'failed';
  commandCenterUrl: string | null;
  demoUrl: string | null;
  commandCenterVersion: number | null;
  demoVersion: number | null;
  /** ISO time the links stop working. */
  expiresAt: string | null;
}

/** The server's shape (`ProjectTreeDto.platform_build`). Absent on older servers. */
export interface PlatformBuildDto {
  state?: string;
  command_center_url?: string | null;
  demo_url?: string | null;
  command_center_version?: number | null;
  demo_version?: number | null;
  link_expires_at?: string | null;
}

/** Replace a held link this long before it expires. The server mints 12-hour links. */
export const REFRESH_BEFORE_EXPIRY_MS = 6 * 60 * 60 * 1000;

/** Only same-origin platform paths are accepted, so a malformed response cannot plant a link. */
const isPlatformPath = (u: unknown): u is string => typeof u === 'string' && u.startsWith('/api/platform-view/');

export function platformBuildFromDto(dto: PlatformBuildDto | null | undefined): PlatformBuildLinks | null {
  if (!dto || (dto.state !== 'building' && dto.state !== 'ready' && dto.state !== 'failed')) return null;
  return {
    state: dto.state,
    commandCenterUrl: isPlatformPath(dto.command_center_url) ? dto.command_center_url : null,
    demoUrl: isPlatformPath(dto.demo_url) ? dto.demo_url : null,
    commandCenterVersion: typeof dto.command_center_version === 'number' ? dto.command_center_version : null,
    demoVersion: typeof dto.demo_version === 'number' ? dto.demo_version : null,
    expiresAt: typeof dto.link_expires_at === 'string' ? dto.link_expires_at : null,
  };
}

export function platformBuildChanged(
  held: PlatformBuildLinks | null | undefined,
  next: PlatformBuildLinks | null,
  nowMs: number = Date.now(),
): boolean {
  if (!held || !next) return Boolean(held) !== Boolean(next);
  if (held.state !== next.state
    || held.commandCenterVersion !== next.commandCenterVersion
    || held.demoVersion !== next.demoVersion
    || Boolean(held.commandCenterUrl) !== Boolean(next.commandCenterUrl)
    || Boolean(held.demoUrl) !== Boolean(next.demoUrl)) return true;
  if (!held.commandCenterUrl) return false;
  const expires = held.expiresAt ? Date.parse(held.expiresAt) : NaN;
  return !Number.isFinite(expires) || expires - nowMs < REFRESH_BEFORE_EXPIRY_MS;
}

/** A held link that has expired is not shown: it would only open a "not ready" page. */
export function usableLink(url: string | null | undefined, expiresAt: string | null | undefined, nowMs: number = Date.now()): string | null {
  if (!url) return null;
  const expires = expiresAt ? Date.parse(expiresAt) : NaN;
  return Number.isFinite(expires) && expires > nowMs ? url : null;
}
