/**
 * myWorkModel - pure shaping for the learner's own My work room (C128, phase 1 of the approved C127
 * Portfolio and Showcase Gallery design). No I/O: every function here takes a row and returns data,
 * so the list and the work page are unit-testable without a database.
 *
 * What a "piece" is: one row of `runtime_portfolio_artifacts`. The stored `kind` says where it came
 * from (field_guide, build_artifact, case_study ...), but a learner thinks in what it IS (a Word
 * document, a spreadsheet, written work), so every piece gets a `group` that picks its viewer:
 *
 *   written    case_study, prompt_library, architecture_doc, architecture_decision, reflection,
 *              implementation_notes: text that lives in the platform, read in the in-app reader
 *   guide      field_guide: an HTML document, shown in a sandboxed frame
 *   link       claude_studio: a claude.ai link (cannot be embedded) plus the learner's reflection
 *   recording  presentation: a rehearsal recording
 *   pdf / sheet / word / slides / image / notes / file   build_artifact, by the uploaded file's type
 *
 * Titles are stored as "Build — <lesson> — <file>", "Field Guide — <name>", "ADR — <name>", so the
 * display title and the lesson are split apart here, never by the page (the design's "clean titles").
 */
import { fileKind, type ArtifactFileKind } from '../internship/internArtifactViewer';
import { repairMojibake } from '../../utils/textEncoding';

export type WorkGroup = 'written' | 'guide' | 'link' | 'recording' | 'pdf' | 'sheet' | 'word' | 'slides' | 'image' | 'notes' | 'file';

/** Display order of the kind chips, and each group's label. */
export const GROUP_LABEL: Record<WorkGroup, string> = {
  written: 'Written work', guide: 'Field guides', link: 'Claude Studio links', sheet: 'Spreadsheets',
  word: 'Word documents', pdf: 'PDFs', slides: 'Slides', recording: 'Recordings', image: 'Images',
  notes: 'Notes', file: 'Other files',
};

const WRITTEN_KINDS = new Set(['case_study', 'prompt_library', 'architecture_doc', 'architecture_decision', 'reflection', 'implementation_notes']);
/** Written pieces the platform composed from a completed lesson, as opposed to ones the learner wrote. */
const GENERATED_KINDS = new Set(['case_study', 'prompt_library', 'architecture_doc']);

const FILE_GROUP: Record<ArtifactFileKind, WorkGroup> = {
  pdf: 'pdf', csv: 'sheet', spreadsheet: 'sheet', word: 'word', slides: 'slides', image: 'image', text: 'notes', other: 'file',
};

/** Where a written piece came from, when the title does not say. */
const SOURCE_LABEL: Record<string, string> = {
  case_study: 'Case study', prompt_library: 'Prompt lab', architecture_doc: 'Architecture doc',
  architecture_decision: 'Decision record', reflection: 'Reflection', implementation_notes: 'Implementation notes',
  field_guide: 'Field guide', claude_studio: 'Claude Studio', presentation: 'Presentation rehearsal', build_artifact: 'Build file',
};

export interface WorkRow {
  id: string;
  kind: string;
  title: string;
  created_at: string | Date;
  content: unknown;
  competencies: unknown;
}

export interface WorkItem {
  id: string;
  /** The stored kind (field_guide, build_artifact ...). */
  kind: string;
  /** What it is, which picks the viewer and the chip it counts under. */
  group: WorkGroup;
  title: string;
  /** The lesson it came from, or the kind of piece when the title names no lesson. */
  from: string;
  createdAt: string;
  /** Program week, when the row records one. */
  week: number | null;
  project: string | null;
  skills: string[];
  /** Honest status: never implies a review or a verification that did not happen. */
  state: string;
}

export const asObject = (v: unknown): Record<string, unknown> => (v && typeof v === 'object' && !Array.isArray(v) ? v as Record<string, unknown> : {});
const str = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v.trim() : null);

/** The group a piece belongs to. Build files are grouped by the uploaded file's type. */
export function groupFor(kind: string, content: Record<string, unknown>): WorkGroup {
  if (WRITTEN_KINDS.has(kind)) return 'written';
  if (kind === 'field_guide') return 'guide';
  if (kind === 'claude_studio') return 'link';
  if (kind === 'presentation') return 'recording';
  if (typeof content.stored_path === 'string' || typeof content.filename === 'string') {
    return FILE_GROUP[fileKind(String(content.filename ?? content.stored_path ?? ''), content.mimetype)];
  }
  // A row with neither text sections nor a file still has a title and content worth reading.
  return 'written';
}

/** Split a stored title into the display title and the lesson it names. */
export function splitTitle(kind: string, raw: string): { title: string; from: string } {
  const title = repairMojibake(raw).trim();
  const parts = title.split(/\s+[—–]\s+/).map((p) => p.trim()).filter(Boolean);
  const fallback = SOURCE_LABEL[kind] ?? kind.replace(/_/g, ' ');
  if (parts.length < 2) return { title, from: fallback };
  const head = parts[0].toLowerCase();
  if (head === 'build' && parts.length >= 3) return { title: parts.slice(2).join(' — '), from: parts[1] };
  if (head === 'claude studio') {
    const rest = parts.slice(1).filter((p) => p.toLowerCase() !== 'claude.ai');
    return { title: rest.join(' — ') || title, from: 'Claude Studio' };
  }
  if (head === 'field guide' || head === 'adr' || head === 'build') return { title: parts.slice(1).join(' — '), from: fallback };
  return { title, from: fallback };
}

/** Skills from the competencies column, else the ones the content names. Deduplicated, in order. */
export function skillsFor(competencies: unknown, content: Record<string, unknown>): string[] {
  const source = Array.isArray(competencies) && competencies.length ? competencies
    : Array.isArray(content.skills_demonstrated) ? content.skills_demonstrated
      : Array.isArray(content.competencies) ? content.competencies : [];
  const out: string[] = [];
  for (const s of source) {
    const v = typeof s === 'string' ? s.trim() : '';
    if (v && !out.some((o) => o.toLowerCase() === v.toLowerCase())) out.push(v);
  }
  return out;
}

export function stateFor(kind: string, content: Record<string, unknown>): string {
  if (kind === 'claude_studio') {
    return content.verification === 'unverified_link' ? 'Link format-checked, not reviewed yet' : 'Link submitted';
  }
  if (GENERATED_KINDS.has(kind)) return 'Written by the platform from your completed lesson';
  if (kind === 'presentation') return 'Practice recording';
  return 'Submitted, not reviewed yet';
}

export function toWorkItem(row: WorkRow): WorkItem {
  const content = asObject(row.content);
  const { title, from } = splitTitle(row.kind, row.title);
  const week = typeof content.week === 'number' && Number.isFinite(content.week) ? content.week : null;
  return {
    id: row.id,
    kind: row.kind,
    group: groupFor(row.kind, content),
    title,
    from,
    createdAt: new Date(row.created_at).toISOString(),
    week,
    project: str(content.project_label) ?? str(content.projectName),
    skills: skillsFor(row.competencies, content),
    state: stateFor(row.kind, content),
  };
}

/** The written body of a piece, for the in-app reader. Null when the piece has no written body. */
export type WrittenBody =
  | { form: 'sections'; sections: Array<{ heading: string; body: string }> }
  | { form: 'decision'; fields: Array<{ label: string; value: string }>; receipt: { counts: Array<{ label: string; value: string }>; note: string | null } | null };

const ADR_LABELS: Array<[string, string]> = [
  ['context', 'The situation'], ['decision', 'The decision'], ['tradeoff', 'The tradeoff'],
  ['assumption', 'The assumption'], ['commitment', 'The commitment'], ['owner', 'Owner'],
];

export function writtenBodyFor(kind: string, content: Record<string, unknown>): WrittenBody | null {
  if (Array.isArray(content.sections)) {
    const sections = content.sections
      .map((s) => asObject(s))
      .map((s) => ({ heading: str(s.heading) ?? '', body: str(s.body) ?? '' }))
      .filter((s) => s.heading || s.body);
    return sections.length ? { form: 'sections', sections } : null;
  }
  if (kind === 'architecture_decision' || content.adr) {
    const adr = asObject(content.adr);
    const known = new Set(ADR_LABELS.map(([k]) => k));
    const fields = ADR_LABELS.map(([k, label]) => ({ label, value: str(adr[k]) ?? '' })).filter((f) => f.value);
    for (const [k, v] of Object.entries(adr)) {
      if (!known.has(k) && str(v)) fields.push({ label: k.replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase()), value: str(v) as string });
    }
    const r = asObject(content.receipt);
    const counts = Array.isArray(r.counts)
      ? r.counts.map((c) => asObject(c)).filter((c) => str(c.label) && (str(c.value) ?? (typeof c.value === 'number' ? String(c.value) : null)))
        .map((c) => ({ label: String(c.label), value: String(c.value) }))
      : [];
    const receipt = counts.length || str(r.qualification) ? { counts, note: str(r.qualification) } : null;
    return fields.length ? { form: 'decision', fields, receipt } : null;
  }
  return null;
}

/** A claude.ai link piece: the link itself is never embeddable, so the page shows what was said about it. */
export interface LinkBody { url: string | null; reflection: string | null; stages: string[]; aiDisclosure: string | null; projectProofUrl: string | null }
export function linkBodyFor(content: Record<string, unknown>): LinkBody {
  const https = (v: unknown) => (typeof v === 'string' && /^https:\/\//.test(v) ? v : null);
  return {
    url: https(content.artifact_url),
    reflection: str(content.reflection),
    stages: Array.isArray(content.stages_completed) ? content.stages_completed.filter((s): s is string => typeof s === 'string') : [],
    aiDisclosure: str(content.ai_disclosure),
    projectProofUrl: https(content.project_proof_url),
  };
}

/** A rehearsal recording: what it was. Playback stays in the presentation studio (its own audience rule). */
export interface RecordingBody { durationSeconds: number | null; projectName: string | null; mode: string | null }
export function recordingBodyFor(content: Record<string, unknown>): RecordingBody {
  return {
    durationSeconds: typeof content.durationSeconds === 'number' ? content.durationSeconds : null,
    projectName: str(content.projectName),
    mode: str(content.mode),
  };
}
