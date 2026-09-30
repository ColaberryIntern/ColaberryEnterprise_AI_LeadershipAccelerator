import React from 'react';

/**
 * The intern's case studies, as an editorial pipeline.
 *
 * This answers the plan's fifth question — "how does this work become proof of
 * capability?" — for the projects that have already been NOMINATED into a case
 * study. It reads what the dashboard already loaded (activity.case_studies), so
 * there's no extra fetch.
 *
 * ── HONEST STAGES, NOT INVENTED ONES ────────────────────────────────────────
 *
 * The stages shown are exactly the case-study record's real states — draft,
 * review, approved, published (and archived, off to the side) — not a richer
 * pipeline the data doesn't have. Candidate readiness (how close a project that
 * is NOT yet a case study is to being nominated) lives in the Projects section
 * above; this section is only the ones already in the pipeline.
 */

export interface CaseStudyRef { id: string; title: string; status: string; slug: string }

const cardStyle: React.CSSProperties = { background: '#fff', border: '1px solid #e5e8ed', borderRadius: 12, padding: 18 };
const label: React.CSSProperties = { fontSize: 10, letterSpacing: '.09em', textTransform: 'uppercase', color: '#6b7280', fontWeight: 700 };

// The real record states, in editorial order. `archived` is off-pipeline.
const STAGES = ['draft', 'review', 'approved', 'published'] as const;
const STAGE_LABEL: Record<string, string> = { draft: 'Drafting', review: 'In review', approved: 'Approved', published: 'Published' };

function stageMeta(status: string): { idx: number; text: string; tone: 'green' | 'blue' | 'amber' | 'neutral' } {
  if (status === 'published') return { idx: 3, text: 'Published', tone: 'green' };
  if (status === 'approved') return { idx: 2, text: 'Approved — publishing next', tone: 'blue' };
  if (status === 'review') return { idx: 1, text: 'In editorial review', tone: 'amber' };
  if (status === 'archived') return { idx: -1, text: 'Archived', tone: 'neutral' };
  return { idx: 0, text: 'Drafting the story', tone: 'neutral' }; // draft / anything else
}

const TONE: Record<string, { fg: string; bg: string }> = {
  green: { fg: '#167b61', bg: '#e7f5ef' },
  blue: { fg: '#2b6cb0', bg: '#eef4fb' },
  amber: { fg: '#986109', bg: '#fdf3e2' },
  neutral: { fg: '#5a6878', bg: '#eef1f5' },
};

function Pipeline({ idx }: { idx: number }) {
  // idx -1 (archived) shows the track greyed with no active step.
  return (
    <div className="d-flex align-items-center" style={{ gap: 6, flexWrap: 'wrap', marginTop: 8 }}>
      {STAGES.map((s, i) => {
        const done = idx >= 0 && i <= idx;
        const current = i === idx;
        return (
          <React.Fragment key={s}>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
              <span aria-hidden="true" style={{ width: 9, height: 9, borderRadius: '50%', background: done ? '#167b61' : '#cbd5e0' }} />
              <span style={{ fontSize: 11.5, fontWeight: current ? 700 : 500, color: done ? '#20262f' : '#8a94a2' }}>{STAGE_LABEL[s]}</span>
            </span>
            {i < STAGES.length - 1 && <span aria-hidden="true" style={{ width: 14, height: 2, background: idx > i ? '#167b61' : '#e2e6ec' }} />}
          </React.Fragment>
        );
      })}
    </div>
  );
}

const InternshipCaseStudies: React.FC<{ caseStudies: CaseStudyRef[] }> = ({ caseStudies }) => {
  return (
    <section style={{ background: 'transparent', border: 0, padding: 0 }}>
      <h2 style={{ fontSize: 16, margin: '0 0 10px' }}>Case studies</h2>
      {caseStudies.length === 0 ? (
        <div style={cardStyle}>
          <p className="ip-muted" style={{ margin: 0, fontSize: 13.5 }}>
            No case studies yet. As your projects mature, strong ones get nominated into a case study — the
            Projects section above shows how close each project is and what evidence it still needs.
          </p>
        </div>
      ) : (
        <div className="d-flex flex-column" style={{ gap: 12 }}>
          {caseStudies.map((c) => {
            const m = stageMeta(c.status);
            const t = TONE[m.tone];
            return (
              <div key={c.id} style={cardStyle}>
                <div className="d-flex justify-content-between align-items-start" style={{ gap: 10, flexWrap: 'wrap' }}>
                  <div>
                    <div style={label}>Case study</div>
                    <strong style={{ fontSize: 15 }}>{c.title}</strong>
                  </div>
                  <span className="badge" style={{ background: t.bg, color: t.fg, fontWeight: 600 }}>{m.text}</span>
                </div>
                {m.idx >= 0 ? <Pipeline idx={m.idx} /> : (
                  <p className="ip-muted" style={{ fontSize: 12.5, margin: '8px 0 0' }}>This case study was archived and isn&apos;t in the publishing pipeline.</p>
                )}
              </div>
            );
          })}
          <p className="ip-muted" style={{ fontSize: 11.5, margin: '2px 0 0' }}>
            Nomination and editorial review are handled by your mentor and the editorial team; you&apos;ll be asked for
            any missing evidence as it moves toward publishing.
          </p>
        </div>
      )}
    </section>
  );
};

export default InternshipCaseStudies;
