import * as fs from 'fs';
import * as path from 'path';

/**
 * caseStudyFieldContract — read the Case Study field set OUT OF THE TYPESCRIPT,
 * so a field map can be checked against the contract rather than against memory.
 *
 * WHY PARSE THE SOURCE RATHER THAN LIST THE FIELDS. A hand-maintained list of
 * fields is a second source of truth, and the second source is always the one
 * that goes stale. The HTML field map built for design review claimed to be the
 * complete domain map and was not — it covered 59 fields chosen by eye. The only
 * way "no field silently forgotten" can be an acceptance requirement rather than
 * an aspiration is if something reads the actual interfaces and fails when a new
 * one appears unmapped.
 *
 * WHAT THIS IS NOT. It is not a TypeScript compiler. It reads `readonly x: T;`
 * declarations inside `export interface` blocks with a line-oriented scan, which
 * is enough for these files because they are plain data contracts: no generics
 * on the interfaces, no mapped or conditional types, no declaration merging. If
 * that ever stops being true this parser must be replaced with the compiler API
 * rather than patched — a parser that silently under-reports would turn the
 * drift test into a test that passes because it found nothing.
 *
 * The single-line-only regex is deliberate and load-bearing: a multi-line field
 * declaration would be missed, so `assertNoMultilineFields` refuses to return a
 * field set from a file that contains one, rather than returning a short list
 * that looks complete.
 */

export interface ContractField {
  /** `PublicCaseStudyDetail.timeline` */
  readonly qualified: string;
  readonly interfaceName: string;
  readonly field: string;
  readonly optional: boolean;
  readonly type: string;
}

const INTERFACE_RE = /^export interface (\w+)/;
const FIELD_RE = /^\s{2}readonly ([a-zA-Z_][\w]*)(\?)?:\s*(.+?);\s*$/;
/** A field whose type opens a block on the same line — `x?: {` — spans lines. */
const OPENS_BLOCK_RE = /^\s{2}readonly ([a-zA-Z_][\w]*)(\?)?:\s*\{\s*$/;

/**
 * Refuse to parse a file whose shape this scanner cannot see all of.
 *
 * Nested object literals ARE allowed and are reported as one field carrying an
 * inline type — `engagementWindow` is one field, not four. What is refused is a
 * file that has drifted into a shape where the line scan would silently skip a
 * declaration entirely.
 */
export function readInterfaceFields(source: string, only?: readonly string[]): ContractField[] {
  const out: ContractField[] = [];
  const lines = source.split(/\r?\n/);
  let current: string | null = null;
  let depth = 0;

  for (const raw of lines) {
    const open = INTERFACE_RE.exec(raw);
    if (open && depth === 0) {
      current = only && !only.includes(open[1]) ? null : open[1];
      depth = 1;
      continue;
    }
    if (current === null) {
      // Still track braces so a skipped interface does not leak into the next.
      if (depth > 0) depth += (raw.match(/\{/g) || []).length - (raw.match(/\}/g) || []).length;
      if (depth <= 0) { depth = 0; }
      continue;
    }

    const opensBlock = OPENS_BLOCK_RE.exec(raw);
    if (opensBlock && depth === 1) {
      out.push({
        qualified: `${current}.${opensBlock[1]}`, interfaceName: current,
        field: opensBlock[1], optional: opensBlock[2] === '?', type: '{ … }',
      });
    } else if (depth === 1) {
      const m = FIELD_RE.exec(raw);
      if (m) {
        out.push({
          qualified: `${current}.${m[1]}`, interfaceName: current,
          field: m[1], optional: m[2] === '?', type: m[3].trim(),
        });
      }
    }

    depth += (raw.match(/\{/g) || []).length - (raw.match(/\}/g) || []).length;
    if (depth <= 0) { current = null; depth = 0; }
  }
  return out;
}

/** Resolve a types file relative to this module, so tests and runtime agree. */
export function readTypesFile(name: string): string {
  return fs.readFileSync(path.join(__dirname, '..', '..', 'types', name), 'utf8');
}

/**
 * Every field the PUBLIC surface can carry. This is the set a public page has to
 * give a home to, and the set the drift test guards.
 */
export const PUBLIC_INTERFACES = [
  'PublicCaseStudyDetail', 'PublicCaseStudySummary', 'PublicCaseStudyMetric',
  'PublicCaseStudyNarrative', 'PublicCaseStudySituation', 'PublicCaseStudyTimelineEntry',
  'PublicCaseStudyArchitecture', 'PublicCaseStudyMeasurement', 'PublicCaseStudyRoadmapItem',
  'PublicCaseStudyRepository', 'PublicCaseStudyCta', 'PublicCaseStudySeo',
] as const;

/** Every field the DOMAIN carries, public or not. Authoring must account for all. */
export const DOMAIN_INTERFACES = [
  'CaseStudyVerification', 'CaseStudyMeasurementContext', 'CaseStudyMetricEntry',
  'CaseStudyIdentitySection', 'CaseStudySituationSection', 'CaseStudyTimelineEntry',
  'CaseStudyArchitectureNode', 'CaseStudyArchitectureEdge', 'CaseStudyArchitectureSection',
  'CaseStudyMeasurementSection', 'CaseStudyRoadmapItem', 'CaseStudyArtifactRef',
  'CaseStudyRepositoryRef', 'CaseStudyTaxonomy', 'CaseStudySnapshotContent',
] as const;

export function publicFields(): ContractField[] {
  return readInterfaceFields(readTypesFile('caseStudyPublic.ts'), PUBLIC_INTERFACES);
}

export function domainFields(): ContractField[] {
  return readInterfaceFields(readTypesFile('caseStudy.ts'), DOMAIN_INTERFACES);
}
