import React from 'react';
import './portfolio.css';
import {
  ExperienceSection, EducationSection, SectionHead, Rule,
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
 * THE LAYOUT IS A PORT of the design Ali approved on 2026-09-02 - two columns, a sticky
 * identity rail, a stat strip, and the employment history on a date rail. The section
 * order is the argument the page makes: who they are, where they have worked, what they
 * built, then the evidence for it.
 *
 * FIELDS THAT ARE NOT HERE YET RENDER NOTHING RATHER THAN A PLACEHOLDER. `about`, `stats`,
 * `email`, `location` and `github_url` are optional because the public projection cannot
 * emit them yet. Each block below is guarded, so when the projection starts sending them
 * they appear with no change to this file - and until then the page is shorter, not
 * broken. Nothing here invents a value to fill a slot.
 */

interface Capability { name: string; count: number; proven?: boolean; on_sample?: boolean }
interface RecordLink { slug: string; title: string; published_at: string | null }

interface ProjectItem {
  title: string; organization: string | null; industry: string | null;
  problem: string | null; automation_goal: string | null; stage: string | null;
  repo_url: string | null; demo_url: string | null;
  /** An image committed to the project's own PUBLIC repo. Null when there is none. */
  hero_image_url?: string | null;
}

interface Repository { name: string; url: string }

interface PortfolioStats {
  years_experience?: number | null;
  files_committed?: number | null;
  capabilities?: number | null;
  evidence_records?: number | null;
}

interface Portfolio {
  identity: {
    full_name: string; headline: string | null; cohort_name: string | null;
    avatar_data_url: string | null; linkedin_url: string | null;
    email?: string | null; location?: string | null; github_url?: string | null;
  };
  about?: string[];
  stats?: PortfolioStats;
  experience?: ExperienceItem[];
  education?: EducationItem[];
  capabilities: Capability[];
  projects: ProjectItem[];
  records: RecordLink[];
  repositories: Repository[];
  private_repository_count: number;
  generated_at: string;
}

/** Up to two initials, for an avatar or a project with no image. */
function initials(text: string): string {
  const words = (text || '').split(/\s+/).filter(Boolean);
  if (!words.length) return '#';
  return words.slice(0, 2).map((w) => w[0]).join('').toUpperCase();
}

/** A bare hostname, so a long profile URL does not blow out the 296px rail. */
function shortLink(url: string): string {
  try {
    const u = new URL(url);
    return (u.hostname.replace(/^www\./, '') + u.pathname).replace(/\/$/, '');
  } catch {
    return url;
  }
}

/**
 * The project's hero.
 *
 * An image is shown ONLY when the backend found one in the project's own PUBLIC repo.
 * With none, this renders a typographic tile rather than a broken frame or stock art: an
 * invented image would be the one thing on this page that is not the person's own work.
 * `onError` collapses to the same tile, so a file deleted after publication degrades
 * honestly instead of showing a browser error glyph.
 */
const Hero: React.FC<{ title: string; src?: string | null }> = ({ title, src }) => {
  const [failed, setFailed] = React.useState(false);
  const show = !!src && !failed;
  return (
    <div className="pf-hero">
      {show ? (
        <img
          src={src as string}
          alt=""
          loading="lazy"
          referrerPolicy="no-referrer"
          onError={() => setFailed(true)}
        />
      ) : (
        <span className="pf-mono" aria-hidden="true">{initials(title)}</span>
      )}
    </div>
  );
};

const StatTile: React.FC<{ value: number | null | undefined; label: string }> = (
  { value, label },
) => {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) return null;
  return (
    <div className="pf-stat">
      <b>{value}</b>
      <span>{label}</span>
    </div>
  );
};

const PortfolioBody: React.FC<{ portfolio: Portfolio }> = ({ portfolio }) => {
  const { identity, capabilities, records, repositories, private_repository_count } = portfolio;
  const projects = portfolio.projects || [];
  const experience = portfolio.experience || [];
  const education = portfolio.education || [];
  const about = portfolio.about || [];
  const stats = portfolio.stats || {};

  const statTiles = [
    { value: stats.years_experience, label: 'Years experience' },
    { value: stats.files_committed, label: 'Files committed' },
    { value: stats.capabilities, label: 'Capabilities' },
    { value: stats.evidence_records, label: 'Evidence records' },
  ].filter((t) => typeof t.value === 'number' && (t.value as number) > 0);

  const isEmpty = !capabilities.length && !records.length && !repositories.length
    && !projects.length && !experience.length && !education.length && !about.length;

  return (
    <div className="pf">
      <nav className="pf-nav">
        <div className="pf-nav-in">
          <span className="pf-brand">
            <span className="pf-mark" aria-hidden="true">C</span>
            Colaberry
          </span>
          <div className="pf-navlinks">
            {(about.length > 0 || statTiles.length > 0) && (
              <a className="pf-navlink" href="#overview">Overview</a>
            )}
            {experience.length > 0 && <a className="pf-navlink" href="#experience">Experience</a>}
            {projects.length > 0 && <a className="pf-navlink" href="#projects">Projects</a>}
            {capabilities.length > 0 && <a className="pf-navlink" href="#skills">Skills</a>}
          </div>
        </div>
      </nav>

      <div className="pf-wrap">
        <aside className="pf-rail">
          <div className="pf-avatar">
            {identity.avatar_data_url
              ? <img src={identity.avatar_data_url} alt="" />
              : <span aria-hidden="true">{initials(identity.full_name)}</span>}
          </div>
          <h1 className="pf-name">{identity.full_name}</h1>
          {identity.headline && <div className="pf-role">{identity.headline}</div>}
          {identity.location && <div className="pf-loc">{identity.location}</div>}
          {identity.cohort_name && <div className="pf-loc">{identity.cohort_name}</div>}

          {(identity.email || identity.linkedin_url || identity.github_url) && (
            <>
              <div className="pf-railhead">Contact</div>
              <ul className="pf-contact">
                {identity.email && (
                  <li><a href={`mailto:${identity.email}`}>{identity.email}</a></li>
                )}
                {identity.linkedin_url && (
                  <li>
                    <a href={identity.linkedin_url} target="_blank" rel="noopener noreferrer">
                      {shortLink(identity.linkedin_url)}
                    </a>
                  </li>
                )}
                {identity.github_url && (
                  <li>
                    <a href={identity.github_url} target="_blank" rel="noopener noreferrer">
                      {shortLink(identity.github_url)}
                    </a>
                  </li>
                )}
              </ul>
            </>
          )}

          {/* PROVEN BY COMMITTED FILES, not by curriculum consumption. This band once read
              "Verified by Colaberry - N pieces of evidence" from the assessment tables.
              Every one of those 8,895 rows is source='timeline' - content opened, one row
              per band - so the number meant attendance while the label claimed proof. On a
              page built for recruiters that was the most damaging line here. */}
          {capabilities.length > 0 && (
            <>
              <div className="pf-railhead">Proven in their repo</div>
              <ul className="pf-proven">
                {capabilities.map((c) => (
                  <li key={c.name}>
                    <span className="pf-tick" aria-hidden="true">&#10003;</span>
                    <span>
                      {c.name}
                      {c.on_sample && (
                        <span style={{ color: 'var(--pf-mut)' }}> &middot; on the sample</span>
                      )}
                    </span>
                  </li>
                ))}
              </ul>
            </>
          )}
        </aside>

        <main>
          {(about.length > 0 || statTiles.length > 0) && (
            <section id="overview">
              {about.length > 0 && (
                <div className="pf-card pf-about">
                  <SectionHead badge="from their record and resume">About</SectionHead>
                  <Rule />
                  {about.map((p, i) => <p key={i}>{p}</p>)}
                </div>
              )}
              {statTiles.length > 0 && (
                <div className="pf-stats">
                  {statTiles.map((t) => (
                    <StatTile key={t.label} value={t.value} label={t.label} />
                  ))}
                </div>
              )}
            </section>
          )}

          <ExperienceSection items={experience} badge="parsed from their resume" />

          {projects.length > 0 && (
            <section id="projects" className="pf-card">
              <SectionHead>
                {projects.length === 1 ? 'Selected work' : `Selected work (${projects.length})`}
              </SectionHead>
              <Rule />
              <div className="pf-projects">
                {projects.map((p, i) => {
                  const meta = [p.organization, p.industry].filter(Boolean).join(' · ');
                  return (
                    <article className="pf-proj" key={`${p.title}${i}`}>
                      <Hero title={p.title} src={p.hero_image_url} />
                      <div className="pf-projbody">
                        <h3 className="pf-projttl">{p.title}</h3>
                        {meta && <div className="pf-projmeta">{meta}</div>}
                        {p.problem && <p className="pf-projtext">{p.problem}</p>}
                        {p.automation_goal && <p className="pf-projtext">{p.automation_goal}</p>}
                        {(p.repo_url || p.demo_url) && (
                          <div className="pf-projlinks">
                            {p.demo_url && (
                              <a href={p.demo_url} target="_blank" rel="noopener noreferrer">
                                View it live
                              </a>
                            )}
                            {p.repo_url && (
                              <a href={p.repo_url} target="_blank" rel="noopener noreferrer">
                                Read the code
                              </a>
                            )}
                          </div>
                        )}
                      </div>
                    </article>
                  );
                })}
              </div>
            </section>
          )}

          {records.length > 0 && (
            <section id="skills" className="pf-card">
              <SectionHead>
                {records.length === 1 ? 'Written up' : `Written up (${records.length})`}
              </SectionHead>
              <Rule />
              <ul className="pf-list">
                {records.map((r) => (
                  // The record is where the depth lives; this page is the index.
                  <li key={r.slug}><a href={`/p/${r.slug}`}>{r.title}</a></li>
                ))}
              </ul>
            </section>
          )}

          <EducationSection items={education} />

          {(repositories.length > 0 || private_repository_count > 0) && (
            <section className="pf-card">
              <SectionHead>Code</SectionHead>
              <Rule />
              <ul className="pf-list">
                {repositories.map((r) => (
                  <li key={r.url}>
                    <a href={r.url} target="_blank" rel="noopener noreferrer">{r.name}</a>
                  </li>
                ))}
              </ul>
              {private_repository_count > 0 && (
                // The honest statement -- there was more work behind this -- without the identity.
                <p className="pf-projmeta" style={{ marginTop: 8 }}>
                  and {private_repository_count} private{' '}
                  {private_repository_count === 1 ? 'repository' : 'repositories'}
                </p>
              )}
            </section>
          )}

          {/* An entirely empty portfolio is a real state and says so plainly, rather than
              rendering a page of blank headings that reads as abandonment. */}
          {isEmpty && (
            <div className="pf-card">
              <p className="pf-empty">This portfolio does not have any published work yet.</p>
            </div>
          )}
        </main>
      </div>

      {/* The one place the platform names itself, at the foot, after the work. */}
      <footer className="pf-foot">Colaberry &middot; powered by Refactored.ai</footer>
    </div>
  );
};

export default PortfolioBody;
export type { Portfolio };
