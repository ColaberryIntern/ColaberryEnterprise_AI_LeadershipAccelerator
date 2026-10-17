import React from 'react';
import { SectionHead, Rule } from './PortfolioHistory';
import type {
  Capability, Competency, EvidenceSource, Repository, VerifiedCommit,
} from './portfolioTypes';

/**
 * PortfolioEvidence - the half of the public portfolio that answers "how do you know?"
 *
 * SPLIT OUT OF `PortfolioBody.tsx` at 538 lines, against CLAUDE.md's 500-line ceiling,
 * on the seam that was already there: the top of the page is the person and their work,
 * and everything below it is the evidence. `PortfolioHistory.tsx` took experience and
 * education out on the same principle.
 *
 * Every section here renders nothing when it has nothing. A heading over an empty list
 * reads as a page that is broken rather than a learner who has not done that part yet.
 */

/** Skills, each traceable to a committed file. */
export const SkillsSection: React.FC<{ items: Capability[] }> = ({ items }) => {
  if (!items.length) return null;
  return (
    <section id="skills" className="pf-card">
      <SectionHead badge="every line traces to committed code">
        Skills, and why each is listed
      </SectionHead>
      <Rule />
      <ul className="pf-list">
        {items.map((c) => (
          <li key={c.name} className="pf-row">
            <span className="pf-title" style={{ fontSize: 15 }}>{c.name}</span>
            <span style={{ color: 'var(--pf-mut)', fontSize: 13.5 }}>
              {c.count > 1 && <>{c.count} committed</>}
              {c.proven && <>{c.count > 1 ? ' · ' : ''}demonstrated</>}
              {c.on_sample && <> · built on the sample</>}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
};

/** Competency bars, drawn relative to the learner's own strongest domain. */
export const CompetenciesSection: React.FC<{
  items: Competency[]; domainCount: number;
}> = ({ items, domainCount }) => {
  if (!items.length) return null;
  // Relative to the strongest domain, so the shape of the profile reads at a glance
  // without implying a ceiling nobody defined.
  const topScore = items.reduce((m, c) => Math.max(m, c.score), 0) || 1;
  return (
    <section className="pf-card">
      <SectionHead badge="from validated evidence">Competencies earned</SectionHead>
      <Rule />
      {items.map((c) => (
        <div className="pf-bar" key={c.domain}>
          <div className="pf-bar-label">{c.label}</div>
          <div className="pf-bar-track">
            <div
              className="pf-bar-fill"
              style={{ width: `${Math.max(4, Math.round((c.score / topScore) * 100))}%` }}
            />
          </div>
          <div className="pf-bar-val">{c.score}</div>
        </div>
      ))}
      {/* The list is capped, so it says so rather than implying it is the whole. */}
      {domainCount > items.length && (
        <p className="pf-note">
          Showing the strongest {items.length} of {domainCount} domains.
        </p>
      )}
    </section>
  );
};

/** Where the evidence came from, counted by source. */
export const EvidenceSourceSection: React.FC<{ items: EvidenceSource[] }> = ({ items }) => {
  if (!items.length) return null;
  return (
    <section className="pf-card">
      <SectionHead>Evidence behind those competencies</SectionHead>
      <Rule />
      <div className="pf-chips">
        {items.map((e) => (
          <div className="pf-chip" key={e.source_type}>
            <b>{e.count}</b>
            <span>{e.label}</span>
          </div>
        ))}
      </div>
      {/* The distinction this page has to keep making, stated once, plainly. */}
      <p className="pf-note">
        Each record is something they did and submitted. None of it is time spent reading.
      </p>
    </section>
  );
};

/**
 * The repository a commit lives in, read off its own URL.
 *
 * Shown on every row because `story_id` is scoped per project, so one page can carry four
 * different stories all called STORY-001. Measured on the published page: 45 verified
 * stories across 4 repositories under 14 distinct ids. Without the repository name a reader
 * meets the same label repeatedly and cannot tell which project each belongs to.
 */
function repoOf(commitUrl: string): string | null {
  const m = /^https:\/\/github\.com\/[^/]+\/([^/]+)\/commit\//.exec(commitUrl);
  return m ? m[1] : null;
}

/** A date a stranger can read, or nothing. Never an Invalid Date. */
function readableDate(iso: string | null): string | null {
  if (!iso) return null;
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return null;
  return new Date(t).toLocaleDateString('en-US', {
    year: 'numeric', month: 'short', day: 'numeric',
  });
}

/**
 * The verified stories, each linking to the commit that satisfied it.
 *
 * THIS IS WHAT C5.0 ASKED FOR: a stranger with the link can see what the story asked for,
 * the commit that satisfied it and the verification result, without logging in and
 * without taking our word for it. Up to here the page reached the REPOSITORY, which left
 * a reader to go hunting through a commit history for the one we meant.
 *
 * A row is rendered only with a link. The backend emits no row without a commit URL -
 * an unverified commit, or one in a private repository, never arrives - so there is no
 * case here where the page states an award it cannot send the reader to check. The guard
 * below is belt and braces for a payload from an older backend, not a real branch.
 */
export const VerifiedCommitsSection: React.FC<{ items: VerifiedCommit[] }> = ({ items }) => {
  const rows = items.filter((c) => c && typeof c.commit_url === 'string' && c.commit_url);
  if (!rows.length) return null;
  return (
    <section id="verified" className="pf-card">
      <SectionHead badge="click any one to read the commit on GitHub">
        {rows.length === 1 ? 'Verified work you can check'
          : `Verified work you can check (${rows.length})`}
      </SectionHead>
      <Rule />
      <ul className="pf-list">
        {rows.map((c) => {
          const when = readableDate(c.committed_at);
          // Both numbers or neither. "3 of" is worse than silence.
          const criteria = typeof c.criteria_passed === 'number'
            && typeof c.criteria_total === 'number' && c.criteria_total > 0
            ? `${c.criteria_passed} of ${c.criteria_total} criteria met`
            : null;
          const repo = repoOf(c.commit_url);
          const meta = [repo, criteria].filter(Boolean).join(' · ');
          return (
            // The id alone is NOT unique on this page: four projects each have a STORY-001.
            <li key={`${c.story_id}|${c.commit_url}`} className="pf-row">
              <span>
                <a
                  className="pf-title pf-commit-ttl"
                  href={c.commit_url}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  {c.title || c.story_id}
                </a>
                {meta && <span className="pf-commit-meta">{meta}</span>}
              </span>
              <span className="pf-commit-right">
                {when && <span className="pf-commit-when">{when}</span>}
                <a
                  className="pf-sha"
                  href={c.commit_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={`Commit ${c.commit_sha_short} on GitHub`}
                >
                  {c.commit_sha_short}
                </a>
              </span>
            </li>
          );
        })}
      </ul>
      {/* Says who checked it and against what, so the reader is not asked to trust a tick. */}
      <p className="pf-note">
        Each line was checked by the build pipeline against the story&apos;s own acceptance
        criteria before it was listed here. The commit is the learner&apos;s, in their own
        repository, and the link goes straight to it.
      </p>
    </section>
  );
};

/** The repositories themselves, with the private ones counted but not named. */
export const CodeSection: React.FC<{
  repositories: Repository[]; privateCount: number;
}> = ({ repositories, privateCount }) => {
  if (!repositories.length && privateCount <= 0) return null;
  return (
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
      {privateCount > 0 && (
        // The honest statement -- there was more work behind this -- without the identity.
        <p className="pf-projmeta" style={{ marginTop: 8 }}>
          and {privateCount} private{' '}
          {privateCount === 1 ? 'repository' : 'repositories'}
        </p>
      )}
    </section>
  );
};
