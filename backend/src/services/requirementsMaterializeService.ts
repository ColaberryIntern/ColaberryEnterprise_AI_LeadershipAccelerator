import RequirementsMap from '../models/RequirementsMap';
import { parseRequirementsWithSections, ParsedRequirements } from './requirementsParserService';

/**
 * Section-name -> short cluster code. Order matters (more specific first, e.g.
 * "non-functional" before "functional"). The cluster code becomes the prefix of
 * the requirement_key (`CODE.NNN`), which `studentTaskService.deriveCluster`
 * splits on the first dot to group requirements into one task list per cluster.
 */
const SECTION_CLUSTER_MAP: Array<[RegExp, string]> = [
  [/non[-\s]?functional/i, 'NFR'],
  [/functional/i, 'FUNC'],
  [/security|auth|compliance|privacy/i, 'SEC'],
  [/architect/i, 'ARCH'],
  [/data|storage|database/i, 'DATA'],
  [/integration|\bapi\b|connector/i, 'INTEG'],
  [/observ|logging|monitor|telemetry/i, 'OBS'],
  [/performance|scal/i, 'PERF'],
  [/reliab|failure|resilien/i, 'REL'],
  [/deploy|infra|devops/i, 'INFRA'],
  [/test|\bqa\b|validation/i, 'TEST'],
  // \b anchors on ui/ux so "reqUIrements" doesn't false-match the UI cluster.
  [/\bui\b|\bux\b|interface|frontend|user experience/i, 'UI'],
];

/** Map a section name to a short cluster code (pure, deterministic). */
export function sectionToClusterCode(sectionName: string): string {
  const name = (sectionName || '').trim();
  for (const [re, code] of SECTION_CLUSTER_MAP) if (re.test(name)) return code;
  // Fallback: first alphanumeric word (minus the word "requirements"), uppercased.
  const cleaned = name.replace(/requirements?/i, '').trim();
  const word = (cleaned.split(/\s+/)[0] || '').replace(/[^A-Za-z0-9]/g, '');
  return (word || 'GEN').slice(0, 8).toUpperCase();
}

export interface KeyedRequirement {
  requirement_key: string;
  requirement_text: string;
  cluster: string;
  section: string;
}

/**
 * Convert parsed sections into `CLUSTER.NNN`-keyed requirements (pure). Numbering
 * continues within a cluster code even across multiple sections that map to it,
 * so keys never collide.
 */
export function toKeyedRequirements(parsed: ParsedRequirements): KeyedRequirement[] {
  const counters = new Map<string, number>();
  const rows: KeyedRequirement[] = [];
  for (const section of parsed.sections) {
    const code = sectionToClusterCode(section.name);
    for (const req of section.requirements) {
      const n = (counters.get(code) || 0) + 1;
      counters.set(code, n);
      rows.push({
        requirement_key: `${code}.${String(n).padStart(3, '0')}`,
        requirement_text: req.text,
        cluster: code,
        section: section.name,
      });
    }
  }
  return rows;
}

/**
 * Parse a generated requirements document into keyed RequirementsMap rows — the
 * missing link that lets `createTasksFromRequirements` build native student
 * tasks straight from the ProjectDnaWizard flow (no manual "Activate" step).
 * Idempotent: findOrCreate on (project_id, requirement_key). Returns the number
 * of requirement rows parsed.
 */
export async function materializeRequirementsFromDocument(projectId: string, docText: string): Promise<number> {
  if (!docText || !docText.trim()) return 0;
  const parsed = parseRequirementsWithSections(docText);
  const rows = toKeyedRequirements(parsed);
  for (const r of rows) {
    await RequirementsMap.findOrCreate({
      where: { project_id: projectId, requirement_key: r.requirement_key },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Sequelize creation attrs
      defaults: {
        project_id: projectId,
        requirement_key: r.requirement_key,
        requirement_text: r.requirement_text,
        status: 'unmatched',
        github_file_paths: [],
        confidence_score: 0,
        is_active: true,
      } as any,
    });
  }
  return rows.length;
}
