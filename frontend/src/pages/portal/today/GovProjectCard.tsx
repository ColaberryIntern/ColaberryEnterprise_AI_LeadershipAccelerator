import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import './InternshipOpportunityCard.css';
import { listMyGovProjects, type MyGovProjectCard } from '../../../services/govProjectPortalApi';

/**
 * GovProjectCard — the "on your profile" entry to an assigned GOVERNMENT project (P6). The gov portal page
 * (/portal/gov-projects/:id) is otherwise reachable only by direct URL; this card is the way in. It is
 * membership-scoped server-side (listMyGovProjects returns only the caller's active, non-archived gov
 * assignments), and it self-hides when there are none — the rail simply has one fewer entry, which is the
 * correct degraded state for a status surface (the same rule InternshipCommandCard follows).
 */
const GovProjectCard: React.FC = () => {
  const [projects, setProjects] = useState<MyGovProjectCard[] | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let alive = true;
    listMyGovProjects()
      .then((p) => { if (alive) setProjects(p); })
      .catch(() => { if (alive) setFailed(true); });
    return () => { alive = false; };
  }, []);

  if (failed || !projects || projects.length === 0) return null;
  const primary = projects[0];

  return (
    <section className="te-card te-scard te-intern accent-berry" aria-labelledby="te-gov-proj">
      <span className="te-intern__badge">Government project</span>
      <h3 id="te-gov-proj">{primary.name}</h3>
      <p className="te-intern__body">
        You are on this government pursuit. Open it for the proposal shared with you, your build stories, and what is left before submission.
      </p>
      <div className="te-intern__actions">
        <Link className="te-btn berry te-intern__cta" to={`/portal/gov-projects/${encodeURIComponent(primary.projectId)}`}>
          Open your project
        </Link>
      </div>
      {projects.length > 1 && (
        <dl className="te-intern__facts">
          <div>
            <dt>Projects</dt>
            <dd>{projects.length}</dd>
          </div>
        </dl>
      )}
    </section>
  );
};

export default GovProjectCard;
