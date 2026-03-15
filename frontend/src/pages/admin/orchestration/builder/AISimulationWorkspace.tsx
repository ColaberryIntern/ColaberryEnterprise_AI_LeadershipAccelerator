import React, { useState } from 'react';
import TestSimulationPanel from './TestSimulationPanel';
import PromptDebuggerPanel from './PromptDebuggerPanel';
import CoryMentorIcon from './CoryMentorIcon';
import { MiniSection } from './types';

interface Props {
  miniSections: MiniSection[];
  lessonTitle: string;
  lessonId: string;
  token: string;
  apiUrl: string;
  onClose: () => void;
}

export default function AISimulationWorkspace({ miniSections, lessonTitle, lessonId, token, apiUrl, onClose }: Props) {
  const [simulationPrompt, setSimulationPrompt] = useState<{ system: string; user: string } | null>(null);

  return (
    <div className="modal show d-block" style={{ backgroundColor: 'rgba(0,0,0,0.5)' }} role="dialog" aria-modal="true">
      <div className="modal-dialog" style={{ maxWidth: 1400 }}>
        <div className="modal-content">
          <div className="modal-header py-2">
            <h6 className="modal-title d-flex align-items-center gap-2" style={{ fontSize: 13 }}>
              <CoryMentorIcon size={24} glowing={false} />
              <span>AI Simulation Workspace</span>
              <span className="badge bg-light text-muted border" style={{ fontSize: 9 }}>{lessonTitle}</span>
            </h6>
            <button className="btn-close" onClick={onClose} style={{ fontSize: 10 }} />
          </div>
          <div className="modal-body p-0" style={{ maxHeight: 'calc(100vh - 140px)', overflowY: 'auto' }}>
            <div className="row g-0">
              {/* Left: Simulation Panel */}
              <div className="col-lg-7 border-end" style={{ maxHeight: 'calc(100vh - 140px)', overflowY: 'auto' }}>
                <div className="p-3">
                  <TestSimulationPanel
                    miniSections={miniSections}
                    lessonTitle={lessonTitle}
                    lessonId={lessonId}
                    token={token}
                    apiUrl={apiUrl}
                    onPromptCaptured={setSimulationPrompt}
                  />
                </div>
              </div>
              {/* Right: Prompt Debugger */}
              <div className="col-lg-5" style={{ maxHeight: 'calc(100vh - 140px)', overflowY: 'auto', background: 'var(--color-bg-alt, #f7fafc)' }}>
                <div className="p-3">
                  <PromptDebuggerPanel
                    lessonId={lessonId}
                    token={token}
                    apiUrl={apiUrl}
                    externalPrompt={simulationPrompt}
                  />
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
