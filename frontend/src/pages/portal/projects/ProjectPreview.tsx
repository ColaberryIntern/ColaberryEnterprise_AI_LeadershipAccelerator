import React from 'react';
import { StudentProject } from './projectsStore';

// The "milder setup of what their AI tool will look like" — a lightweight sketch
// of the agent/tool being assembled (data sources -> core tool -> guardrails),
// shown right after the questionnaire while the build is generated in the
// background. The student can open the workspace or keep exploring the platform.

const ProjectPreview: React.FC<{
  project: StudentProject;
  onOpen: () => void;
  onExplore: () => void;
}> = ({ project, onOpen, onExplore }) => {
  const pv = project.preview;
  const creating = project.status === 'creating';
  return (
    <div className="card pjp-card">
      <div className="pjp-cover" style={{ background: project.cover }}>
        <span className="pjp-badge">
          <svg viewBox="0 0 24 24" width="13" height="13" fill="none"><path d="M12 2l2.6 7.4H22l-6.2 4.6 2.4 7.4L12 16.9 5.8 21.4l2.4-7.4L2 9.4h7.4z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" /></svg>
          Preview · what you're building
        </span>
      </div>
      <div className="pjp-body">
        <div className="pjp-avwrap">
          <span className="pjp-av" style={{ background: project.accent }}><svg viewBox="0 0 24 24" fill="none"><path d={project.icon} stroke="#fff" strokeWidth="2" strokeLinejoin="round" /></svg></span>
          <div className="pjp-title"><b>{pv.toolName}</b><span>{pv.summary}</span></div>
        </div>

        {/* tool sketch: sources -> core -> outputs, with guardrails */}
        <div className="pjp-diagram">
          <div className="pjp-col">
            <h5>Reads from</h5>
            {pv.dataSources.map((s, i) => (
              <div key={i} className="pjp-node"><span className="d" style={{ background: '#367895' }} />{s}</div>
            ))}
          </div>
          <div className="pjp-arrow">
            <svg width="26" height="26" viewBox="0 0 24 24" fill="none"><path d="M4 12h16M13 6l6 6-6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
          </div>
          <div className="pjp-core">
            <div className="core-ic" style={{ background: project.accent }}><svg viewBox="0 0 24 24" fill="none"><path d={project.icon} stroke="#fff" strokeWidth="2" strokeLinejoin="round" /></svg></div>
            <b>{pv.toolName}</b>
            <span>{pv.tools.join(' · ')}</span>
          </div>
        </div>

        <div className="pjp-guards">
          {pv.guardrails.map((g, i) => (
            <span key={i} className="pjp-guard"><svg viewBox="0 0 24 24" fill="none"><path d="M12 3l7 3v5c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V6l7-3z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" /></svg>{g}</span>
          ))}
        </div>

        {creating ? (
          <div className="pjp-progress"><span className="pjp-spin" /><span><b>Building {project.name} in the background…</b> generating your requirements, lists, and tasks. You can keep exploring the platform.</span></div>
        ) : (
          <div className="pjp-ready"><svg viewBox="0 0 24 24" fill="none"><path d="M5 12l4 4L19 6" stroke="currentColor" strokeWidth="3" strokeLinecap="round" /></svg> Your build is ready — lists and tasks are set up.</div>
        )}

        <div className="pjw-actions">
          <button className="btn primary" onClick={onOpen}>{creating ? 'Open build workspace' : 'Open your build'}</button>
          <button className="btn ghost" onClick={onExplore}>Keep exploring</button>
        </div>
      </div>
    </div>
  );
};

export default ProjectPreview;
