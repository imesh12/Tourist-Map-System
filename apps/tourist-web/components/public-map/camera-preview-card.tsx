'use client';

import { useEffect, useState } from 'react';
import type { PublishedLiveCamera } from 'shared-types';
import type { LivePlaybackSession } from '@/lib/public-map/live-playback';

interface CameraPreviewCardProps {
  readonly camera: PublishedLiveCamera;
  readonly onOpen: () => void;
  readonly onClose: () => void;
  readonly session: LivePlaybackSession;
}

/** The map-anchored preview owns the selected camera's one playback context. */
export function CameraPreviewCard({ camera, onOpen, onClose, session }: CameraPreviewCardProps) {
  const [state, setState] = useState(() => session.getState());

  // Selection is the explicit user action that authorizes preview playback.
  useEffect(() => {
    const unsubscribe = session.subscribe(setState);
    return () => { unsubscribe(); session.release(); };
  }, [session]);

  return (
    <div className="camera-preview-card" data-testid="camera-preview-card">
      <div ref={(element) => { if (element) session.acquire(element); }} className="camera-preview-surface" data-testid="camera-preview-video" data-state={state.status} />
      <div data-testid="camera-preview-footer" className="camera-preview-meta" role="button" tabIndex={0} onClick={onOpen} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') onOpen(); }}>
        <span className="camera-preview-live"><span className="camera-preview-live-dot" aria-hidden="true" /> LIVE</span>
        <strong data-testid="camera-preview-name">{camera.name}</strong>
        <span className="camera-preview-affordance">Open details</span>
      </div>
      <button type="button" className="camera-preview-close" aria-label="Close camera preview" onClick={(event) => { event.stopPropagation(); onClose(); }}>×</button>
    </div>
  );
}
