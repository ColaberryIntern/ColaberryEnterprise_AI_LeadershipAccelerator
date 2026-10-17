import React from 'react';
import './portfolio.css';
import {
  ExperienceSection, EducationSection, SectionHead, Rule,
} from './PortfolioHistory';
import {
  SkillsSection, CompetenciesSection, EvidenceSourceSection,
  VerifiedCommitsSection, CodeSection,
} from './PortfolioEvidence';
import type { Portfolio, ProjectItem } from './portfolioTypes';

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

/**
 * Where a project card drills to, or null when it should not be clickable at all.
 *
 * A CASE STUDY IS THE ONLY DESTINATION. Ali: "when I click on the project, it takes me to
 * a page we don't even use anymore. It should only be clickable if it's connected to a
 * Case study. Otherwise the other links are just fine."
 *
 * `/p/:slug` — the capstone record — was the fallback and is now refused. A card that
 * looks clickable and lands somewhere retired is worse than a card that does not invite
 * the click: the reader has already spent the click before learning it was not worth it.
 * `record_slug` is still published, so restoring the fallback is a one-line change if
 * that surface comes back.
 *
 * The repository and demo links are untouched. They go where they say they go.
 */
function drillTarget(p: ProjectItem): { href: string; label: string } | null {
  if (p.case_study_slug) {
    return { href: `/stories/${p.case_study_slug}`, label: 'Read the full case study' };
  }
  return null;
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

/**
 * `embedded` renders the same document WITHOUT the page furniture: no top nav, no
 * full-height page background, no sticky rail. It exists because this component is shown
 * in three places and only one of them IS a page - the learner previews it inside the
 * Publishing tab and a reviewer inside the admin screen, where a second sticky brand bar
 * halfway down somebody else's layout is a bug, not a feature. The CONTENT is identical
 * in all three, which is the property worth protecting.
 */
const PortfolioBody: React.FC<{ portfolio: Portfolio; embedded?: boolean }> = ({
  portfolio, embedded = false,
}) => {
  const { identity, capabilities, records, repositories, private_repository_count } = portfolio;
  const projects = portfolio.projects || [];
  const experience = portfolio.experience || [];
  const education = portfolio.education || [];
  const about = portfolio.about || [];
  const stats = portfolio.stats || {};
  const featured = portfolio.featured || null;
  const competencies = portfolio.competencies || [];
  const domainCount = portfolio.competency_domain_count || 0;
  const evidenceBySource = portfolio.evidence_by_source || [];
  const verifiedCommits = portfolio.verified_commits || [];

  const statTiles = [
    { value: stats.years_experience, label: 'Years experience' },
    { value: stats.files_committed, label: 'Files committed' },
    // NOT just 'Capabilities'. The Career Studio shows the learner a stat labelled
    // "verified capabilities", counted from the CAPE skills ledger by evidence level.
    // THIS number is a different measure entirely - capabilities the platform found
    // PRESENT IN THEIR REPOSITORY. Both are honest and they do not agree, so sharing
    // one word across the two pages a learner compares makes a correct page look
    // broken. The source is named here for the same reason the rail below says
    // "Proven in their repo" and CapstoneRecordPage says it too.
    { value: stats.capabilities, label: 'Capabilities in repo' },
    { value: stats.evidence_records, label: 'Evidence records' },
  ].filter((t) => typeof t.value === 'number' && (t.value as number) > 0);

  const isEmpty = !capabilities.length && !records.length && !repositories.length
    && !projects.length && !experience.length && !education.length && !about.length
    && !verifiedCommits.length;

  return (
    <div className={embedded ? 'pf pf-embedded' : 'pf'}>
      {!embedded && (
      <nav className="pf-nav">
        <div className="pf-nav-in">
          {/* Refactored.ai, not Colaberry, and the wordmark carries the name so no
              heading text sits beside it. The asset is vendored into /public rather
              than hot-linked from their CDN: this is a public page, and a third-party
              request on it is a third party watching whoever reads it. */}
          <img
            className="pf-logo"
            src="/refactored-logo.svg"
            alt="Refactored.ai"
            width={256}
            height={50}
          />
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
      )}

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

          {featured && (
            <section className="pf-card">
              <SectionHead>Featured project</SectionHead>
              <Rule />
              <h3 className="pf-feat-name">{featured.name}</h3>
              {featured.repo_url && (
                <a className="pf-feat-repo" href={featured.repo_url}
                   target="_blank" rel="noopener noreferrer">
                  {featured.repo_url.replace(/^https:\/\/github\.com\//, '')}
                </a>
              )}
              {/* Each figure comes from the repository itself. A null renders no cell at
                  all, so a project the platform can see less of simply says less. */}
              <div className="pf-feat-nums">
                {[
                  { v: featured.files, l: 'Files' },
                  { v: featured.top_level_areas, l: 'Top level areas' },
                  { v: featured.capabilities, l: 'Capabilities' },
                  { v: featured.languages, l: 'Languages' },
                ].filter((n) => typeof n.v === 'number' && (n.v as number) > 0).map((n) => (
                  <div className="pf-feat-num" key={n.l}>
                    <b>{n.v}</b>
                    <span>{n.l}</span>
                  </div>
                ))}
              </div>
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
                  const drill = drillTarget(p);
                  return (
                    <article className="pf-proj" key={`${p.title}${i}`}>
                      {/* THE WHOLE CARD DRILLS IN when a write-up exists. Ali: "I should
                          be able to drill into the projects and get a similar Case study."
                          The hero and the title are one target rather than a small link,
                          because a card that is clickable in one corner reads as a card
                          that is not clickable. */}
                      {drill
                        ? <a href={drill.href} className="pf-hero-link"><Hero title={p.title} src={p.hero_image_url} /></a>
                        : <Hero title={p.title} src={p.hero_image_url} />}
                      <div className="pf-projbody">
                        <h3 className="pf-projttl">
                          {drill
                            ? <a href={drill.href} className="pf-projttl-link">{p.title}</a>
                            : p.title}
                        </h3>
                        {meta && <div className="pf-projmeta">{meta}</div>}
                        {p.problem && <p className="pf-projtext">{p.problem}</p>}
                        {p.automation_goal && <p className="pf-projtext">{p.automation_goal}</p>}
                        {(p.repo_url || p.demo_url || drill) && (
                          <div className="pf-projlinks">
                            {/* Named for what it is rather than "read more": this is the
                                long-form account of the build, not a teaser. */}
                            {drill && <a href={drill.href}>{drill.label}</a>}
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
            <section className="pf-card">
              <SectionHead>
                {records.length === 1 ? 'Written up' : `Written up (${records.length})`}
              </SectionHead>
              <Rule />
              <ul className="pf-list">
                {records.map((r) => (
                  <li key={r.slug}>
                    {/* Offered as a link ONLY when there is a case study to open. The
                        record's own /p/ address is a retired surface, so a write-up
                        without a case study is stated rather than linked -- it happened,
                        and saying so is true, but there is nowhere good to send anyone. */}
                    {r.case_study_slug
                      ? <a href={`/stories/${r.case_study_slug}`}>{r.title}</a>
                      : <span className="pf-list-plain">{r.title}</span>}
                  </li>
                ))}
              </ul>
            </section>
          )}

          <EducationSection items={education} />

          {/* Every line here traces to a file in their repository. The count IS the
              reason: it is what the platform observed, not a claim about quality. */}
          <SkillsSection items={capabilities} />

          <CompetenciesSection items={competencies} domainCount={domainCount} />

          <EvidenceSourceSection items={evidenceBySource} />

          <CodeSection
            repositories={repositories}
            privateCount={private_repository_count}
          />

          {/* LAST, because it is the strongest thing on the page and it answers the
              question the sections above raise. Everything higher up is a claim the
              platform makes about this person; these rows hand the reader the commit
              and invite them to check it themselves. */}
          <VerifiedCommitsSection items={verifiedCommits} />

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
