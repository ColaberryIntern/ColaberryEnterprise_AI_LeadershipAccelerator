import React from 'react';

interface ModuleCompletionPanelProps {
  moduleName: string;
  moduleNumber: number;
  onContinue: () => void;
}

export default function ModuleCompletionPanel({ moduleName, moduleNumber, onContinue }: ModuleCompletionPanelProps) {
  return (
    <div
      className="card border-0 shadow-sm mb-4"
      style={{ background: 'linear-gradient(135deg, var(--color-accent) 0%, #2f855a 100%)' }}
    >
      <div className="card-body py-4 text-white text-center">
        <div className="mb-2">
          <i className="bi bi-trophy" style={{ fontSize: 36, opacity: 0.9 }}></i>
        </div>
        <h5 className="fw-bold mb-1">Module {moduleNumber} Complete</h5>
        <p className="mb-3 small" style={{ opacity: 0.9 }}>
          You've completed <strong>{moduleName}</strong>. Your project foundation is ready.
        </p>
        <ul className="list-unstyled mb-3 small" style={{ opacity: 0.85 }}>
          <li><i className="bi bi-check2 me-1"></i>AI Strategy defined</li>
          <li><i className="bi bi-check2 me-1"></i>Prompts generated</li>
          <li><i className="bi bi-check2 me-1"></i>Artifacts submitted</li>
        </ul>
        <button
          className="btn btn-sm px-4 py-2"
          style={{ background: '#fff', color: 'var(--color-accent)', fontWeight: 700, borderRadius: 8, fontSize: 13 }}
          onClick={onContinue}
        >
          Continue to Next Module <i className="bi bi-arrow-right ms-1"></i>
        </button>
      </div>
    </div>
  );
}
