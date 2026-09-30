import * as fs from 'fs';
import * as path from 'path';

/**
 * Exactly one nginx server block may claim `default_server`, and it must be the platform.
 *
 * WHY THIS EXISTS. nginx serves the FIRST block it loads to any Host that matches no
 * `server_name`, and `conf.d` is included ALPHABETICALLY. `server_name _` is not a
 * catch-all — it is a name that never matches a real Host header — so the platform was
 * only ever the default by virtue of its file being called `default.conf` and sorting
 * first.
 *
 * On 2026-08-31, adding `aiflotation.conf` silently took that away: it sorts before
 * `default.conf`, so enterprise.colaberry.ai — which matches no explicit server_name —
 * began serving the AI Flotation page, and `/api/` returned 404. Production served the
 * wrong site until it was caught.
 *
 * Nothing failed at build or deploy time. `nginx -t` passes happily, every file is valid,
 * and the breakage is purely a consequence of filenames. That is what makes it worth a
 * test: the next brand config could be `abc.conf` and reintroduce it exactly.
 */

const NGINX_DIR = path.resolve(__dirname, '..', '..', '..', 'nginx');

/** Config files nginx actually loads into conf.d, per nginx/Dockerfile COPY lines. */
function shippedConfigs(): string[] {
  const dockerfile = fs.readFileSync(path.join(NGINX_DIR, 'Dockerfile'), 'utf8');
  const shipped: string[] = [];
  for (const m of dockerfile.matchAll(/^COPY\s+nginx\/(\S+\.conf)\s+\/etc\/nginx\/conf\.d\//gm)) {
    shipped.push(m[1]);
  }
  return shipped;
}

describe('nginx default server is explicit, not accidental', () => {
  const shipped = shippedConfigs();

  it('finds the shipped configs at all — a green run over nothing proves nothing', () => {
    expect(shipped.length).toBeGreaterThan(1);
    expect(shipped).toContain('nginx.conf');
  });

  it('exactly one shipped block declares default_server', () => {
    const declaring = shipped.filter((f) =>
      /listen\s+[^;]*\bdefault_server\b/.test(fs.readFileSync(path.join(NGINX_DIR, f), 'utf8')),
    );
    expect(declaring).toEqual(['nginx.conf']);
  });

  it('the platform config is the one that declares it', () => {
    // nginx.conf is copied to default.conf and serves the platform. If a brand config ever
    // claims default_server, every unmatched hostname lands on that brand instead.
    const platform = fs.readFileSync(path.join(NGINX_DIR, 'nginx.conf'), 'utf8');
    expect(platform).toMatch(/listen\s+80\s+default_server\s*;/);
  });

  it('brand configs name their hostnames explicitly and never rely on being first', () => {
    // Every non-platform config must carry a real server_name. A block with only
    // `server_name _` would be unreachable by name and could only ever be served by
    // winning the default — exactly the fragility this suite exists to prevent.
    const offenders: string[] = [];
    for (const f of shipped.filter((x) => x !== 'nginx.conf')) {
      const text = fs.readFileSync(path.join(NGINX_DIR, f), 'utf8');
      const names = [...text.matchAll(/^\s*server_name\s+([^;]+);/gm)].map((m) => m[1].trim());
      if (!names.length || names.every((n) => n === '_')) offenders.push(f);
    }
    expect(offenders).toEqual([]);
  });
});
