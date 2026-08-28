import React, { useEffect, useState } from 'react';
import RecordProse from '../components/capstone/RecordProse';
import { useParams } from 'react-router-dom';
import portalApi from '../utils/portalApi';

/**
 * CapstoneRecordPage — /p/:slug, the page a student sends to a hiring manager.
 *
 * Renders the STORED snapshot the backend compiled, and renders only what is
 * in it. There is no placeholder copy, no "coming soon" band, and no empty
 * state dressed up as progress: a band the record does not carry is a band this
 * page does not draw. That is the whole reason the record can be trusted — a
 * reader who finds one padded section reasonably discounts every other claim.
 *
 * Every artifact link is pinned to the commit it was written in. Where the
 * backend could not produce a permalink the row renders as plain text rather
 * than linking to a branch, because a link that silently points at a moving
 * target is worse than no link.
 */

/**
 * Colours come from the design tokens (colaberry/tokens/colors.css), not from
 * hex literals. The tokens carry a `[data-theme="dark"]` variant, so hardcoding
 * near-black ink here would render invisible the moment anything sets that
 * attribute — and this is the one page in the app most likely to be opened by a
 * stranger on an unknown device.
 */
const INK = 'var(--text-strong)';
const BODY = 'var(--text-body)';
const ACCENT = 'var(--text-link)';
const MUTED = 'var(--text-muted)';
const LINE = 'var(--border-subtle)';

interface RecordArtifact {
  week: number; title: string; filename: string; path: string;
  commit_sha: string | null; built_on: string; is_sample: boolean;
  verification: string | null;
}
interface RecordPost { week: number; ritual: string; headline: string; body: string | null }
interface RecordCompetency { domain: string; label: string; evidence_count: number }
interface RecordCapability {
  id: string; label: string; count: number; proven?: boolean; on_sample?: boolean;
}

interface CapstoneRecord {
  identity: {
    full_name: string; headline: string | null; cohort_name: string | null;
    repo_url: string | null; demo_url: string | null; certification: string | null;
  };
  system: {
    project_name: string | null; descriptor: string | null;
    architecture_mermaid: string | null; hours_reclaimed: number | null;
  };
  artifacts: RecordArtifact[];
  competencies: RecordCompetency[];
  /** Optional: absent for records compiled before this band, and for no connected repo. */
  capabilities?: RecordCapability[];
  posts: RecordPost[];
  bookend: { opening: string | null; closing: string | null };
}

/** Mirrors artifactPermalink in capstoneRecordContract.ts. Null ⇒ render unlinked. */
function permalink(repoUrl: string | null, a: RecordArtifact): string | null {
  if (!repoUrl || !a.commit_sha) return null;
  const base = repoUrl.replace(/\.git$/, '').replace(/\/$/, '');
  return `${base}/blob/${a.commit_sha}/${a.path}`;
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section style={{ marginTop: 44 }}>
      <h2 style={{
        fontSize: 12, fontWeight: 700, letterSpacing: '0.09em', textTransform: 'uppercase',
        color: MUTED, margin: '0 0 16px', paddingBottom: 8, borderBottom: `1px solid ${LINE}`,
      }}>{title}</h2>
      {children}
    </section>
  );
}

function CapstoneRecordPage() {
  const { slug } = useParams<{ slug: string }>();
  const [record, setRecord] = useState<CapstoneRecord | null>(null);
  const [indexable, setIndexable] = useState(false);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    if (!slug) { setNotFound(true); setLoading(false); return; }
    portalApi.get(`/api/public/capstone/${slug}`)
      .then((res) => { setRecord(res.data?.record ?? null); setIndexable(res.data?.indexable === true); })
      .catch(() => setNotFound(true))
      .finally(() => setLoading(false));
  }, [slug]);

  // Best-effort noindex for an unlisted record. The authoritative control is the
  // X-Robots-Tag header nginx sets on /p/ — this app is a SPA, so a crawler that
  // does not execute JavaScript never sees this tag, and the header is what
  // actually keeps an unlisted page out of search.
  useEffect(() => {
    if (loading || indexable) return;
    const tag = document.createElement('meta');
    tag.name = 'robots';
    tag.content = 'noindex, nofollow';
    document.head.appendChild(tag);
    return () => { document.head.removeChild(tag); };
  }, [loading, indexable]);

  useEffect(() => {
    const name = record?.identity?.full_name;
    if (name) document.title = `${name} — Capstone Record`;
  }, [record]);

  if (loading) {
    return (
      <div className="container py-5 text-center">
        <div className="spinner-border" style={{ color: ACCENT }} role="status">
          <span className="visually-hidden">Loading…</span>
        </div>
      </div>
    );
  }

  if (notFound || !record) {
    return (
      <div className="container py-5" style={{ maxWidth: 640 }}>
        <h1 style={{ fontSize: 20, fontWeight: 700, color: INK }}>Not found</h1>
        <p style={{ color: MUTED, marginBottom: 0 }}>
          This record does not exist, or it is not shared.
        </p>
      </div>
    );
  }

  const { identity, system, artifacts, competencies, posts, bookend } = record;
  const capabilities = record.capabilities ?? [];
  const weeks = Array.from(new Set(artifacts.map((a) => a.week))).sort((x, y) => x - y);

  return (
    <div className="container py-5" style={{ maxWidth: 860, color: INK }}>

      {/* Identity */}
      <header>
        <h1 style={{ fontSize: 34, fontWeight: 800, margin: 0, letterSpacing: '-0.02em' }}>
          {identity.full_name}
        </h1>
        {identity.headline && (
          <p style={{ fontSize: 18, color: ACCENT, fontWeight: 600, margin: '6px 0 0' }}>
            {identity.headline}
          </p>
        )}
        {identity.cohort_name && (
          <p style={{ fontSize: 13, color: MUTED, margin: '10px 0 0' }}>{identity.cohort_name}</p>
        )}

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginTop: 20 }}>
          {identity.demo_url && (
            <a href={identity.demo_url} target="_blank" rel="noopener noreferrer"
              className="btn btn-sm" style={{ background: 'var(--brand-accent)', color: 'var(--text-on-accent)', fontWeight: 600 }}>
              <i className="ri-external-link-line me-1" />See it running
            </a>
          )}
          {identity.repo_url && (
            <a href={identity.repo_url} target="_blank" rel="noopener noreferrer"
              className="btn btn-sm btn-outline-secondary" style={{ fontWeight: 600 }}>
              <i className="ri-github-fill me-1" />The code
            </a>
          )}
        </div>

        {identity.certification && (
          <p style={{ fontSize: 13, color: MUTED, marginTop: 14, marginBottom: 0 }}>
            <i className="ri-award-line me-1" />{identity.certification}
          </p>
        )}
      </header>

      {/* The system */}
      {(system.project_name || system.descriptor) && (
        <Section title="What they built">
          {system.project_name && (
            <h3 style={{ fontSize: 20, fontWeight: 700, margin: '0 0 8px' }}>{system.project_name}</h3>
          )}
          {system.descriptor && (
            /* Markdown, not a paragraph. The descriptor is compiled from the project's
               executive deliverable and is a full document -- headings, GFM tables, bold.
               Rendered flat it reached hiring managers as a wall of literal ## and |. */
            <div style={{ fontSize: 15.5, color: BODY }}>
              <RecordProse>{system.descriptor}</RecordProse>
            </div>
          )}
          {/* `> 0`, not just `is a number`. A compiled 0 rendered as
              "0 hours a month reclaimed", which reads as a measured result of nothing --
              the record's own rule is that an absent band renders as absent. */}
          {typeof system.hours_reclaimed === 'number' && system.hours_reclaimed > 0 && (
            <p style={{ fontSize: 14, color: MUTED, marginTop: 12, marginBottom: 0 }}>
              {system.hours_reclaimed} hours a month reclaimed
            </p>
          )}
        </Section>
      )}

      {/* Opening — their own words from week 1 */}
      {bookend.opening && (
        <Section title="Where they started">
          <blockquote style={{
            margin: 0, paddingLeft: 16, borderLeft: `3px solid ${LINE}`,
            fontSize: 15.5, lineHeight: 1.65, color: BODY,
          }}>{bookend.opening}</blockquote>
        </Section>
      )}

      {/* Artifacts */}
      {artifacts.length > 0 && (
        <Section title={`The work — ${artifacts.length} artifacts across ${weeks.length} weeks`}>
          <div style={{ overflowX: 'auto' }}>
            <table className="table table-sm align-middle" style={{ marginBottom: 0, minWidth: 520 }}>
              <tbody>
                {artifacts.map((a) => {
                  const href = permalink(identity.repo_url, a);
                  return (
                    <tr key={`${a.week}-${a.path}`}>
                      <td style={{ width: 70, color: MUTED, fontSize: 13, whiteSpace: 'nowrap' }}>
                        Week {a.week}
                      </td>
                      <td>
                        {href
                          ? <a href={href} target="_blank" rel="noopener noreferrer"
                              style={{ color: ACCENT, fontWeight: 600, textDecoration: 'none' }}>{a.title}</a>
                          : <span style={{ fontWeight: 600 }}>{a.title}</span>}
                        <div style={{ fontSize: 12.5, color: MUTED, marginTop: 2 }}>
                          {a.built_on}
                          {a.is_sample && ' · sample project'}
                          {a.verification && ` · ${a.verification}`}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Section>
      )}

      {/* Competencies */}
      {competencies.length > 0 && (
        <Section title="What they can prove">
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {competencies.map((c) => (
              <span key={c.domain} style={{
                border: `1px solid ${LINE}`, borderRadius: 999, padding: '6px 13px',
                fontSize: 13.5, fontWeight: 600,
              }}>
                {c.label}
                <span style={{ color: MUTED, fontWeight: 500 }}>
                  {' '}· {c.evidence_count} {c.evidence_count === 1 ? 'piece' : 'pieces'} of evidence
                </span>
              </span>
            ))}
          </div>
        </Section>
      )}

      {/* What they built in their own repo. Separate from "What they can prove":
          competencies are assessed, these are committed files. */}
      {capabilities.length > 0 && (
        <Section title="Built in their repo">
          <div style={{ display: 'grid', gap: 10 }}>
            {capabilities.map((c) => (
              <div key={c.id} style={{
                display: 'flex', justifyContent: 'space-between', gap: 12,
                paddingBottom: 10, borderBottom: `1px solid ${LINE}`, flexWrap: 'wrap',
              }}>
                <span style={{ color: INK, fontWeight: 600 }}>
                  {c.label}
                  {/* Week 3 permits building against the sample. Saying so is the point:
                      silence here would imply work on a real system. */}
                  {c.on_sample && (
                    <span style={{ color: MUTED, fontWeight: 500 }}> · built on the sample</span>
                  )}
                </span>
                <span style={{ color: MUTED, fontSize: 13.5 }}>
                  {c.count > 1 && <>{c.count} of them</>}
                  {/* `proven` means a run was evidenced. Its ABSENCE is not a denial, so
                      nothing is printed for it -- a service can be built and not yet
                      demonstrated, and that is an honest state. */}
                  {c.proven && <>{c.count > 1 ? ' · ' : ''}demonstrated</>}
                </span>
              </div>
            ))}
          </div>
        </Section>
      )}

      {/* Their words */}
      {posts.length > 0 && (
        <Section title="In their words">
          {posts.map((p) => (
            <div key={p.week} style={{ marginBottom: 20 }}>
              <div style={{ fontSize: 11.5, color: MUTED, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase' }}>
                Week {p.week} · {p.ritual}
              </div>
              <div style={{ fontSize: 15.5, fontWeight: 600, marginTop: 4 }}>{p.headline}</div>
              {p.body && (
                <p style={{ fontSize: 14.5, lineHeight: 1.65, color: BODY, margin: '4px 0 0', whiteSpace: 'pre-line' }}>
                  {p.body}
                </p>
              )}
            </div>
          ))}
        </Section>
      )}

      {/* Closing — week 12 */}
      {bookend.closing && (
        <Section title="Where they landed">
          <blockquote style={{
            margin: 0, paddingLeft: 16, borderLeft: `3px solid ${ACCENT}`,
            fontSize: 15.5, lineHeight: 1.65, color: BODY,
          }}>{bookend.closing}</blockquote>
        </Section>
      )}

      <footer style={{ marginTop: 52, paddingTop: 16, borderTop: `1px solid ${LINE}`, fontSize: 12.5, color: MUTED }}>
        Built in the Colaberry AI Systems Architect Accelerator. Every link above is pinned
        to the commit the work was written in.
      </footer>
    </div>
  );
}

export default CapstoneRecordPage;
