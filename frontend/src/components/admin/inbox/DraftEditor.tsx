import React, { useState } from 'react';

interface DraftEditorProps {
  originalEmail: any;
  draft: any;
  onApprove: (editedBody?: string) => void;
  onReject: () => void;
}

export default function DraftEditor({ originalEmail, draft, onApprove, onReject }: DraftEditorProps) {
  const [editing, setEditing] = useState(false);
  const [editedBody, setEditedBody] = useState<string>(draft?.body || '');

  const handleApprove = () => {
    if (editing && editedBody !== draft?.body) {
      onApprove(editedBody);
    } else {
      onApprove();
    }
  };

  return (
    <div className="row g-3">
      {/* Original email — left column */}
      <div className="col-md-6">
        <div className="card border-0 shadow-sm h-100">
          <div className="card-header bg-white fw-semibold">Original Email</div>
          <div className="card-body">
            <div className="mb-2">
              <span className="small fw-medium">From:</span>{' '}
              <span className="small">{originalEmail?.from_name} &lt;{originalEmail?.from_address}&gt;</span>
            </div>
            <div className="mb-2">
              <span className="small fw-medium">Subject:</span>{' '}
              <span className="small">{originalEmail?.subject}</span>
            </div>
            <div className="mb-2">
              <span className="small fw-medium">Received:</span>{' '}
              <span className="small text-muted">{originalEmail?.received_at ? new Date(originalEmail.received_at).toLocaleString() : ''}</span>
            </div>
            <hr />
            <div className="small" style={{ whiteSpace: 'pre-wrap', maxHeight: 400, overflowY: 'auto' }}>
              {originalEmail?.body_text || 'No body content'}
            </div>
          </div>
        </div>
      </div>

      {/* Draft — right column */}
      <div className="col-md-6">
        <div className="card border-0 shadow-sm h-100">
          <div className="card-header bg-white fw-semibold d-flex justify-content-between align-items-center">
            <span>Draft Response</span>
            {draft?.tone && <span className="badge bg-info">{draft.tone}</span>}
          </div>
          <div className="card-body d-flex flex-column">
            <div className="mb-2">
              <span className="small fw-medium">To:</span>{' '}
              <span className="small">{draft?.to_address || originalEmail?.from_address}</span>
            </div>
            <div className="mb-2">
              <span className="small fw-medium">Subject:</span>{' '}
              <span className="small">{draft?.subject || `Re: ${originalEmail?.subject || ''}`}</span>
            </div>
            <hr />
            <div className="flex-grow-1 mb-3">
              {editing ? (
                <textarea
                  className="form-control form-control-sm font-monospace"
                  rows={12}
                  value={editedBody}
                  onChange={(e) => setEditedBody(e.target.value)}
                  style={{ minHeight: 200 }}
                />
              ) : (
                <div className="small" style={{ whiteSpace: 'pre-wrap', maxHeight: 400, overflowY: 'auto' }}>
                  {draft?.body || 'No draft content'}
                </div>
              )}
            </div>

            <div className="d-flex gap-2">
              <button className="btn btn-sm btn-success" onClick={handleApprove}>
                Approve &amp; Send
              </button>
              <button
                className="btn btn-sm btn-outline-secondary"
                onClick={() => {
                  if (!editing) setEditedBody(draft?.body || '');
                  setEditing(!editing);
                }}
              >
                {editing ? 'Cancel Edit' : 'Edit'}
              </button>
              <button className="btn btn-sm btn-outline-danger" onClick={onReject}>
                Reject
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
