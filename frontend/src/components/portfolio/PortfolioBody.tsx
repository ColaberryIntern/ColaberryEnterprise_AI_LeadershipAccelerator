import React from 'react';
import {
  ExperienceSection, EducationSection, SectionHead, BrandRule,
  type ExperienceItem, type EducationItem,
} from './PortfolioHistory';

/**
 * PortfolioBody - the rendered portfolio, shared by the public page and the reviewer.
 *
 * WHY SHARED. The reviewer screen shipped with Approve and Ask-for-changes and nothing to
 * look at. Ali: "It's just asking me to give changes but I can't view what I'm supposed to
 * be approving." Rebuilding the layout a second time for admin would let the two drift, so
 * a reviewer would approve one rendering while a stranger read another. One component fed
 * by one projection means what the reviewer sees IS what publishes.
 *
 * WHY IT READS AS A RESUME. Ali, on the first cut: "make it look more like ... a Resume
 * with a hero image per project and an experience section that comes from their linkedin
 * resume." The section order below is the argument the page makes, and it is deliberate:
 * who they are, where they have worked, what they built, then the evidence for it. The old
 * order led with a capability list, which asked a recruiter to care about skills belonging
 * to someone they had not been introduced to yet.
 */
// Design tokens, not hex literals: the tokens carry a [data-theme="dark"] variant and
// this is a page a stranger opens on an unknown device.
const INK = 'var(--text-strong)';
const BODY = 'var(--text-body)';
const ACCENT = 'var(--text-link)';
const MUTED = 'var(--text-muted)';
const SUBTLE = 'var(--text-subtle)';
const LINE = 'var(--border-subtle)';
const CARD = 'var(--surface-card)';

interface Capability {
  name: string; count: number; proven?: boolean; on_sample?: boolean;
}
interface RecordLink { slug: string; title: string; published_at: string | null }
interface ProjectItem {
  title: string; organization: string | null; industry: string | null;
  problem: string | null; automation_goal: string | null; stage: string | null;
  repo_url: string | null; demo_url: string | null;
  /** An image found in the project's own PUBLIC repo. Null when there is none. */
  hero_image_url?: string | null;
}
interface Repository { name: string; url: string }

interface Portfolio {
  identity: {
    full_name: string; headline: string | null; cohort_name: string | null;
    avatar_data_url: string | null; linkedin_url: string | null;
  };
  experience?: ExperienceItem[];
  education?: EducationItem[];
  capabilities: Capability[];
  projects: ProjectItem[];
  records: RecordLink[];
  repositories: Repository[];
  private_repository_count: number;
  generated_at: string;
}

const Section: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
  <section style={{ marginTop: 44 }}>
    <SectionHead>{title}</SectionHead>
    <BrandRule />
    {children}
  </section>
);

/** Up to two initials from the project title, for the no-image case. */
function monogram(title: string): string {
  const words = title.split(/\s+/).filter(Boolean);
  if (!words.length) return '#';
  return words.slice(0, 2).map((w) => w[0]).join('').toUpperCase();
}

/**
 * The project's hero.
 *
 * An image is shown ONLY when the backend found one in the project's own PUBLIC repo.
 * When there is none this renders a typographic band rather than a broken frame or a
 * stock photo: an invented image would be the one thing on this page that is not the
 * person's own work. onError collapses to the same fallback, so a file deleted from the
 * repo after publication degrades honestly instead of showing a browser error glyph.
 */
const ProjectHero: React.FC<{ title: string; src?: string | null }> = ({ title, src }) => {
  const [failed, setFailed] = React.useState(false);
  const show = !!src && !failed;
  return (
    <div
      style={{
        position: 'relative',
        aspectRatio: '16 / 9',
        width: '100%',
        overflow: 'hidden',
        borderRadius: '10px 10px 0 0',
        background: show ? 'var(--surface-sunken)' : 'var(--surface-brand-subtle)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}
    >
      {show ? (
        <img
          src={src as string}
          alt=""
          loading="lazy"
          referrerPolicy="no-referrer"
          onError={() => setFailed(true)}
          style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
        />
      ) : (
        <span
          aria-hidden="true"
          style={{
            fontSize: 40, fontWeight: 800, letterSpacing: '.04em',
            color: 'var(--surface-brand)', opacity: 0.55,
          }}
        >
          {monogram(title)}
        </span>
      )}
    </div>
  );
};

const ProjectCard: React.FC<{ project: ProjectItem }> = ({ project: p }) => {
  const meta = [p.organization, p.industry].filter(Boolean).join(' · ');
  return (
    <article
      style={{
        border: '1px solid ' + LINE,
        borderRadius: 12,
        background: CARD,
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      <ProjectHero title={p.title} src={p.hero_image_url} />
      <div style={{ padding: '16px 18px 18px' }}>
        <h3 style={{ fontSize: 17, fontWeight: 700, color: INK, margin: 0, lineHeight: 1.3 }}>
          {p.title}
        </h3>
        {meta && <div style={{ fontSize: 13, color: MUTED, marginTop: 4 }}>{meta}</div>}
        {p.problem && (
          <p style={{ fontSize: 14.5, color: BODY, lineHeight: 1.6, margin: '10px 0 0' }}>{p.problem}</p>
        )}
        {p.automation_goal && (
          <p style={{ fontSize: 14, color: BODY, lineHeight: 1.6, margin: '8px 0 0' }}>{p.automation_goal}</p>
        )}
        {(p.repo_url || p.demo_url) && (
          <div style={{ display: 'flex', gap: 16, marginTop: 14, flexWrap: 'wrap' }}>
            {p.demo_url && (
              <a href={p.demo_url} target="_blank" rel="noopener noreferrer"
                 style={{ color: ACCENT, fontSize: 14, fontWeight: 600, textDecoration: 'none' }}>
                View it live
              </a>
            )}
            {p.repo_url && (
              <a href={p.repo_url} target="_blank" rel="noopener noreferrer"
                 style={{ color: ACCENT, fontSize: 14, fontWeight: 600, textDecoration: 'none' }}>
                Read the code
              </a>
            )}
          </div>
        )}
      </div>
    </article>
  );
};

const PortfolioBody: React.FC<{ portfolio: Portfolio }> = ({ portfolio }) => {
  const { identity, capabilities, records, repositories, private_repository_count } = portfolio;
  const projects = portfolio.projects || [];
  const experience = portfolio.experience || [];
  const education = portfolio.education || [];

  const isEmpty = !capabilities.length && !records.length && !repositories.length
    && !projects.length && !experience.length && !education.length;

  return (
    <div style={{ maxWidth: 880, margin: '0 auto', padding: '48px 24px 72px', color: BODY }}>
      <header style={{ display: 'flex', gap: 20, alignItems: 'center', flexWrap: 'wrap' }}>
        {identity.avatar_data_url && (
          <img
            src={identity.avatar_data_url}
            alt=""
            style={{ width: 88, height: 88, borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }}
          />
        )}
        <div style={{ minWidth: 220, flex: 1 }}>
          <h1 style={{ fontSize: 34, fontWeight: 800, color: INK, margin: 0, lineHeight: 1.15 }}>
            {identity.full_name}
          </h1>
          {identity.headline && (
            <div style={{ fontSize: 17, color: BODY, marginTop: 6 }}>{identity.headline}</div>
          )}
          <div style={{ display: 'flex', gap: 14, marginTop: 8, flexWrap: 'wrap', alignItems: 'center' }}>
            {identity.cohort_name && (
              <span style={{ fontSize: 13, color: SUBTLE }}>{identity.cohort_name}</span>
            )}
            {identity.linkedin_url && (
              <a
                href={identity.linkedin_url}
                target="_blank"
                rel="noopener noreferrer"
                style={{ color: ACCENT, fontSize: 14, fontWeight: 600, textDecoration: 'none' }}
              >
                LinkedIn
              </a>
            )}
          </div>
        </div>
      </header>

      {/* Where they have worked, before what they built here. */}
      <ExperienceSection items={experience} />

      {projects.length > 0 && (
        <Section title={projects.length === 1 ? 'Selected work' : 'Selected work (' + projects.length + ')'}>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
              gap: 20,
            }}
          >
            {projects.map((p, i) => <ProjectCard key={p.title + i} project={p} />)}
          </div>
        </Section>
      )}

      {/* PROVEN BY COMMITTED FILES, not by curriculum consumption.
          This band previously read "Verified by Colaberry - N pieces of evidence" from the
          assessment tables. Every one of those 8,895 rows is source='timeline' -- content
          opened, one row per band -- so the number meant attendance and the label claimed
          proof. On a page built for recruiters that was the most damaging line here. */}
      {capabilities.length > 0 && (
        <Section title={'Proven in their repo (' + capabilities.length + ')'}>
          <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
            {capabilities.map((c) => (
              <li
                key={c.name}
                style={{
                  display: 'flex', justifyContent: 'space-between', gap: 12,
                  padding: '10px 0', borderBottom: '1px solid ' + LINE, flexWrap: 'wrap',
                }}
              >
                <span style={{ color: INK, fontWeight: 600 }}>
                  {c.name}
                  {c.on_sample && (
                    <span style={{ color: MUTED, fontWeight: 500 }}> &middot; built on the sample</span>
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
        <Section title={'Written up (' + records.length + ')'}>
          <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
            {records.map((r) => (
              <li key={r.slug} style={{ padding: '10px 0', borderBottom: '1px solid ' + LINE }}>
                {/* The record is where the depth lives; this page is the index. */}
                <a href={'/p/' + r.slug} style={{ color: ACCENT, fontWeight: 600, textDecoration: 'none' }}>
                  {r.title}
                </a>
              </li>
            ))}
          </ul>
        </Section>
      )}

      <EducationSection items={education} />

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
      {isEmpty && (
        <p style={{ color: MUTED, marginTop: 40 }}>
          This portfolio does not have any published work yet.
        </p>
      )}

      {/* The one place the platform names itself, at the foot, after the work. */}
      <footer style={{ marginTop: 56, paddingTop: 18, borderTop: '1px solid ' + LINE }}>
        <span style={{ fontSize: 12, color: SUBTLE, letterSpacing: '.04em' }}>
          Colaberry &middot; powered by Refactored.ai
        </span>
      </footer>
    </div>
  );
};

export default PortfolioBody;
export type { Portfolio };
