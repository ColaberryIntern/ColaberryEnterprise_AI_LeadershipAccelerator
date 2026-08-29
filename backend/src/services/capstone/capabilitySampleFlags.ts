/**
 * capabilitySampleFlags — did they build this against the SAMPLE, or their own project?
 *
 * ## Why this is not in the repo reader
 *
 * `capabilityRepoReader` observes a committed file tree, and a file tree cannot carry
 * this fact. `inbox/` looks identical whether the workflow assistant was pointed at the
 * provided sample inbox or at the student's own. The distinction lives on the artifact
 * row, which records `built_on_sample` at submission time.
 *
 * So the capability band shipped with `on_sample` documented, rendered and tested, and
 * nothing anywhere able to set it — the flag was unreachable. This is the join that
 * reaches it, and it stays here rather than in the reader because it is artifact
 * evidence, not repository evidence.
 *
 * ## Why it can say `false`, unlike the rest of the inventory
 *
 * `count` and `proven` RATCHET: they are credit, and credit must not evaporate because
 * a repo read failed or a student moved a folder.
 *
 * `on_sample` is not credit. It is a CAVEAT, and it runs the other way. A student who
 * starts on the sample in week 3 and later rebuilds on their own project has earned the
 * removal of that caveat, and latching the first `true` forever would brand them for
 * work they went back and redid. `mergeInventory` already honours an explicit `false`
 * as "rebuilt on the real project, and it never goes back" — this module is what
 * produces that `false`.
 *
 * ## Absence of evidence is not evidence
 *
 * The three-way return is the point. `undefined` means NO artifact for this capability's
 * weeks said either way, and it must not collapse into `false`: a student who has not
 * uploaded anything yet would otherwise have a previously-disclosed sample build quietly
 * cleared by silence. Only an artifact that actually says `built_on_sample: false`
 * earns the clearing.
 *
 * PURE. No I/O, no clock.
 */
import { capabilityById } from '../sbp/capabilityInventory';

/** The two fields this join needs from an artifact row's `content`. */
export interface ArtifactSampleRow {
  week?: unknown;
  built_on_sample?: unknown;
}

/** Weeks with an artifact that made a claim, split by which claim it made. */
export interface SampleWeeks {
  sample: Set<number>;
  own: Set<number>;
}

/**
 * Split the artifact rows into the weeks that claim a sample build and the weeks that
 * claim an own-project build. A week with neither appears in neither set.
 *
 * `built_on_sample` is compared with `=== true` / `=== false` rather than for
 * truthiness, so a row that omits the field, or carries a string, makes no claim at all
 * and leaves the week undecided.
 */
export function sampleWeeks(rows: ArtifactSampleRow[]): SampleWeeks {
  const sample = new Set<number>();
  const own = new Set<number>();
  if (!Array.isArray(rows)) return { sample, own };

  for (const row of rows) {
    if (!row || typeof row !== 'object') continue;
    const week = row.week;
    if (typeof week !== 'number' || !Number.isFinite(week)) continue;
    if (row.built_on_sample === true) sample.add(week);
    else if (row.built_on_sample === false) own.add(week);
  }
  return { sample, own };
}

/**
 * Build the per-capability lookup.
 *
 * A capability spans weeks (`MCP_SERVER` is weeks 5 and 6), so a single sample week
 * anywhere in its span makes the whole capability a sample build. Sample WINS a tie:
 * where one week says sample and another says own, disclosing is the safe direction,
 * and the alternative is a page that quietly drops a caveat the evidence supports.
 *
 * Returns a closure so the sets are built once per compile rather than per capability.
 */
export function sampleFlagReader(
  rows: ArtifactSampleRow[],
): (capabilityId: string) => boolean | undefined {
  const weeks = sampleWeeks(rows);

  return (capabilityId: string): boolean | undefined => {
    const def = capabilityById(capabilityId);
    if (!def || !Array.isArray(def.weeks) || def.weeks.length === 0) return undefined;
    if (def.weeks.some((w) => weeks.sample.has(w))) return true;
    if (def.weeks.some((w) => weeks.own.has(w))) return false;
    return undefined;
  };
}
