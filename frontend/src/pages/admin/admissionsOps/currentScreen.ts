import { matchPath } from 'react-router-dom';
import { OPS_BASE, SCREENS, type OpsScreen } from './screens';

/**
 * Which of the 16 screens a URL is, or null for a path inside the workspace that is not a screen.
 * Pure. Most specific match wins, so /students/123 is Student 360, not Students.
 */
export function currentScreen(pathname: string): OpsScreen | null {
  const clean = pathname.replace(/\/+$/, '') || '/';
  const ordered = [...SCREENS].sort((a, b) => b.path.length - a.path.length);
  for (const s of ordered) {
    const pattern = s.path ? `${OPS_BASE}/${s.path}` : OPS_BASE;
    if (matchPath({ path: pattern, end: true }, clean)) return s;
  }
  return null;
}
