/**
 * connectedDemoShareApi - the student's own publish control for their Connected Demo.
 *
 * Mirrors `backend/src/services/connectedDemoShareService.ts`. The frontend cannot import backend
 * types across the workspace boundary, so the shape is restated here.
 *
 * ## Why the data model is UPLOADED
 *
 * Generating a demo needs `command-center/data-model.json`, which STORY-000 writes into the
 * student's own repository. The platform does not read file content from there on this path, by
 * choice: a GitHub fetch would put an external API, a token and a rate limit between pressing a
 * button and the link working, and it could race a push and build from a different revision than
 * the student is looking at. The file is on their machine, so they send it, and the request is
 * attributable to them.
 *
 * The posted document is UNTRUSTED. The backend validates the generated spec against its contract
 * and against this project's own restricted values before anything is persisted, which is why a
 * refusal is a normal outcome here rather than an error to hide.
 */
import api from '../../../utils/api';

export interface ConnectedDemoShareState {
  project_id: string;
  enabled: boolean;
  /** The public link. Present only while the demo is published. */
  url: string | null;
  has_spec: boolean;
  event_count: number;
}

/** The refusals this control can legitimately produce, each one a different thing to tell a person. */
export type ConnectedDemoShareFailure =
  | 'needs_data_model'
  | 'refused_content'
  | 'not_found'
  | 'forbidden'
  | 'unknown';

export class ConnectedDemoShareRequestError extends Error {
  constructor(readonly failure: ConnectedDemoShareFailure, message: string) {
    super(message);
    this.name = 'ConnectedDemoShareRequestError';
  }
}

interface AxiosLikeError {
  response?: { status?: number; data?: { error?: string; error_class?: string } };
}

/**
 * Map a status onto something worth saying.
 *
 * 422 is the interesting one: the producer refused the spec, which means the data model was
 * unusable or the generated demo carried restricted project data. That is the student's input and
 * they can fix it, so it must not read as "something went wrong on our side".
 */
function toFailure(err: unknown): ConnectedDemoShareRequestError {
  const status = (err as AxiosLikeError)?.response?.status;
  const body = (err as AxiosLikeError)?.response?.data;
  if (status === 400) {
    return new ConnectedDemoShareRequestError(
      'needs_data_model',
      'Pick your command-center/data-model.json first. The demo takes its data shape from it.',
    );
  }
  if (status === 422) {
    return new ConnectedDemoShareRequestError(
      'refused_content',
      body?.error
        || 'That data model could not be turned into a demo. Check it against STORY-000 and try again.',
    );
  }
  if (status === 404) {
    return new ConnectedDemoShareRequestError('not_found', 'This project could not be found.');
  }
  if (status === 403) {
    return new ConnectedDemoShareRequestError('forbidden', 'This project is not yours to publish.');
  }
  return new ConnectedDemoShareRequestError('unknown', 'Something went wrong. Please try again.');
}

export async function getConnectedDemoShare(projectId: string): Promise<ConnectedDemoShareState> {
  try {
    const res = await api.get('/api/portal/project/demo/share', { params: { project_id: projectId } });
    return res.data as ConnectedDemoShareState;
  } catch (err) {
    throw toFailure(err);
  }
}

export async function setConnectedDemoShare(
  projectId: string,
  enabled: boolean,
  dataModel?: unknown,
): Promise<ConnectedDemoShareState> {
  try {
    const res = await api.post('/api/portal/project/demo/share', {
      project_id: projectId,
      enabled,
      /*
       * `undefined` here is not the same as `null`, and both are deliberate.
       *
       * The body is JSON-serialized, and `JSON.stringify` drops an undefined value, so an absent
       * data model puts no `data_model` key on the wire at all - which is what the backend's
       * "required only when there is no demo yet" rule expects. A caller who passes `null` means
       * something different and it IS sent, so the server can refuse it rather than mistake it
       * for absence.
       *
       * An earlier version wrote this as a conditional spread with a comment claiming the two
       * forms differed. A mutation run proved they do not: both produce identical requests. The
       * conditional is gone rather than pinned by a test asserting a difference nobody can
       * observe.
       */
      data_model: dataModel,
    });
    return res.data as ConnectedDemoShareState;
  } catch (err) {
    throw toFailure(err);
  }
}
