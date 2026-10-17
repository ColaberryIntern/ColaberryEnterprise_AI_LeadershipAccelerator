import fs from 'fs';
import path from 'path';

/**
 * Where CampusProvider is mounted matters (Campus C2). It must sit in the portal layout route,
 * beside <Outlet/> (PortalShell remounts on every navigation, so state cannot live there),
 * INSIDE ParticipantAuthProvider (it reads sign-in state to skip the flags request when nobody
 * is signed in). Read as text, like liveMiniPlayer's placement test.
 */
const SRC = fs.readFileSync(path.join(__dirname, '..', '..', '..', 'routes', 'portalRoutes.tsx'), 'utf8');

describe('CampusProvider placement in routes/portalRoutes.tsx', () => {
  it('is imported once and opened and closed exactly once', () => {
    expect(SRC).toContain("import { CampusProvider } from '../components/campus/CampusContext';");
    expect(SRC.split('<CampusProvider>').length - 1).toBe(1);
    expect(SRC.split('</CampusProvider>').length - 1).toBe(1);
  });

  it('wraps <Outlet /> and sits inside ParticipantAuthProvider', () => {
    const open = SRC.indexOf('<CampusProvider>');
    const close = SRC.indexOf('</CampusProvider>');
    const outlet = SRC.indexOf('<Outlet />');
    expect(open).toBeLessThan(outlet);
    expect(outlet).toBeLessThan(close);
    expect(SRC.indexOf('<ParticipantAuthProvider>')).toBeLessThan(open);
    expect(SRC.indexOf('</ParticipantAuthProvider>')).toBeGreaterThan(close);
  });
});
