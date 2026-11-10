import api from '../utils/api';

/** Mirrors backend/src/services/internship/internVideoViewer.ts InternVideoTake. */
export interface InternVideoTake {
  recordingId: string;
  typeId: string | null;
  typeLabel: string;
  storyId: string | null;
  durationSeconds: number | null;
  recordedAt: string;
  attemptNo: number | null;
  mode: string | null;
  isFinalTake: boolean;
}

/** Mirrors backend/src/services/internship/internVideoViewer.ts InternVideoView. */
export interface InternVideoView extends InternVideoTake {
  intern: string;
  enrollmentId: string;
  projectName: string | null;
  hasAudio: boolean | null;
  hasSharedScreen: boolean | null;
  /** Ticketed, same-origin URLs: usable directly as <video src> / poster. */
  fileUrl: string;
  thumbnailUrl: string;
  takes: InternVideoTake[];
}

export async function fetchInternVideo(id: string): Promise<InternVideoView> {
  const res = await api.get<InternVideoView>(`/api/admin/internship/videos/${encodeURIComponent(id)}`);
  return res.data;
}

/** The ticketed URLs are same-origin paths; prefix the API base when the frontend sets one. */
export const apiUrl = (path: string): string => `${process.env.REACT_APP_API_URL || ''}${path}`;
