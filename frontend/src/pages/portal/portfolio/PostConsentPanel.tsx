import React, { useEffect, useState } from 'react';
import { fetchPostConsent, setPostConsent, type PostConsentRow } from '../../../services/careerApi';

/**
 * PostConsentPanel — which of their own words a learner puts on a public page.
 *
 * WHY IT DID NOT EXIST. The compiler has always filtered posts on `shared_to_portfolio`,
 * and nothing could set it. 70 visible posts across 28 learners were written, shown on the
 * cohort wall, and structurally unable to reach the page they were written to feed.
 *
 * CONSENT DEFAULTS OFF, and stays a per-post decision. These were written for a closed
 * cohort; a public page is a different audience. The week-1 answer in particular is often
 * candid about frustration at work, which is exactly why this is not one global switch.
 *
 * A REMOVED POST CANNOT BE SHARED. Moderation wins over consent, so its control is
 * disabled and the reason is stated rather than the row being hidden — a learner who
 * cannot find a post they wrote would reasonably assume the page is broken.
 */
const PostConsentPanel: React.FC = () => {
  const [posts, setPosts] = useState<PostConsentRow[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    fetchPostConsent()
      .then((p) => { if (live) setPosts(p); })
      .catch(() => { if (live) setError('Could not load your posts.'); });
    return () => { live = false; };
  }, []);

  const toggle = async (row: PostConsentRow) => {
    setBusy(row.id);
    setError(null);
    try {
      const updated = await setPostConsent(row.id, !row.shared);
      setPosts((cur) => (cur ?? []).map((p) => (p.id === updated.id ? updated : p)));
    } catch (e: any) {
      // The server distinguishes "not saved" from "saved but the page was not rebuilt".
      // The second matters far more to the learner, so it is shown verbatim.
      setError(e?.response?.data?.error || 'That did not save. Please try again.');
    } finally {
      setBusy(null);
    }
  };

  if (error && !posts) return <p className="cp-muted">{error}</p>;
  if (!posts) return <p className="cp-muted">Loading…</p>;
  if (!posts.length) return null;

  const shared = posts.filter((p) => p.shared).length;

  return (
    <section className="cp-card">
      <h3 className="cp-card-h">Your words</h3>
      <p className="cp-muted" style={{ marginTop: 0 }}>
        You wrote these for your cohort. Choose which ones a stranger may read.
        {shared > 0 && <> {shared} of {posts.length} shared.</>}
      </p>

      <ul className="cp-posts">
        {posts.map((p) => (
          <li key={p.id} className={`cp-post${p.shared ? ' is-shared' : ''}`}>
            <div className="cp-post-main">
              <div className="cp-post-h">
                {p.week != null && <span className="cp-week">Week {p.week}</span>}
                {p.ritual && <span className="cp-ritual">{p.ritual}</span>}
                {p.removed && <span className="cp-removed">removed by moderation</span>}
              </div>
              {p.headline && <div className="cp-post-title">{p.headline}</div>}
              {p.excerpt && <p className="cp-post-x">{p.excerpt}</p>}
            </div>
            <button
              type="button"
              className={`cp-btn${p.shared ? '' : ' ghost'}`}
              disabled={busy === p.id || p.removed}
              onClick={() => toggle(p)}
              title={p.removed ? 'A post removed by moderation cannot be shared.' : undefined}
            >
              {busy === p.id ? '…' : p.shared ? 'Shared' : 'Share this'}
            </button>
          </li>
        ))}
      </ul>

      <p className="cp-fine">
        Unsharing takes the post off your published page immediately, not just off this list.
      </p>
      {error && <p className="cp-error">{error}</p>}
    </section>
  );
};

export default PostConsentPanel;
