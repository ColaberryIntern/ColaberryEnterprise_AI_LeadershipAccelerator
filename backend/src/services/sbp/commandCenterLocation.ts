/**
 * WHERE the Command Center lives in a student's repo.
 *
 * ── THE DEFECT THIS MODULE EXISTS TO CLOSE ───────────────────────────────────
 *
 * The STORY-000 prompt ran to 26,055 characters and never once said where to
 * put the thing it described. A student's agent reasonably chose
 * `command-center/`, hosted it correctly, and GitHub served it at
 * `https://<owner>.github.io/<repo>/command-center/index.html` — 200, live,
 * exactly right. The platform probed the SITE ROOT, got a 404, logged
 * `sbp_pages_not_live`, and never wrote `command_center_url`. So a perfect build
 * on a working host produced no link in the portal and no explanation.
 *
 * Two halves failed, and only one of them is the authoritative fix:
 *
 *   (a) THE CONVENTION. Nothing told the student where to build, so twenty
 *       students would have picked twenty places — `docs/`, `site/`, `public/`,
 *       the root. A prober cannot guess its way out of that. The prompt now
 *       states the location, and it states it from THIS constant.
 *   (b) THE PROBE. It looked in one place and reported "your site is not live"
 *       — about a site that was live. Honest is: look in the documented place
 *       and the shapes already in the wild, and say in the log which URLs were
 *       actually tried.
 *
 * (a) is authoritative. A convention everyone follows beats a prober guessing,
 * and the probe list is deliberately SHORT rather than a net wide enough to
 * catch any layout.
 *
 * ── WHY THE REPO ROOT ────────────────────────────────────────────────────────
 *
 * GitHub Pages on a free public repo accepts exactly TWO source paths: `/` and
 * `/docs`. Nothing else can be the site root — `command-center/` cannot be
 * selected as a Pages source at all, which is why Ali's build could only ever
 * be reachable one directory down.
 *
 * Of those two, `/docs` is not available to the student: `docs/**` is inside the
 * platform's repo-write allowlist (see `repoWriter.ts`, which refuses to write
 * anywhere else), and `refreshRepoDocuments` rewrites `docs/REQUIREMENTS.md`,
 * `docs/STORIES.md`, `docs/TRACEABILITY.md` and `docs/stories/*.md` on every
 * sync. Hosting an app out of a directory the platform overwrites is a defect
 * waiting for its first sync.
 *
 * That leaves the root — which is also what Step 4 of the prompt already turns
 * on (`source[path]=/`), and what GitHub's Pages API reports back as
 * `html_url`, and therefore the address the portal links to. One location, no
 * translation anywhere in the chain.
 *
 * Pure constants and pure functions. No I/O, and deliberately no dependency on
 * the prompt module or the Pages service, so both can read this without either
 * one importing the other.
 */

/**
 * Site-relative directories a Command Center is looked for in, MOST CANONICAL
 * FIRST. `''` is the site root — the documented location, and the only one the
 * prompt teaches.
 *
 * `command-center/` is here for one reason and it is not "students might like
 * it there": builds made before the prompt said anything are already sitting in
 * it, and telling those students their live site is not live is the lie half of
 * this defect. It is a legacy shape, not a second convention — the prompt names
 * the root and only the root.
 */
export const COMMAND_CENTER_DIRS: readonly string[] = ['', 'command-center/'] as const;

/** The file a browser lands on. */
export const COMMAND_CENTER_ENTRY_FILE = 'index.html';

/**
 * The documented location as a repo path — `index.html`, because
 * `COMMAND_CENTER_DIRS[0]` is the root.
 *
 * DERIVED, not retyped. Reordering the probe list without meaning to would
 * change this string and break the test that pins the prompt to it, which is
 * the whole point: the two halves of this defect were born apart and must not
 * be allowed to drift apart again.
 */
export const COMMAND_CENTER_ENTRY_PATH = `${COMMAND_CENTER_DIRS[0]}${COMMAND_CENTER_ENTRY_FILE}`;

/**
 * The sentence the prompt renders verbatim. Distinctive enough that a test
 * asserting the prompt contains it cannot pass by coincidence.
 */
export const COMMAND_CENTER_ENTRY_RULE =
  `The entry point is \`${COMMAND_CENTER_ENTRY_PATH}\` at the ROOT of the repo`;

/**
 * Every URL worth asking, for one Pages site, in order of preference.
 *
 * `siteUrl` is the site ROOT — whatever GitHub reported as `html_url`, or the
 * derived `https://<owner>.github.io/<repo>/`. Custom domains work unchanged:
 * the prefixes are relative to whatever root came in.
 *
 * The root is always first, so a repo that follows the convention is recorded
 * at the address the portal would have linked to anyway and never picks up a
 * stray subdirectory URL.
 */
export function commandCenterProbeUrls(siteUrl: string): string[] {
  const base = siteUrl.endsWith('/') ? siteUrl : `${siteUrl}/`;
  return COMMAND_CENTER_DIRS.map((dir) => `${base}${dir}`);
}
