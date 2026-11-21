import React, { useRef, useState } from 'react';
import { SharedFile, errorText, uploadResearchFile } from '../../../services/enterpriseIntakeApi';
import { FILE_ACCEPT, MAX_FILES, fileProblem, fileSize } from './intakeModel';

/**
 * ResearchUpload - research they already did (v2, 2026-11-21).
 *
 * Ali: "if they have done research themselves, they can upload that as well." One file at a
 * time, up to five; checked here for a friendly message and again on the server by its bytes.
 */
export interface ResearchUploadProps {
  token: string;
  files: SharedFile[];
  onChange: (files: SharedFile[]) => void;
}

export function ResearchUpload({ token, files, onChange }: ResearchUploadProps): React.ReactElement {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState('');

  const pick = async (e: React.ChangeEvent<HTMLInputElement>): Promise<void> => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    const problem = fileProblem(file, files.length);
    if (problem) {
      setNote(problem);
      return;
    }
    setBusy(true);
    setNote('');
    try {
      const r = await uploadResearchFile(token, file);
      onChange(r.files);
    } catch (err) {
      setNote(errorText(err, 'That file did not upload. Please try again.'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="cbv2-dpi__card cbv2-dpi__card--quiet" aria-labelledby="dpi-up-title" data-testid="research-upload">
      <h2 id="dpi-up-title" className="cbv2-dpi__h">Already done some research? Add it</h2>
      <p className="cbv2-dpi__lead">
        Optional. Process maps, internal reviews, a vendor comparison: we read them before the interview and our research
        builds on them. PDF, Word, PowerPoint or text, up to 25 MB each, {MAX_FILES} files.
      </p>
      {files.length ? (
        <ul className="cbv2-dpi__files" data-testid="research-files">
          {files.map((f, n) => (
            <li key={`${f.name}-${n}`}>✓ {f.name} <span>({fileSize(f.size)})</span></li>
          ))}
        </ul>
      ) : null}
      <input ref={input} id="dpi-file" type="file" accept={FILE_ACCEPT} className="cbv2-sr-only" onChange={(e) => void pick(e)} aria-label="Choose a research file" />
      <button type="button" className="cbv2-btn cbv2-btn--line" onClick={() => input.current?.click()} disabled={busy || files.length >= MAX_FILES}>
        {busy ? 'Uploading…' : files.length ? 'Add another file' : 'Add a file'}
      </button>
      {note ? <p className="cbv2-field5__err" role="alert">{note}</p> : null}
    </section>
  );
}

export default ResearchUpload;
