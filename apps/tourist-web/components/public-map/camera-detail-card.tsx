'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { PublishedLiveCamera } from 'shared-types';
import { useLivePlayback, type LivePlaybackAdapterFactory, type LivePlaybackSession } from '@/lib/public-map/live-playback';
import { resolveCameraPlaybackAdapterFactory } from '@/lib/public-map/live-camera-e2e';

/**
 * LIVE CAMERAS FOUNDATION checkpoint — the selected-camera detail
 * experience. Deliberately its OWN component, never reusing
 * `PoiDetailCard`'s markup module (a Live Camera is not a POI — see
 * shared-types' `LiveCamera` doc comment) — but it DOES reuse that
 * component's exact CSS contract on purpose: the wrapping element below
 * carries the SAME `poi-detail-card`/`poi-detail-body`/`poi-detail-header`/
 * `poi-detail-name`/`poi-detail-handle`/`poi-detail-close` classes
 * `app/globals.css` already gives full desktop-right-panel /
 * mobile-bottom-sheet responsive behavior (see that file's own `@media`
 * rules) — so this card gets the identical responsive interaction model
 * POIs use with ZERO new layout CSS, and zero risk of diverging from it
 * later. Only new, camera-specific classes (`camera-detail-*`, appended at
 * the end of `app/globals.css`, additive-only) style the inner status/
 * playback area.
 *
 * `TouristMap` mounts this with `key={camera.cameraId}` (mirroring
 * `PoiDetailCard`'s own `key={selectedPoi.poiId}`) — switching to a
 * different camera, or away to a POI/Page, unmounts this component
 * entirely, which is what makes `useLivePlayback()`'s unmount-cleanup
 * guarantee teardown on every one of those transitions with no extra
 * plumbing (see that hook's own doc comment).
 *
 * NO AUTOPLAY: nothing here calls `play()` except the "Play Live" button's
 * `onClick`. A camera published with no `playback` configuration renders a
 * clean "Live stream is not configured" state instead of a Play button —
 * MANDATORY ARCHITECTURE CORRECTION 1, never a fabricated stream.
 */
export interface CameraDetailCardProps {
  readonly camera: PublishedLiveCamera;
  readonly onClose: () => void;
  /** Test-only injection seam — see `live-playback.ts`'s own doc comment. Never set in production code. */
  readonly playbackAdapterFactory?: LivePlaybackAdapterFactory;
  readonly autoPlayOnMount?: boolean;
  readonly playbackSession?: LivePlaybackSession;
}

export function CameraDetailCard({ camera, onClose, playbackAdapterFactory, autoPlayOnMount = false, playbackSession }: CameraDetailCardProps) {
  const closeButtonRef = useRef<HTMLButtonElement | null>(null);
  const headingId = `camera-detail-name-${camera.cameraId}`;
  const fallback = useLivePlayback(camera.playback, resolveCameraPlaybackAdapterFactory(playbackAdapterFactory));
  const [sessionContainer, setSessionContainer] = useState<HTMLDivElement | null>(null);
  const [sessionState, setSessionState] = useState(() => playbackSession?.getState() ?? { status: 'idle' as const });
  useEffect(() => playbackSession?.subscribe(setSessionState), [playbackSession]);
  const state = playbackSession ? sessionState : fallback.state;
  const containerRef = playbackSession ? { current: sessionContainer } : fallback.containerRef;
  const play = useCallback(() => playbackSession ? (sessionContainer ? playbackSession.acquire(sessionContainer) : undefined) : fallback.play(), [fallback, playbackSession, sessionContainer]);
  const stop = useCallback(() => playbackSession ? playbackSession.stop() : fallback.stop(), [fallback, playbackSession]);

  useEffect(() => {
    closeButtonRef.current?.focus();
  }, []);

  useEffect(() => {
    if (autoPlayOnMount && camera.playback && sessionContainer) play();
  }, [autoPlayOnMount, camera.playback, play, sessionContainer]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  function handleClose(): void {
    // Explicit, belt-and-suspenders teardown on Close — the hook's own
    // unmount effect already guarantees this once `onClose()` causes
    // `TouristMap` to stop rendering this component, but calling `stop()`
    // here too keeps the "Close tears playback down" behavior true even in
    // isolation (e.g. a unit test that renders this component standalone
    // and never actually unmounts it).
    stop();
    onClose();
  }

  const isConfigured = Boolean(camera.playback);
  const isPlaying = state.status === 'playing';
  const isConnecting = state.status === 'connecting';

  return (
    <div
      data-testid="camera-detail-card"
      className="poi-detail-card camera-detail-card"
      role="dialog"
      aria-modal="false"
      aria-labelledby={headingId}
    >
      {/* Decorative grab affordance — only visible in the mobile bottom-sheet layout, same as PoiDetailCard's. */}
      <span className="poi-detail-handle" aria-hidden="true" />
      <button
        ref={closeButtonRef}
        type="button"
        data-testid="camera-detail-close"
        className="poi-detail-close"
        aria-label="Close camera details"
        onClick={handleClose}
      >
        <svg viewBox="0 0 24 24" focusable="false" aria-hidden="true">
          <path d="M6.4 5 5 6.4 10.6 12 5 17.6 6.4 19 12 13.4 17.6 19 19 17.6 13.4 12 19 6.4 17.6 5 12 10.6z" />
        </svg>
      </button>

      <div className="poi-detail-body">
        <div className="poi-detail-header">
          <span className="camera-detail-kicker" data-testid="camera-detail-kicker">
            <svg viewBox="0 0 24 24" focusable="false" aria-hidden="true" className="camera-detail-kicker-icon">
              <path d="M4 8.5A1.5 1.5 0 0 1 5.5 7h2l1-1.5h7L16.5 7h2A1.5 1.5 0 0 1 20 8.5v9A1.5 1.5 0 0 1 18.5 19h-13A1.5 1.5 0 0 1 4 17.5Z" />
              <circle cx="12" cy="13" r="3.2" />
            </svg>
            Live Camera
          </span>
          <h2 id={headingId} data-testid="camera-detail-name" className="poi-detail-name">
            {camera.name}
          </h2>
        </div>

        {camera.description ? (
          <div className="poi-detail-section">
            <p data-testid="camera-detail-description" className="poi-detail-description">
              {camera.description}
            </p>
          </div>
        ) : null}

        <div className="camera-detail-playback" data-testid="camera-detail-playback" data-state={state.status}>
          {/* Always mounted (so the HLS adapter has a real DOM node to attach a
              <video> element into once Play is pressed) but only visually
              meaningful once connecting/playing — CSS hides it otherwise. */}
          <div ref={playbackSession ? setSessionContainer : containerRef} className="camera-detail-playback-surface" data-visible={isConnecting || isPlaying ? 'true' : undefined} />

          {!isConfigured ? (
            <p data-testid="camera-detail-not-configured" className="camera-detail-status camera-detail-status--muted">
              Live stream is not configured.
            </p>
          ) : state.status === 'idle' ? (
            <button type="button" data-testid="camera-detail-play" className="camera-detail-play-button" onClick={play}>
              <svg viewBox="0 0 24 24" focusable="false" aria-hidden="true" className="camera-detail-play-icon">
                <path d="M8 5v14l11-7z" />
              </svg>
              Play Live
            </button>
          ) : state.status === 'connecting' ? (
            <p data-testid="camera-detail-connecting" className="camera-detail-status">
              Connecting…
            </p>
          ) : state.status === 'error' ? (
            <p data-testid="camera-detail-error" className="camera-detail-status camera-detail-status--error">
              {state.message}
            </p>
          ) : (
            <button type="button" data-testid="camera-detail-stop" className="camera-detail-stop-button" onClick={stop}>
              Stop
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
