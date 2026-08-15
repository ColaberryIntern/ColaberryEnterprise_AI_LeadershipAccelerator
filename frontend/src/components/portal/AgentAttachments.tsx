import React, { useCallback, useRef, useState } from 'react';
import {
  ACCEPT_ATTR,
  MAX_ATTACHMENTS_PER_TURN,
  rejectionReason,
  uploadAgentAttachment,
  type AttachmentRef,
  type UploadedAttachment,
} from '../../services/agentAttachmentApi';

/**
 * The attach affordance shared by every surface that talks to an agent —
 * Cory in the classroom, Cory in the project workspace, Reese in DMs.
 *
 * One component, three composers: the alternative was three drop handlers that
 * drift, and a student learning that paste works in one place but not another.
 *
 * Three ways in, because people reach for different ones:
 *   drag and drop  — a file already on screen
 *   Ctrl/Cmd + V   — a screenshot they JUST took, which is the common case and
 *                    the only one that costs zero extra steps
 *   click          — everything else
 */

export interface PendingAttachment {
  /** Stable key while the upload is in flight (the server id once it lands). */
  key: string;
  name: string;
  /** Local object URL for the thumbnail — no round trip to render it. */
  preview: string | null;
  isPdf: boolean;
  uploading: boolean;
  error: string | null;
  uploaded: UploadedAttachment | null;
}

let localSeq = 0;

/**
 * Owns the attachment tray for one composer. The caller renders
 * <AttachmentTray> and <AttachButton>, spreads `dropProps` on whatever region
 * should accept a drop, and sends `refs()` with the turn.
 */
export function useAgentAttachments() {
  const [items, setItems] = useState<PendingAttachment[]>([]);
  const [notice, setNotice] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  // Drag events fire on every child element, so a boolean flag flickers as the
  // pointer crosses them. Counting enter/leave pairs is what keeps the
  // highlight steady.
  const dragDepth = useRef(0);

  const addFiles = useCallback((files: FileList | File[] | null) => {
    const list = Array.from(files || []);
    if (!list.length) return;

    setNotice(null);
    const problems: string[] = [];
    const accepted: File[] = [];
    for (const file of list) {
      const why = rejectionReason(file);
      if (why) problems.push(why);
      else accepted.push(file);
    }

    setItems((prev) => {
      const room = MAX_ATTACHMENTS_PER_TURN - prev.length;
      if (room <= 0) {
        problems.push(`You can attach ${MAX_ATTACHMENTS_PER_TURN} files at a time.`);
        if (problems.length) setNotice(problems.join(' '));
        return prev;
      }
      const taking = accepted.slice(0, room);
      if (accepted.length > room) {
        problems.push(`Only ${room} more file${room === 1 ? '' : 's'} fit on this message.`);
      }
      if (problems.length) setNotice(problems.join(' '));

      const added: PendingAttachment[] = taking.map((file) => {
        const isPdf = file.type === 'application/pdf';
        const key = `local-${++localSeq}`;
        const entry: PendingAttachment = {
          key,
          name: file.name || (isPdf ? 'document.pdf' : 'screenshot.png'),
          preview: isPdf ? null : URL.createObjectURL(file),
          isPdf,
          uploading: true,
          error: null,
          uploaded: null,
        };
        // Upload immediately rather than on send: by the time the student
        // finishes typing, the file is already up, so Send stays instant.
        uploadAgentAttachment(file)
          .then((uploaded) => {
            setItems((cur) => cur.map((it) => (it.key === key ? { ...it, uploading: false, uploaded } : it)));
          })
          .catch((e: any) => {
            const message = e?.response?.data?.error || 'Upload failed — try again.';
            setItems((cur) => cur.map((it) => (it.key === key ? { ...it, uploading: false, error: message } : it)));
          });
        return entry;
      });
      return [...prev, ...added];
    });
  }, []);

  const remove = useCallback((key: string) => {
    setItems((prev) => {
      const gone = prev.find((it) => it.key === key);
      if (gone?.preview) URL.revokeObjectURL(gone.preview);
      return prev.filter((it) => it.key !== key);
    });
  }, []);

  /**
   * Empty the tray.
   *
   * `revoke` is false when clearing after a SEND: the sent message keeps
   * rendering those same object URLs as its thumbnails, and revoking them
   * would blank out the student's own message the instant they sent it. Those
   * URLs then live until the page unloads — bounded by the length of one
   * conversation, and the cost of not breaking the transcript.
   */
  const clear = useCallback((revoke = true) => {
    setItems((prev) => {
      if (revoke) prev.forEach((it) => { if (it.preview) URL.revokeObjectURL(it.preview); });
      return [];
    });
    setNotice(null);
  }, []);

  /**
   * Thumbnails for the message about to be sent. Local object URLs rather than
   * the server URL: the serve route is participant-authenticated and an <img>
   * tag cannot carry a bearer token, so a server URL would render as a broken
   * image. These are the student's own files, already in the browser.
   */
  const sentPreviews = useCallback((): SentAttachment[] => (
    items.filter((it) => it.uploaded).map((it) => ({ name: it.name, preview: it.preview, isPdf: it.isPdf }))
  ), [items]);

  /**
   * The refs to send with the turn — only files that finished uploading. One
   * still in flight is simply not sent, rather than sent as a broken id the
   * agent would report as unreadable.
   */
  const refs = useCallback((): AttachmentRef[] => (
    items.filter((it) => it.uploaded).map((it) => ({ id: it.uploaded!.id, name: it.uploaded!.name }))
  ), [items]);

  /** True while anything is still uploading — composers disable Send on it. */
  const busy = items.some((it) => it.uploading);

  /** Spread onto the region that should accept a drop. */
  const dropProps = {
    onDragEnter: (e: React.DragEvent) => {
      if (!e.dataTransfer?.types?.includes('Files')) return;
      e.preventDefault();
      dragDepth.current += 1;
      setDragging(true);
    },
    onDragOver: (e: React.DragEvent) => {
      if (!e.dataTransfer?.types?.includes('Files')) return;
      e.preventDefault();
    },
    onDragLeave: (e: React.DragEvent) => {
      dragDepth.current = Math.max(0, dragDepth.current - 1);
      if (dragDepth.current === 0) setDragging(false);
      e.preventDefault();
    },
    onDrop: (e: React.DragEvent) => {
      if (!e.dataTransfer?.files?.length) return;
      e.preventDefault();
      dragDepth.current = 0;
      setDragging(false);
      addFiles(e.dataTransfer.files);
    },
  };

  /**
   * Spread onto the text input. A pasted screenshot arrives as a clipboard
   * FILE, while pasted text does not — so this only intercepts the former and
   * ordinary paste keeps working untouched.
   */
  const pasteProps = {
    onPaste: (e: React.ClipboardEvent) => {
      const files = Array.from(e.clipboardData?.files || []);
      if (!files.length) return;
      e.preventDefault();
      addFiles(files);
    },
  };

  return { items, notice, dragging, addFiles, remove, clear, refs, sentPreviews, busy, dropProps, pasteProps };
}

/** What a sent message carries so it can show what went with it. */
export interface SentAttachment {
  name: string;
  preview: string | null;
  isPdf: boolean;
}

/** The thumbnails shown inside a message the student already sent. */
export function SentAttachments({ items }: { items?: SentAttachment[] }) {
  if (!items?.length) return null;
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 6 }}>
      {items.map((it, i) => (
        it.preview ? (
          <img
            key={i}
            src={it.preview}
            alt={it.name}
            title={it.name}
            style={{ width: 72, height: 72, objectFit: 'cover', borderRadius: 6, border: '1px solid rgba(255,255,255,0.35)' }}
          />
        ) : (
          <span
            key={i}
            title={it.name}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11,
              padding: '3px 7px', borderRadius: 6, background: 'rgba(255,255,255,0.18)',
            }}
          >
            <i className="bi bi-file-earmark-pdf" />{it.name}
          </span>
        )
      ))}
    </div>
  );
}

/** The paperclip. Opens the file picker. */
export function AttachButton({ onFiles, disabled, title = 'Attach a screenshot or PDF' }: {
  onFiles: (files: FileList | null) => void;
  disabled?: boolean;
  title?: string;
}) {
  const input = useRef<HTMLInputElement>(null);
  return (
    <>
      <input
        ref={input}
        type="file"
        multiple
        accept={ACCEPT_ATTR}
        style={{ display: 'none' }}
        onChange={(e) => {
          onFiles(e.target.files);
          // Reset so picking the SAME file twice still fires onChange.
          e.target.value = '';
        }}
      />
      <button
        type="button"
        title={title}
        aria-label={title}
        disabled={disabled}
        onClick={() => input.current?.click()}
        style={{
          border: '1px solid #d7dce3',
          background: '#fff',
          borderRadius: 8,
          width: 34,
          height: 34,
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: '#5b6472',
          cursor: disabled ? 'not-allowed' : 'pointer',
          opacity: disabled ? 0.5 : 1,
          flexShrink: 0,
        }}
      >
        <i className="bi bi-paperclip" style={{ fontSize: 15 }} />
      </button>
    </>
  );
}

/** The thumbnail strip above the input: what is about to be sent. */
export function AttachmentTray({ items, notice, onRemove }: {
  items: PendingAttachment[];
  notice: string | null;
  onRemove: (key: string) => void;
}) {
  if (!items.length && !notice) return null;
  return (
    <div style={{ padding: '6px 0' }}>
      {items.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {items.map((it) => (
            <div
              key={it.key}
              title={it.error || it.name}
              style={{
                position: 'relative',
                width: 56,
                height: 56,
                borderRadius: 8,
                overflow: 'hidden',
                border: `1px solid ${it.error ? '#e0736f' : '#d7dce3'}`,
                background: '#f4f6f8',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
              }}
            >
              {it.preview ? (
                <img src={it.preview} alt={it.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              ) : (
                <i className="bi bi-file-earmark-pdf" style={{ fontSize: 20, color: '#8a929e' }} />
              )}

              {(it.uploading || it.error) && (
                <div
                  style={{
                    position: 'absolute',
                    inset: 0,
                    background: 'rgba(255,255,255,0.78)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  {it.uploading
                    ? <span className="spinner-border spinner-border-sm" style={{ width: 14, height: 14, color: '#5b6472' }} role="status" />
                    : <i className="bi bi-exclamation-triangle-fill" style={{ fontSize: 14, color: '#c0392b' }} />}
                </div>
              )}

              <button
                type="button"
                aria-label={`Remove ${it.name}`}
                onClick={() => onRemove(it.key)}
                style={{
                  position: 'absolute',
                  top: 2,
                  right: 2,
                  width: 16,
                  height: 16,
                  borderRadius: '50%',
                  border: 'none',
                  background: 'rgba(17,24,39,0.72)',
                  color: '#fff',
                  fontSize: 9,
                  lineHeight: 1,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: 'pointer',
                  padding: 0,
                }}
              >
                <i className="bi bi-x" />
              </button>
            </div>
          ))}
        </div>
      )}
      {notice && (
        <div role="status" style={{ fontSize: 11, color: '#c0392b', marginTop: 4 }}>{notice}</div>
      )}
    </div>
  );
}

/** The "drop it here" overlay, shown only while a file is over the composer. */
export function DropOverlay({ active, label = 'Drop to attach' }: { active: boolean; label?: string }) {
  if (!active) return null;
  return (
    <div
      aria-hidden
      style={{
        position: 'absolute',
        inset: 0,
        zIndex: 5,
        borderRadius: 10,
        border: '2px dashed #367895',
        background: 'rgba(54,120,149,0.08)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: '#2b5d73',
        fontSize: 12,
        fontWeight: 600,
        pointerEvents: 'none',
      }}
    >
      <i className="bi bi-images me-2" />{label}
    </div>
  );
}
