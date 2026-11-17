import React, { useState } from 'react';
import type { GovDemoVideo } from '../../../../services/govProjectPortalApi';
import { apiUrl } from '../../../../services/internVideoApi';

/**
 * DemoVideoGallery - the intern's recorded demo videos (Presentation Studio ingested takes), shown in the gov
 * cockpit's Build artifacts section. Each card is a poster thumbnail; clicking one plays the take in a modal.
 *
 * The fileUrl/thumbnailUrl come ticketed from the projection (a signed, recording-bound staff ticket), so they are
 * usable directly as <video src> / poster once prefixed with the API base. Nothing here mints or carries a secret.
 */

function duration(seconds: number | null): string {
  if (seconds === null || seconds === undefined || seconds <= 0) return '';
  const m = Math.floor(seconds / 60);
  const s = Math.round(seconds % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}

function recordedOn(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString();
}

export default function DemoVideoGallery({ videos }: { videos: GovDemoVideo[] }): React.ReactElement | null {
  const [open, setOpen] = useState<GovDemoVideo | null>(null);
  if (!videos || videos.length === 0) return null;

  return (
    <div className="gps-panel" data-testid="ev-demo-videos" style={{ marginBottom: 12 }}>
      <div className="gps-row" style={{ marginBottom: 8 }}>
        <b>Demo videos</b>
        <span className="gps-small gps-muted">{videos.length} recorded in the app</span>
      </div>
      <div className="gps-gallery">
        {videos.map((v) => (
          <button
            type="button"
            key={v.recordingId}
            data-testid="ev-demo-video"
            className="gps-shot"
            onClick={() => setOpen(v)}
            title={`Play ${v.typeLabel}`}
            style={{ textAlign: 'left', border: 'none', background: 'transparent', padding: 0, cursor: 'pointer' }}
          >
            <div style={{ position: 'relative' }}>
              <img className="gps-img" src={apiUrl(v.thumbnailUrl)} alt="" loading="lazy" />
              <span
                aria-hidden="true"
                style={{
                  position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}
              >
                <i className="ri-play-circle-fill" style={{ fontSize: 42, color: '#fff', textShadow: '0 1px 6px rgba(0,0,0,.6)' }} />
              </span>
              {duration(v.durationSeconds) && (
                <span
                  style={{
                    position: 'absolute', right: 6, bottom: 6, fontSize: 11, color: '#fff',
                    background: 'rgba(0,0,0,.7)', borderRadius: 4, padding: '1px 5px',
                  }}
                >
                  {duration(v.durationSeconds)}
                </span>
              )}
            </div>
            <div className="gps-cap">
              <b>{v.typeLabel}</b>
              <span className="gps-small gps-muted">
                {v.storyId ? `${v.storyId} · ` : ''}{recordedOn(v.recordedAt)}
              </span>
            </div>
          </button>
        ))}
      </div>

      {open && (
        <div
          role="dialog"
          aria-label={`${open.typeLabel} demo video`}
          data-testid="ev-demo-video-modal"
          onClick={() => setOpen(null)}
          style={{
            position: 'fixed', inset: 0, background: 'rgba(0,0,0,.72)', zIndex: 1080,
            display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16,
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{ background: 'var(--surface-card, #fff)', borderRadius: 10, overflow: 'hidden', maxWidth: 900, width: '100%' }}
          >
            <div className="gps-row" style={{ padding: '10px 14px' }}>
              <b>{open.typeLabel}</b>
              <button type="button" className="gps-btn sm" data-testid="ev-demo-video-close" onClick={() => setOpen(null)}>Close</button>
            </div>
            <video
              data-testid="ev-demo-video-player"
              src={apiUrl(open.fileUrl)}
              poster={apiUrl(open.thumbnailUrl)}
              controls
              autoPlay
              style={{ width: '100%', maxHeight: '70vh', background: '#000', display: 'block' }}
            />
          </div>
        </div>
      )}
    </div>
  );
}
