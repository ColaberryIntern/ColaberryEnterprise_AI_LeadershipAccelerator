import React, { useCallback, useEffect, useState } from 'react';
import api from '../../utils/api';

/**
 * Clips from this airing — the first thing that has ever read the clip list (§8 finding 2).
 *
 * WHAT WAS WRONG. Markers have been written on every slide advance since 2026-10-24 and
 * `GET /api/admin/accelerator/sessions/:id/clip-list` has existed just as long, with no caller
 * anywhere in `frontend/src`. That is the subsystem's recurring habit — the heartbeat route had
 * no caller, `ended_at` was never written, the chat thread and the audience count were both
 * complete and unread — and in both of the cases already closed, giving a feature its first
 * reader is what exposed what was wrong with it. An unread feature is not half-working, it is
 * unmeasured.
 *
 * IT RENDERS NOTHING FOR A CLASS THAT NEVER AIRED, which is most of them. Markers are a
 * by-product of broadcasting, not of teaching, so an empty panel on every ordinary class would
 * be noise on the one screen an instructor opens under time pressure. Same answer
 * `BroadcastWatchButton` gives: show nothing when there is nothing to offer.
 *
 * THE DOWNLOAD CANNOT BE A PLAIN LINK, and that is worth knowing before anyone "simplifies" it.
 * The admin JWT lives in `localStorage` and is attached by the `api` interceptor as a Bearer
 * header; an `<a href>` to the CSV route sends no Authorization header at all and gets a 401. So
 * the file is fetched through `api` and turned into a download client-side, the same shape as
 * the cohort export on AdminCohortDetailPage.
 */

interface Clip {
  clip: number;
  slide_index: number;
  in_seconds: number;
  out_seconds: number | null;
  duration_seconds: number | null;
  in_timecode: string;
  out_timecode: string;
  duration_timecode: string;
  candidate: boolean;
  label: string;
  segment_label: string;
  slide_title: string;
}

interface ClipListResponse {
  aired: boolean;
  occurrence_id: string | null;
  editorial_state?: string;
  content_started_at?: string | null;
  ended_at?: string | null;
  clips: Clip[];
}

interface Props {
  sessionId: string;
  /** Injected in tests. Defaults to the real admin request. */
  load?: (sessionId: string) => Promise<ClipListResponse>;
  download?: (sessionId: string) => Promise<{ blob: Blob; filename: string }>;
}

async function loadClipList(sessionId: string): Promise<ClipListResponse> {
  const res = await api.get<ClipListResponse>(
    `/api/admin/accelerator/sessions/${sessionId}/clip-list`,
  );
  return res.data;
}

/**
 * The server names the file; this only falls back when it did not.
 *
 * Reading `Content-Disposition` keeps one source of truth for the name — the route already
 * builds it from characters that cannot break a header. The cohort export composes its own name
 * client-side instead, which is the same thing said twice, and the one that drifts.
 */
function filenameFrom(header: unknown, sessionId: string): string {
  const match = typeof header === 'string' ? /filename="([^"]+)"/.exec(header) : null;
  return match ? match[1] : `clips-${sessionId.slice(0, 8)}.csv`;
}

async function downloadClipCsv(sessionId: string): Promise<{ blob: Blob; filename: string }> {
  const res = await api.get(
    `/api/admin/accelerator/sessions/${sessionId}/clip-list.csv`,
    { responseType: 'blob' },
  );
  return {
    blob: new Blob([res.data], { type: 'text/csv' }),
    filename: filenameFrom(res.headers?.['content-disposition'], sessionId),
  };
}

/** Hand the browser a file. Separated so the component's own logic stays testable. */
function saveBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

/**
 * WHY AN EMPTY LIST NEEDS A SENTENCE AND NOT A BLANK SPACE.
 *
 * The route sends `content_started_at` for exactly this: without that anchor no marker could
 * have been recorded at all, so "no clips" has two completely different causes. One is a
 * producer who never pressed Mark content started — fixable next time. The other is a class
 * that aired properly and simply had nothing worth marking. Showing the same emptiness for both
 * is how the first one goes unnoticed for a term.
 */
function emptyReason(data: ClipListResponse): string {
  if (!data.content_started_at) {
    return 'No clips: nobody marked content as started, so there was no anchor to measure a '
      + 'timecode from. Press Mark content started before going live and the next airing will '
      + 'record them.';
  }
  return 'This class aired and no moments were marked.';
}

const SessionClipList: React.FC<Props> = ({ sessionId, load, download }) => {
  const [data, setData] = useState<ClipListResponse | null>(null);
  const [failed, setFailed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [downloadError, setDownloadError] = useState('');

  const loadList = load ?? loadClipList;
  const fetchCsv = download ?? downloadClipCsv;

  useEffect(() => {
    let alive = true;
    loadList(sessionId)
      .then((d) => { if (alive) { setData(d); setFailed(false); } })
      .catch(() => { if (alive) setFailed(true); });
    return () => { alive = false; };
  }, [sessionId, loadList]);

  const onDownload = useCallback(async () => {
    setBusy(true);
    setDownloadError('');
    try {
      const { blob, filename } = await fetchCsv(sessionId);
      saveBlob(blob, filename);
    } catch {
      setDownloadError('Could not build the clip file. Please try again.');
    } finally {
      setBusy(false);
    }
  }, [fetchCsv, sessionId]);

  // A read that failed says so quietly rather than breaking the kit around it — but it does say
  // so, because a silently absent panel is indistinguishable from a class that never aired.
  if (failed) {
    return (
      <div className="class-kit-noprint mt-4 pt-3 border-top">
        <div className="text-muted" style={{ fontSize: 13 }}>Could not load the clip list.</div>
      </div>
    );
  }

  if (!data || !data.aired) return null;

  const candidates = data.clips.filter((c) => c.candidate);
  const plain = data.clips.length - candidates.length;

  return (
    <div className="class-kit-noprint mt-4 pt-3 border-top text-start">
      <div className="d-flex justify-content-between align-items-center mb-2">
        <span className="fw-semibold" style={{ fontSize: 15 }}>Clips from this airing</span>
        <button
          className="btn btn-sm btn-outline-primary"
          onClick={() => { void onDownload(); }}
          disabled={busy}
          data-testid="clip-csv-download"
        >
          <i className="ri-download-line me-1" aria-hidden="true" />
          {busy ? 'Building…' : 'Download CSV'}
        </button>
      </div>

      {data.clips.length === 0 ? (
        <div className="text-muted" style={{ fontSize: 13 }} data-testid="clip-empty">
          {emptyReason(data)}
        </div>
      ) : (
        <>
          {candidates.length > 0 && (
            <table className="table table-sm mb-2" style={{ fontSize: 13 }}>
              <thead>
                <tr className="text-muted">
                  <th scope="col" style={{ width: 64 }}>In</th>
                  <th scope="col" style={{ width: 72 }}>Length</th>
                  <th scope="col">What it is worth</th>
                </tr>
              </thead>
              <tbody data-testid="clip-candidates">
                {candidates.map((c) => (
                  <tr key={c.clip}>
                    <td style={{ fontVariantNumeric: 'tabular-nums' }}>{c.in_timecode}</td>
                    <td style={{ fontVariantNumeric: 'tabular-nums' }}>
                      {/* Blank, never a zero: the last clip of an airing with no recorded end
                          has no length, and 0 would read as a clip with nothing in it. */}
                      {c.duration_timecode || <span className="text-muted">—</span>}
                    </td>
                    <td>
                      {c.label}
                      {c.segment_label && (
                        <span className="text-muted ms-2" style={{ fontSize: 12 }}>{c.segment_label}</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          {/*
            * EVERY ADVANCE WRITES A MARKER, so most rows are not clip candidates — they are
            * just where slide 14 began. Listing all of them here would leave an editor
            * scrubbing anyway, which is the cost this feature exists to remove. They are still
            * in the CSV, because a timecode nobody authored a note about is still a timecode.
            */}
          <div className="text-muted" style={{ fontSize: 12.5 }} data-testid="clip-summary">
            {candidates.length === 0
              ? `${data.clips.length} ${data.clips.length === 1 ? 'marker' : 'markers'} recorded, `
                + 'none with a clip note authored on the timeline. All of them are in the CSV.'
              : `${candidates.length} ${candidates.length === 1 ? 'clip note' : 'clip notes'}`
                + `${plain > 0 ? `, plus ${plain} more ${plain === 1 ? 'marker' : 'markers'} with no note` : ''}`
                + '. The CSV has every marker, with in and out points.'}
          </div>
        </>
      )}

      {downloadError && (
        <div className="text-danger mt-2" style={{ fontSize: 13 }}>{downloadError}</div>
      )}
    </div>
  );
};

export default SessionClipList;
