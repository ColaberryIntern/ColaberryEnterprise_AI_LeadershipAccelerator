import React from 'react';
import {
  CommunityPanel, ContentPanel, MentorPanel, ProfileContextPanel, SkillsPanel,
} from '../../../adminOs/personTypes';
import { EmptyPanel, Field, Stat, fmtDate, fmtDateTime } from './primitives';

/**
 * Development and personal context — the four panels nobody asked for by name
 * but that answer the questions a mentor or account owner actually has.
 *
 * Content consumption sits here deliberately. lifecycle.ts marks active_learner
 * unjoinable because attendance is unreliable; podcast, blog and video views are
 * not — they are written on the learner's own action, every time. For anyone
 * outside a cohort that takes a register, this is the engagement record.
 */
export default function GrowthTab({ skills, mentor, content, community, context }: {
  skills: SkillsPanel | null | undefined;
  mentor: MentorPanel | null | undefined;
  content: ContentPanel | null | undefined;
  community: CommunityPanel | null | undefined;
  context: ProfileContextPanel | null | undefined;
}) {
  if (!skills && !mentor && !content && !community && !context) {
    return <EmptyPanel>No enrolment, so there is no development record to show.</EmptyPanel>;
  }

  return (
    <>
      {context && (
        <div className="card border-0 shadow-sm mb-4">
          <div className="card-header bg-white fw-semibold">Their context</div>
          <div className="card-body">
            <div className="row">
              <Field label="Company" value={context.companyName} />
              <Field label="Role" value={context.role} />
              <Field label="Industry" value={context.industry} />
              <Field label="Company size" value={context.companySize} />
              <Field label="AI maturity" value={context.aiMaturityLevel} />
              <Field
                label="Résumé"
                value={context.resumeFileName
                  ? `${context.resumeFileName}${context.resumeUploadedAt ? ` · ${fmtDate(context.resumeUploadedAt)}` : ''}`
                  : null}
              />
              <Field
                label="LinkedIn"
                value={context.linkedinUrl
                  ? <a href={context.linkedinUrl} target="_blank" rel="noreferrer">Profile</a>
                  : null}
              />
              <Field label="Goal" value={context.goal} wide />
              <Field label="Identified use case" value={context.identifiedUseCase} wide />
            </div>

            {context.githubRepos.length > 0 && (
              <div className="mt-2">
                <div className="text-muted text-uppercase mb-2" style={{ letterSpacing: '.05em', fontSize: '.68rem' }}>
                  Connected repositories
                </div>
                {context.githubRepos.map((r, i) => (
                  <div key={`${r.repoUrl}-${i}`} className="small mb-1">
                    {r.repoUrl
                      ? <a href={r.repoUrl} target="_blank" rel="noreferrer">{r.repoUrl}</a>
                      : <span className="text-muted">Unnamed repository</span>}
                    <span className="text-muted">
                      {r.language && ` · ${r.language}`}
                      {r.fileCount !== null && ` · ${r.fileCount} files`}
                      {r.lastSyncAt && ` · synced ${fmtDate(r.lastSyncAt)}`}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {skills && (
        <div className="card border-0 shadow-sm mb-4">
          <div className="card-header bg-white fw-semibold">Skills and evidence</div>
          <div className="card-body">
            <div className="row g-3 mb-3">
              <Stat
                label="Level"
                value={skills.level?.slug ?? null}
                hint={skills.level?.rank !== null && skills.level?.rank !== undefined ? `rank ${skills.level.rank}` : undefined}
              />
              <Stat label="XP" value={skills.xpTotal === null ? null : skills.xpTotal.toLocaleString()} />
              <Stat label="Points" value={skills.pointsTotal === null ? null : skills.pointsTotal.toLocaleString()} />
              <Stat
                label="Evidence"
                value={skills.skillEvidence.toLocaleString()}
                hint={`${skills.validatedEvidence} of ${skills.evidenceRecords} records validated`}
              />
            </div>

            {skills.competencies.length > 0 && (
              <div className="mb-3">
                <div className="text-muted text-uppercase mb-2" style={{ letterSpacing: '.05em', fontSize: '.68rem' }}>
                  Competency confidence
                </div>
                <div className="table-responsive">
                  <table className="table table-sm table-hover mb-0">
                    <thead className="table-light">
                      <tr><th>Domain</th><th className="text-end">Confidence</th><th className="text-end">Evidence</th><th>Last evidence</th></tr>
                    </thead>
                    <tbody>
                      {skills.competencies.map((c) => (
                        <tr key={c.domainId}>
                          <td>{c.domainId}</td>
                          <td className="text-end">
                            {c.confidence === null ? '—' : `${Math.round(c.confidence * 100)}%`}
                          </td>
                          <td className="text-end">{c.evidenceCount ?? '—'}</td>
                          <td className="small text-muted">{fmtDate(c.lastEvidenceAt) ?? '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {skills.architectureSkills.length > 0 && (
              <div>
                <div className="text-muted text-uppercase mb-2" style={{ letterSpacing: '.05em', fontSize: '.68rem' }}>
                  Architecture skills
                </div>
                <div className="d-flex flex-wrap gap-2">
                  {skills.architectureSkills.map((s) => (
                    <span key={s.skillId} className="badge bg-light text-dark border">
                      {s.skillId}
                      {s.proficiency !== null && (
                        <strong className="ms-1">{Math.round(s.proficiency * 100)}%</strong>
                      )}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {mentor && (
        <div className="card border-0 shadow-sm mb-4">
          <div className="card-header bg-white fw-semibold">AI mentor and assessments</div>
          <div className="card-body">
            <div className="row g-3 mb-3">
              <Stat
                label="Mentor questions"
                value={mentor.mentorTurns}
                hint={mentor.lastTurnAt ? `last ${fmtDate(mentor.lastTurnAt)}` : 'never asked'}
              />
              <Stat label="Assessments" value={mentor.assessments.length} />
              <Stat
                label="Passed"
                value={mentor.assessments.filter((a) => a.passed).length}
                tone="success"
              />
              <Stat label="Architect reviews" value={mentor.architectEvaluations.length} />
            </div>

            {mentor.memory && (mentor.memory.summary || mentor.memory.goals) && (
              <div className="border rounded p-3 mb-3">
                <div className="text-muted text-uppercase mb-2" style={{ letterSpacing: '.05em', fontSize: '.68rem' }}>
                  What the mentor has learned about them
                </div>
                {mentor.memory.summary && <p className="mb-2 small">{mentor.memory.summary}</p>}
                {mentor.memory.goals && (
                  <p className="mb-0 small"><strong>Goals:</strong> {mentor.memory.goals}</p>
                )}
                {mentor.memory.lastDistilledOn && (
                  <div className="text-muted mt-2" style={{ fontSize: '.72rem' }}>
                    Distilled {fmtDate(mentor.memory.lastDistilledOn)}
                  </div>
                )}
              </div>
            )}

            {mentor.assessments.length > 0 && (
              <div className="table-responsive">
                <table className="table table-sm table-hover mb-0">
                  <thead className="table-light">
                    <tr><th>Kind</th><th>Week</th><th className="text-end">Score</th><th>Result</th><th>Attempt</th><th>When</th></tr>
                  </thead>
                  <tbody>
                    {mentor.assessments.map((a, i) => (
                      <tr key={`${a.kind}-${i}`}>
                        <td>{a.kind ?? '—'}</td>
                        <td className="small text-muted">{a.week ?? '—'}</td>
                        <td className="text-end">{a.score === null ? '—' : Math.round(a.score * 10) / 10}</td>
                        <td>
                          {a.passed === null ? <span className="text-muted small">—</span> : (
                            <span className={`badge bg-${a.passed ? 'success' : 'danger'}-subtle text-${a.passed ? 'success' : 'danger'}-emphasis`}>
                              {a.passed ? 'passed' : 'failed'}
                            </span>
                          )}
                        </td>
                        <td className="small text-muted">{a.attemptNumber ?? '—'}</td>
                        <td className="small text-muted">{fmtDate(a.submittedAt) ?? '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {content && (
        <div className="card border-0 shadow-sm mb-4">
          <div className="card-header bg-white fw-semibold">Content consumption</div>
          <div className="card-body">
            <div className="row g-3 mb-3">
              <Stat label="Podcasts" value={content.podcasts} />
              <Stat label="Articles" value={content.blogPosts} />
              <Stat label="Videos" value={content.videos} />
              <Stat
                label="Feed"
                value={content.feedImpressions.toLocaleString()}
                hint={`${content.feedInteractions} interacted with`}
              />
            </div>

            {content.recent.length > 0 ? (
              <div className="table-responsive">
                <table className="table table-sm table-hover mb-0">
                  <thead className="table-light">
                    <tr><th>Kind</th><th>Title</th><th className="text-end">Views</th><th>Last seen</th></tr>
                  </thead>
                  <tbody>
                    {content.recent.map((r, i) => (
                      <tr key={`${r.kind}-${i}`}>
                        <td className="small">{r.kind}</td>
                        <td>{r.title ?? <span className="text-muted">Untitled</span>}</td>
                        <td className="text-end">{r.seenCount ?? '—'}</td>
                        <td className="small text-muted">{fmtDateTime(r.at) ?? '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <EmptyPanel>No content consumption recorded.</EmptyPanel>
            )}
          </div>
        </div>
      )}

      {community && (
        <div className="card border-0 shadow-sm mb-4">
          <div className="card-header bg-white fw-semibold">Community</div>
          <div className="card-body">
            <div className="row g-3 mb-3">
              <Stat label="Level" value={community.level} />
              <Stat label="Points" value={community.points === null ? null : community.points.toLocaleString()} />
              <Stat label="Posts" value={community.posts} />
              <Stat label="Room messages" value={community.roomMessages} />
            </div>
            <p className="text-muted small mb-0">
              {community.likesGiven} likes given · {community.contributions} contributions ·{' '}
              {community.rooms.length} {community.rooms.length === 1 ? 'room' : 'rooms'} ·{' '}
              {community.referrals} {community.referrals === 1 ? 'referral' : 'referrals'}
            </p>
          </div>
        </div>
      )}
    </>
  );
}
