/**
 * C10: games never change learning points. No Game Room file, backend or frontend, may import the points service or the points ledger.
 */
import fs from 'fs';
import path from 'path';

const REPO = path.join(__dirname, '..', '..', '..', '..', '..');
const walk = (dir: string): string[] => (fs.existsSync(dir) ? fs.readdirSync(dir, { withFileTypes: true }).flatMap((d) =>
  d.isDirectory() ? (d.name === '__tests__' ? [] : walk(path.join(dir, d.name))) : [path.join(dir, d.name)]) : []);

const FILES = [
  ...walk(path.join(REPO, 'backend', 'src', 'services', 'gameRoom')),
  path.join(REPO, 'backend', 'src', 'routes', 'gameRoomRoutes.ts'),
  path.join(REPO, 'backend', 'src', 'models', 'GameScore.ts'),
  path.join(REPO, 'backend', 'src', 'db', 'ensureGameScoresSchema.ts'),
  ...walk(path.join(REPO, 'frontend', 'src', 'components', 'campus', 'games')),
  path.join(REPO, 'frontend', 'src', 'pages', 'portal', 'campus', 'GameRoomPage.tsx'),
].filter((f) => fs.existsSync(f) && /\.(ts|tsx)$/.test(f));

it('found the Game Room files', () => {
  expect(FILES.length).toBeGreaterThanOrEqual(6);
});

it.each(FILES.map((f) => [path.relative(REPO, f), f]))('%s never imports points', (_rel, f) => {
  const src = fs.readFileSync(f, 'utf8');
  expect(src).not.toMatch(/pointsService|StudentPointsEvent|student_points_events/);
});
