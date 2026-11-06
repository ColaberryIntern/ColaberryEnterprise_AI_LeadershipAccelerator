import React, { useRef, useState } from 'react';
import { fileToBase64, removeResume, uploadResume } from '../../../services/portalSettingsApi';
import { refreshMyProgress } from './myProgressApi';
import { RESUME_EXT, resumeFileProblem } from './myProgressView';

/**
 * C120: the resume upload from the My Progress room, through the SAME Settings API (POST/DELETE /api/portal/settings/resume:
 * the server parses the file and awards the one-time +25 setup points, idempotent per learner). After the server answers, the
 * celebration is re-read, so the screen shows the background the parser found.
 *
 * Failure: the file is refused before upload with the Settings page's own words (type, 3 MB); a server refusal shows its message
 * or a generic one; nothing is retried automatically (the learner picks the file again).
 */
export interface ResumeUploadApi {
  busy: boolean;
  note: string | null;
  pick: () => void;
  remove: () => void;
  input: React.ReactElement;
}

export function useResumeUpload(testId: string): ResumeUploadApi {
  const ref = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const onFile = async (file: File | null) => {
    if (!file || busy) return;
    const problem = resumeFileProblem(file);
    if (problem) { setNote(problem); return; }
    setBusy(true); setNote(null);
    try {
      const data_base64 = await fileToBase64(file);
      const ext = file.name.slice(file.name.lastIndexOf('.')).toLowerCase();
      await uploadResume({ file_name: file.name, mime: file.type || (ext === '.pdf' ? 'application/pdf' : 'text/plain'), data_base64 });
      setNote('Resume uploaded. Here is where you came from.');
      await refreshMyProgress();
    } catch (err) {
      const msg = (err as { response?: { data?: { error?: unknown } } })?.response?.data?.error;
      setNote(typeof msg === 'string' && msg ? msg : 'Could not upload that file');
    } finally {
      setBusy(false);
      if (ref.current) ref.current.value = '';
    }
  };
  const remove = async () => {
    if (busy) return;
    setBusy(true); setNote(null);
    try { await removeResume(); setNote('Resume removed'); await refreshMyProgress(); } catch { setNote('Could not remove your resume'); } finally { setBusy(false); }
  };
  const input = (
    <input ref={ref} type="file" accept={RESUME_EXT.join(',')} hidden data-testid={testId} aria-hidden="true" tabIndex={-1}
      onClick={(e) => e.stopPropagation()} onChange={(e) => { void onFile(e.target.files?.[0] ?? null); }} />
  );
  return { busy, note, pick: () => ref.current?.click(), remove: () => { void remove(); }, input };
}
