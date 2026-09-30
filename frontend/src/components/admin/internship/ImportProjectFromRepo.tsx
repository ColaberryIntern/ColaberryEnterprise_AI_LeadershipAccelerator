import React, { useEffect, useState } from 'react';
import api from '../../../utils/api';
import { SectionCard } from '../shell';
import { IntakeStudent, searchIntakeStudents } from '../../../services/adminFlotationIntakeApi';

/**
 * Add a project that was never built here, from its repository.
 *
 *     "Also allow me to add projects that aren't connected to the system, but I
 *      can give you the repo to read and upload the project."  (Ali, 2026-09-29)
 *
 * The repository becomes a brief and the brief goes through the same pipeline
 * everything else does, so what lands is a normal project: releases, stories,
 * requirements, a case-study score, and a place on the board beside the rest.
 *
 * It reads the README and docs, not the source. That is worth saying on screen
 * rather than only in the code, because it sets the expectation for what comes
 * back: a repository with a thin README produces a thin plan, and the fix is a
 * better README rather than a retry.
 */

interface ImportResult {
  project_id: string;
  repo: string;
  docs_read: string[];
  reused_project: boolean;
  status: string;
}

const ImportProjectFromRepo: React.FC<{ onImported?: (projectId: string) => void }> = ({ onImported }) => {
  const [repoUrl, setRepoUrl] = useState('');
  const [name, setName] = useState('');
  const [query, setQuery] = useState('');
  const [matches, setMatches] = useState<IntakeStudent[]>([]);
  const [student, setStudent] = useState<IntakeStudent | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ImportResult | null>(null);

  // Same debounce and two-character floor as the intake search; the server
  // refuses less, so asking earlier is a wasted round trip.
  useEffect(() => {
    const q = query.trim();
    if (q.length < 2 || student) { setMatches([]); return undefined; }
    let live = true;
    const t = setTimeout(async () => {
      try {
        const found = await searchIntakeStudents(q);
        if (live) setMatches(found);
      } catch {
        if (live) setMatches([]);
      }
    }, 250);
    return () => { live = false; clearTimeout(t); };
  }, [query, student]);

  const submit = async () => {
    if (!repoUrl.trim() || !student || busy) return;
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      const { data } = await api.post<ImportResult>('/api/admin/flotation/import-repo', {
        repo_url: repoUrl.trim(),
        enrollment_id: student.id,
        name: name.trim() || null,
      });
      setResult(data);
      onImported?.(data.project_id);
    } catch (err: any) {
      setError(err?.response?.data?.error ?? 'Could not import that repository.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <SectionCard
      title="Add a project from a repository"
      icon="git-repository-line"
      subtitle="For work built outside the platform. It reads the README and docs, then builds the plan the same way everything else is built."
    >
      {error && <div className="alert alert-danger py-2" role="alert" style={{ fontSize: 13 }}>{error}</div>}

      {result ? (
        <div className="alert alert-success py-2 mb-0" role="status" style={{ fontSize: 13 }}>
          <div><strong>{result.repo}</strong> is being decomposed. It is held for your review and nobody else can see it yet.</div>
          <div className="mt-1">
            Read: {result.docs_read.length ? result.docs_read.join(', ') : 'nothing'}
            {result.reused_project && ' · landed on their existing empty project rather than a new one'}
          </div>
          <button type="button" className="btn btn-sm btn-link p-0 mt-1" onClick={() => { setResult(null); setRepoUrl(''); setName(''); }}>
            Import another
          </button>
        </div>
      ) : (
        <div className="d-flex flex-column gap-2" style={{ maxWidth: 620 }}>
          <div>
            <label htmlFor="import-repo-url" className="form-label small fw-semibold mb-1">Repository</label>
            <input
              id="import-repo-url"
              className="form-control form-control-sm"
              placeholder="https://github.com/owner/repo, or owner/repo"
              value={repoUrl}
              onChange={(e) => setRepoUrl(e.target.value)}
              autoComplete="off"
            />
          </div>

          <div>
            <label htmlFor="import-repo-who" className="form-label small fw-semibold mb-1">Who does it belong to?</label>
            {student ? (
              <div className="d-flex align-items-center gap-2">
                <span className="fw-semibold" style={{ fontSize: 13 }}>{student.full_name || student.email}</span>
                <button type="button" className="btn btn-sm btn-link p-0" onClick={() => { setStudent(null); setQuery(''); }}>
                  change
                </button>
              </div>
            ) : (
              <>
                <input
                  id="import-repo-who"
                  className="form-control form-control-sm"
                  placeholder="Search by name or email"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  autoComplete="off"
                />
                {matches.length > 0 && (
                  <div className="list-group mt-2">
                    {matches.map((m) => (
                      <button
                        key={m.id} type="button"
                        className="list-group-item list-group-item-action py-2"
                        onClick={() => { setStudent(m); setMatches([]); }}
                      >
                        <span className="fw-semibold">{m.full_name || m.email}</span>
                        <span className="text-muted ms-2" style={{ fontSize: 12 }}>{m.email}</span>
                      </button>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>

          <div>
            <label htmlFor="import-repo-name" className="form-label small fw-semibold mb-1">Project name (optional)</label>
            <input
              id="import-repo-name"
              className="form-control form-control-sm"
              placeholder="Defaults to the repository name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoComplete="off"
            />
          </div>

          <div>
            <button
              type="button" className="btn btn-sm btn-primary"
              disabled={!repoUrl.trim() || !student || busy}
              onClick={submit}
            >
              {busy ? 'Reading the repository…' : 'Read it and build the plan'}
            </button>
            <span className="text-muted ms-2" style={{ fontSize: 12 }}>
              Takes a few minutes. Nothing reaches them until you assign it.
            </span>
          </div>
        </div>
      )}
    </SectionCard>
  );
};

export default ImportProjectFromRepo;
