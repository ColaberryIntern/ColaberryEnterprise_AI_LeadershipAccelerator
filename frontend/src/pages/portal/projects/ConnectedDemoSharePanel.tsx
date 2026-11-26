import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  getConnectedDemoShare,
  setConnectedDemoShare,
  ConnectedDemoShareRequestError,
  type ConnectedDemoShareState,
} from './connectedDemoShareApi';

/**
 * ConnectedDemoSharePanel - the student publishes their own demo, or takes it back.
 *
 * ## Why this exists at all
 *
 * The publish control shipped as an authenticated API pair with nothing calling it. The portfolio
 * share pair beside it is in the same state and has been for longer: the backend works, the public
 * page works, and no screen in the portal can turn it on. An outward-facing link that only an
 * engineer with a bearer token can create is not a feature anybody has.
 *
 * ## Two kinds of project, and only one of them has a file to pick
 *
 * A PLATFORM-built project's demo was built and stored by the platform, so publishing adopts the
 * stored spec and asks for nothing. Those projects also have no STORY-900 row at all, so the gate
 * here is "is there anything to offer" rather than "is the story on the board". The portal can
 * already show that demo, but only through a 12-hour signed link it mints on load; this panel is
 * the only way to get an address that keeps working.
 *
 * The rest of this applies to a STUDENT-built project.
 *
 * ## Why the student picks the file
 *
 * Generating the demo needs `command-center/data-model.json`, which STORY-000 wrote into their
 * repository. The platform deliberately does not fetch it: that would put GitHub's API, a token
 * and a rate limit between pressing this button and the link working, and a fetch can race a push
 * and build from a revision the student is not looking at. The file is on their machine, so they
 * send it. The backend treats it as untrusted, validates the generated spec against its contract
 * and checks it against this project's own restricted values before persisting anything, which is
 * why "that data model could not be turned into a demo" is a normal answer here.
 *
 * ## Publishing is a separate decision from generating
 *
 * A generated demo is private. `demo_share_enabled` defaults false and the public route refuses a
 * row without it, so the link does not exist until somebody chooses. Unpublishing LEAVES the demo
 * in place, so turning it back on is the same demo rather than a new one.
 *
 * ## The one thing this panel must never do
 *
 * Show a link that does not open. `url` arrives null for anything but a published demo, and every
 * branch below that lacks a url says what is true instead.
 */

interface Props {
  projectId: string;
  /**
   * Does the board carry STORY-900? One of four reasons this panel renders, not the only one any
   * more: a platform-built project has no such row and still has a demo to publish. See
   * `offerable` in the body.
   */
  hasConnectedDemoStory: boolean;
}

/** Absolute, so copying it out of the portal gives somebody else something that works. */
const absolute = (url: string): string =>
  (typeof window === 'undefined' ? url : `${window.location.origin}${url}`);

const MAX_DATA_MODEL_BYTES = 1_000_000;

export default function ConnectedDemoSharePanel({ projectId, hasConnectedDemoStory }: Props): React.ReactElement | null {
  const [state, setState] = useState<ConnectedDemoShareState | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [dataModel, setDataModel] = useState<unknown>(undefined);
  const [fileName, setFileName] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setState(await getConnectedDemoShare(projectId));
      setMessage(null);
    } catch (err) {
      // A 404 here is ordinary: a project with no demo row yet. Only say something when there is
      // something to say.
      setState(null);
      const failure = err instanceof ConnectedDemoShareRequestError ? err.failure : 'unknown';
      setMessage(failure === 'not_found' ? null : 'Could not read your demo settings just now.');
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  /*
   * Loaded for every project this is mounted on, which is a change from "only when the board
   * carries STORY-900".
   *
   * A platform-built project has no STORY-900 row (L13.4 retires it, because the platform builds
   * those pages itself) and yet it does have a demo worth publishing. The page cannot tell: the
   * projects payload carries the board, not the artifact store. The server can, so it is asked,
   * rather than teaching the projects DTO a second version of "does this project have a demo"
   * that could disagree with the first.
   *
   * It costs one authenticated read on a project page, behind the caller's existing gate of a
   * real pipeline build that is not the sample. Nothing renders until the answer arrives, so a
   * project with no demo and no story never shows a card at all - see `offerable` below.
   */
  useEffect(() => { load(); }, [load]);

  const pickFile = (e: React.ChangeEvent<HTMLInputElement>): void => {
    const file = e.target.files?.[0];
    setCopied(false);
    if (!file) { setDataModel(undefined); setFileName(null); return; }
    if (file.size > MAX_DATA_MODEL_BYTES) {
      // Refused here rather than at the server, so the person is not waiting on an upload that
      // was never going to be accepted.
      setDataModel(undefined);
      setFileName(null);
      setMessage('That file is too large to be a data model. Pick command-center/data-model.json.');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      try {
        setDataModel(JSON.parse(String(reader.result)));
        setFileName(file.name);
        setMessage(null);
      } catch {
        setDataModel(undefined);
        setFileName(null);
        setMessage('That file is not valid JSON. Pick command-center/data-model.json.');
      }
    };
    reader.onerror = () => {
      setDataModel(undefined);
      setFileName(null);
      setMessage('That file could not be read. Try picking it again.');
    };
    reader.readAsText(file);
  };

  const run = async (enabled: boolean): Promise<void> => {
    setBusy(true);
    setMessage(null);
    setCopied(false);
    try {
      // The data model travels only when there is no demo yet AND none can be adopted. Sending it
      // on every publish would regenerate a demo the student has already checked.
      const needsModel = enabled
        && !state?.has_spec
        && state?.can_publish_without_data_model !== true;
      const next = await setConnectedDemoShare(projectId, enabled, needsModel ? dataModel : undefined);
      setState(next);
      if (needsModel) {
        setDataModel(undefined);
        setFileName(null);
        if (fileInput.current) fileInput.current.value = '';
      }
    } catch (err) {
      setMessage(err instanceof ConnectedDemoShareRequestError ? err.message : 'Something went wrong.');
    } finally {
      setBusy(false);
    }
  };

  const copy = (url: string): void => {
    // Best effort. A clipboard that refuses - an insecure context, a denied permission - must not
    // throw into the render tree, and the link beside the button still works. `setCopied(false)`
    // rather than a cast into the boolean state: an earlier version wrote
    // `setCopied(null as unknown as boolean)`, which is an escape hatch with nothing to say for
    // itself and the same observable behavior.
    navigator.clipboard?.writeText(absolute(url))
      .then(() => setCopied(true))
      .catch(() => setCopied(false));
  };

  const published = !!state?.enabled && !!state?.url;
  const generated = !!state?.has_spec && !published;
  /** The platform built this project's demo, so publishing adopts it and needs no file. */
  const adoptable = !published && !generated && state?.can_publish_without_data_model === true;

  /*
   * Render nothing at all unless there is something to offer.
   *
   * Four ways to qualify: the board asks for a demo (STORY-900), one is already published, one is
   * built and private, or the platform built one that can be adopted. A project with none of
   * those gets no card, which is also what the pre-load state looks like, so there is no flash of
   * an empty panel on the projects that will never show it.
   */
  const offerable = hasConnectedDemoStory || published || generated || adoptable;
  if (!offerable) return null;

  return (
    <section className="card border-0 shadow-sm mb-3" data-testid="connected-demo-share">
      <div className="card-body">
        <h3 className="h6 mb-1">Your demo link</h3>
        <p className="text-muted small mb-3">
          One link anybody can open, with no login. It shows your simulated demo, never live data.
        </p>

        {loading && <p className="text-muted small mb-0">Checking...</p>}

        {!loading && published && (
          <>
            <div className="d-flex flex-wrap align-items-center gap-2 mb-2">
              <a href={state!.url as string} target="_blank" rel="noopener noreferrer">Open your demo</a>
              <button type="button" className="btn btn-sm btn-outline-secondary" onClick={() => copy(state!.url as string)}>
                {copied ? 'Copied' : 'Copy link'}
              </button>
              <button type="button" className="btn btn-sm btn-outline-danger" disabled={busy} onClick={() => run(false)}>
                {busy ? 'Working...' : 'Unpublish'}
              </button>
            </div>
            <p className="text-muted small mb-0">
              {state!.event_count} moments in the timeline. Unpublishing keeps the demo and only
              takes the link away, so you can publish the same one again.
            </p>
          </>
        )}

        {!loading && generated && (
          <>
            <p className="small mb-2">
              Your demo is built and private. Publishing gives it a link anybody can open.
            </p>
            <button type="button" className="btn btn-sm btn-primary" disabled={busy} onClick={() => run(true)}>
              {busy ? 'Publishing...' : 'Publish my demo'}
            </button>
          </>
        )}

        {!loading && adoptable && (
          <>
            <p className="small mb-2">
              Your demo is built and private. Publishing gives it a link anybody can open, with no
              login and no expiry.
            </p>
            <button type="button" className="btn btn-sm btn-primary" disabled={busy} onClick={() => run(true)}>
              {busy ? 'Publishing...' : 'Publish my demo'}
            </button>
          </>
        )}

        {!loading && !published && !generated && !adoptable && (
          <>
            <p className="small mb-2">
              No demo yet. Pick the <code>command-center/data-model.json</code> that STORY-000 wrote
              in your repository, and this builds your demo from your plan and publishes it.
            </p>
            <input
              ref={fileInput}
              type="file"
              accept=".json,application/json"
              className="form-control form-control-sm mb-2"
              aria-label="command-center/data-model.json"
              onChange={pickFile}
            />
            {fileName && <p className="text-muted small mb-2">Using {fileName}</p>}
            <button
              type="button"
              className="btn btn-sm btn-primary"
              disabled={busy || dataModel === undefined}
              onClick={() => run(true)}
            >
              {busy ? 'Building...' : 'Build and publish my demo'}
            </button>
          </>
        )}

        {message && <p className="text-danger small mb-0 mt-2" role="alert">{message}</p>}
      </div>
    </section>
  );
}
