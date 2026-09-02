import React from 'react';

/**
 * PortfolioBody - the rendered portfolio, shared by the public page and the reviewer.
 *
 * WHY SHARED. The reviewer screen shipped with Approve and Ask-for-changes and nothing to
 * look at. Ali: "It's just asking me to give changes but I can't view what I'm supposed to
 * be approving." Rebuilding the layout a second time for admin would let the two drift, so
 * a reviewer would approve one rendering while a stranger read another. One component fed
 * by one projection means what the reviewer sees IS what publishes.
 */
// Design tokens, not hex literals: the tokens carry a [data-theme="dark"] variant and
// this is a page a stranger opens on an unknown device.
const INK = 'var(--text-strong)';
const BODY = 'var(--text-body)';
const ACCENT = 'var(--text-link)';
const MUTED = 'var(--text-muted)';
const LINE = 'var(--border-subtle)';

interface Capability {
  name: string; count: number; proven?: boolean; on_sample?: boolean;
}
interface RecordLink { slug: string; title: string; published_at: string | null }
interface ProjectItem {
  title: string; organization: string | null; industry: string | null;
  problem: string | null; automation_goal: string | null; stage: string | null;
  repo_url: string | null; demo_url: string | null;
}
interface Repository { name: string; url: string }

interface Portfolio {
  identity: {
    full_name: string; headline: string | null; cohort_name: string | null;
    avatar_data_url: string | null; linkedin_url: string | null;
  };
  capabilities: Capability[];
  projects: ProjectItem[];
  records: RecordLink[];
  repositories: Repository[];
  private_repository_count: number;
  generated_at: string;
}

const Section: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
  <section style={{ marginTop: 40 }}>
    <h2 style={{
      fontSize: 12, letterSpacing: '.08em', textTransform: 'uppercase',
      color: MUTED, fontWeight: 700, margin: '0 0 14px',
    }}>{title}</h2>
    {children}
  </section>
);


const PortfolioBody: React.FC<{ portfolio: Portfolio }> = ({ portfolio }) => {
  const { identity, capabilities, records, repositories, private_repository_count } = portfolio;
  const projects = portfolio.projects || [];

  return (
    <div style={{ maxWidth: 820, margin: '0 auto', padding: '48px 24px 96px', color: BODY }}>
      <header style={{ display: 'flex', gap: 18, alignItems: 'center', flexWrap: 'wrap' }}>
        {identity.avatar_data_url && (
          <img
            src={identity.avatar_data_url}
            alt=""
            style={{ width: 64, height: 64, borderRadius: '50%', objectFit: 'cover' }}
          />
        )}
        <div style={{ minWidth: 220, flex: 1 }}>
          <h1 style={{ fontSize: 28, fontWeight: 700, color: INK, margin: 0 }}>
            {identity.full_name}
          </h1>
          {identity.headline && (
            <div style={{ fontSize: 16, color: BODY, marginTop: 4 }}>{identity.headline}</div>
          )}
          {identity.cohort_name && (
            <div style={{ fontSize: 13, color: MUTED, marginTop: 4 }}>{identity.cohort_name}</div>
          )}
        </div>
        {identity.linkedin_url && (
          <a
            href={identity.linkedin_url}
            target="_blank"
            rel="noopener noreferrer"
            style={{ color: ACCENT, fontSize: 14, textDecoration: 'none' }}
          >
            LinkedIn
          </a>
        )}
      </header>

      {/* PROVEN BY COMMITTED FILES, not by curriculum consumption.
          This band previously read "Verified by Colaberry - N pieces of evidence" from the
          assessment tables. Every one of those 8,895 rows is source='timeline' -- content
          opened, one row per band -- so the number meant attendance and the label claimed
          proof. On a page built for recruiters that was the most damaging line here. */}
      {capabilities.length > 0 && (
        <Section title={`Proven in their repo (${capabilities.length})`}>
          <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
            {capabilities.map((c) => (
              <li
                key={c.name}
                style={{
                  display: 'flex', justifyContent: 'space-between', gap: 12,
                  padding: '10px 0', borderBottom: `1px solid ${LINE}`, flexWrap: 'wrap',
                }}
              >
                <span style={{ color: INK, fontWeight: 600 }}>
                  {c.name}
                  {c.on_sample && (
                    <span style={{ color: MUTED, fontWeight: 500 }}> · built on the sample</span>
                  )}
                </span>
                <span style={{ color: MUTED, fontSize: 13 }}>
                  {c.count > 1 && <>{c.count} committed</>}
                  {c.proven && <>{c.count > 1 ? ' · ' : ''}demonstrated</>}
                </span>
              </li>
            ))}
          </ul>
        </Section>
      )}

      {records.length > 0 && (
        <Section title={`Written up (${records.length})`}>
          <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
            {records.map((r) => (
              <li key={r.slug} style={{ padding: '10px 0', borderBottom: `1px solid ${LINE}` }}>
                {/* The record is where the depth lives; this page is the index. */}
                <a href={`/p/${r.slug}`} style={{ color: ACCENT, fontWeight: 600, textDecoration: 'none' }}>
                  {r.title}
                </a>
              </li>
            ))}
          </ul>
        </Section>
      )}

      {(repositories.length > 0 || private_repository_count > 0) && (
        <Section title="Code">
          <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
            {repositories.map((r) => (
              <li key={r.url} style={{ padding: '8px 0' }}>
                <a href={r.url} target="_blank" rel="noopener noreferrer"
                   style={{ color: ACCENT, textDecoration: 'none' }}>{r.name}</a>
              </li>
            ))}
          </ul>
          {private_repository_count > 0 && (
            // The honest statement -- there was more work behind this -- without the identity.
            <p style={{ color: MUTED, fontSize: 13, margin: '8px 0 0' }}>
              and {private_repository_count} private {private_repository_count === 1 ? 'repository' : 'repositories'}
            </p>
          )}
        </Section>
      )}

      {/* An entirely empty portfolio is a real state and says so plainly, rather than
          rendering a page of blank headings that reads as abandonment. */}
      {!capabilities.length && !records.length && !repositories.length && !projects.length && (
        <p style={{ color: MUTED, marginTop: 40 }}>
          This portfolio does not have any published work yet.
        </p>
      )}
    </div>
  );
};

export default PortfolioBody;
export type { Portfolio };
