/**
 * D18 — what the admin is told after saving a class that was marked live.
 *
 * The backend returns `live_warning` beside the saved session: a sentence when Colaberry Live
 * could not be set up, and null when there is nothing to report. Before this, the page said
 * "Session created" either way, so a refused broadcast looked exactly like a successful one.
 *
 * This lives in its own module rather than inside AdminAcceleratorPage because that file is
 * already 1555 lines and the Modular Composition Rule says new logic does not go there. It
 * also makes the decision testable without mounting the page.
 *
 * Deliberately NOT an error. The class really was saved: calling it a failure would make an
 * admin re-submit a form that already worked, which is its own defect.
 */

export interface LiveSaveResponse {
  /** Null, absent, or an empty string all mean "nothing to report". */
  live_warning?: string | null;
}

export type NoticeTone = 'success' | 'warning';

export interface LiveSaveNotice {
  message: string;
  tone: NoticeTone;
  /**
   * The warning carries a reason the reader has to finish and act on, so it gets longer than
   * the default toast life. The plain confirmation keeps the default.
   */
  durationMs?: number;
}

/** Long enough to read a sentence naming a refusal reason and decide what to do about it. */
export const WARNING_TOAST_MS = 12000;

export function liveSaveNotice(
  response: LiveSaveResponse | null | undefined,
  confirmation: string,
): LiveSaveNotice {
  const warning = response?.live_warning;
  // An empty string is an absence, not a warning. Treating it as one would put an empty
  // yellow toast on screen, which tells the reader there is a problem and not what it is.
  if (typeof warning === 'string' && warning.trim().length > 0) {
    return { message: warning, tone: 'warning', durationMs: WARNING_TOAST_MS };
  }
  return { message: confirmation, tone: 'success' };
}
