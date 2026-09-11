import { useCallback, useEffect, useRef, useState, type RefObject } from 'react';
import type { LiveCameraPlayback } from 'shared-types';
import { extractYouTubeVideoId } from 'validation';

/**
 * LIVE CAMERAS FOUNDATION checkpoint — the dedicated playback transport
 * abstraction. This is the ONE place in `tourist-web` that ever starts or
 * tears down a live stream connection.
 *
 * NO AUTOPLAY, structurally: nothing in this file connects on its own.
 * `useLivePlayback()`'s returned `play()` function is the ONLY code path
 * that ever calls an adapter's `connect()` — it runs exclusively from the
 * "Play Live" button's `onClick` in `camera-detail-card.tsx`. Rendering a
 * marker, selecting a camera, and opening the detail card all leave this
 * hook sitting in `{ status: 'idle' }` with no adapter constructed at all.
 *
 * Teardown is guaranteed via the hook's `useEffect` cleanup (unmount) plus
 * an explicit `stop()` the caller wires to Close/switch-selection — see
 * `camera-detail-card.tsx`'s own doc comment for how React's own unmount
 * semantics (a `key`-ed remount on camera switch, and the mutually-
 * exclusive POI/Page/Camera selection state in `tourist-map.tsx`) already
 * guarantee "another camera selected" / "a POI or Page selected" / "the
 * component unmounts" / "navigation unmounts TouristMap" all invoke this
 * same cleanup — no separate signal is needed for each of those cases.
 *
 * Transport adapters:
 * - `createHlsPlaybackAdapter()` — a REAL, working adapter: HLS playback
 *   needs no signaling and no extra library on a browser with native HLS
 *   support (Safari/iOS) — a plain `<video>` element pointed at the relay's
 *   manifest URL (`playbackUrl`) is the "prefer native browser capabilities"
 *   instruction applied literally. On a browser with no native HLS support,
 *   `canPlayType` reports that up front as an `'error'` state rather than
 *   silently failing.
 * - `createWebRtcPlaybackAdapter()` — a deliberate SEAM ONLY. A real WebRTC
 *   viewer needs a signaling protocol against a specific relay (MediaMTX or
 *   equivalent), which this checkpoint's own scope control explicitly
 *   defers ("do NOT build a fake RTSP server," "MediaMTX deployment... out
 *   of scope"). Implementing a real signaling handshake here would be
 *   inventing incomplete streaming code against a backend that does not
 *   exist yet — this adapter instead honors the full `LivePlaybackAdapter`
 *   interface and reports a clear `'error'` state explaining playback isn't
 *   available yet, so a future checkpoint can replace ONLY this function's
 *   body with a real implementation with no change to the hook, the detail
 *   card, or the domain model.
 * - `createDeterministicTestPlaybackAdapter()` — for tests ONLY, injected
 *   via `adapterFactory`. This is NOT a domain concept: there is no
 *   `'TEST'` member on shared-types' `LiveCameraPlayback.transport`, this
 *   adapter is never selected by `defaultLivePlaybackAdapterFactory()`, and
 *   nothing here is persisted to Firestore/a publication snapshot/any
 *   validation schema (see shared-types' `LiveCameraPlayback` doc comment
 *   for the corresponding domain-model-side guarantee).
 */

export type LivePlaybackState =
  | { readonly status: 'idle' }
  | { readonly status: 'connecting' }
  | { readonly status: 'playing' }
  | { readonly status: 'error'; readonly message: string };

export interface LivePlaybackAdapter {
  /**
   * Begin connecting to `playback`, attaching any video output inside
   * `container`. MUST call `onStateChange` at least once (with `'playing'`
   * on success or `'error'` on failure) — never leave the caller hanging in
   * `'connecting'` forever.
   */
  connect(container: HTMLElement, playback: LiveCameraPlayback, onStateChange: (state: LivePlaybackState) => void): void;
  /** Tear down any active connection/resources. MUST be idempotent — safe to call even if `connect()` was never called or was already torn down. */
  disconnect(): void;
}

export type LivePlaybackAdapterFactory = (playback: LiveCameraPlayback) => LivePlaybackAdapter;

/** See this file's header comment — a real adapter using a plain `<video>` element and native HLS support only, no library. */
export function createHlsPlaybackAdapter(): LivePlaybackAdapter {
  let video: HTMLVideoElement | undefined;

  return {
    connect(container, playback, onStateChange) {
      const probe = document.createElement('video');
      if (!probe.canPlayType('application/vnd.apple.mpegurl')) {
        onStateChange({ status: 'error', message: 'This browser cannot play HLS live streams natively.' });
        return;
      }
      video = document.createElement('video');
      video.autoplay = true;
      video.muted = true;
      video.playsInline = true;
      video.controls = true;
      video.style.width = '100%';
      video.style.height = '100%';
      video.style.display = 'block';
      video.addEventListener('playing', () => onStateChange({ status: 'playing' }));
      video.addEventListener('error', () => onStateChange({ status: 'error', message: 'The live stream could not be reached.' }));
      video.src = playback.playbackUrl;
      container.replaceChildren(video);
      onStateChange({ status: 'connecting' });
    },
    disconnect() {
      if (video) {
        video.pause();
        video.removeAttribute('src');
        video.load();
        video.remove();
        video = undefined;
      }
    },
  };
}

/** See this file's header comment — a deliberate seam, not a real connection: no signaling protocol/relay exists for this checkpoint to connect to yet. */
export function createWebRtcPlaybackAdapter(): LivePlaybackAdapter {
  return {
    connect(_container, _playback, onStateChange) {
      onStateChange({
        status: 'error',
        message: 'WebRTC playback is not yet available — this foundation reserves the transport seam for a future checkpoint.',
      });
    },
    disconnect() {
      // Nothing was ever connected — idempotent no-op.
    },
  };
}

export function createYouTubePlaybackAdapter(): LivePlaybackAdapter {
  let iframe: HTMLIFrameElement | undefined;
  return {
    connect(container, playback, onStateChange) {
      const videoId = extractYouTubeVideoId(playback.playbackUrl);
      if (!videoId) {
        onStateChange({ status: 'error', message: 'The YouTube URL is invalid.' });
        return;
      }
      iframe = document.createElement('iframe');
      iframe.src = `https://www.youtube-nocookie.com/embed/${encodeURIComponent(videoId)}?autoplay=1&mute=1&rel=0`;
      iframe.title = 'YouTube live video';
      iframe.allow = 'autoplay; encrypted-media; picture-in-picture';
      iframe.allowFullscreen = true;
      iframe.style.width = '100%';
      iframe.style.height = '100%';
      iframe.style.border = '0';
      container.replaceChildren(iframe);
      onStateChange({ status: 'playing' });
    },
    disconnect() {
      iframe?.remove();
      iframe = undefined;
    },
  };
}

/** Dispatches to the real adapter matching `playback.transport` — the default a live camera's "Play Live" button uses. */
export function defaultLivePlaybackAdapterFactory(playback: LiveCameraPlayback): LivePlaybackAdapter {
  if (playback.transport === 'HLS') return createHlsPlaybackAdapter();
  if (playback.transport === 'YOUTUBE') return createYouTubePlaybackAdapter();
  return createWebRtcPlaybackAdapter();
}

/**
 * TEST-ONLY deterministic adapter — never wired as the default, only ever
 * passed explicitly as `adapterFactory` by a test. Transitions straight to
 * `'playing'` with no timers/network, so a test asserting "Play starts the
 * playback abstraction" needs no fake clock.
 */
export function createDeterministicTestPlaybackAdapter(): LivePlaybackAdapter {
  return {
    connect(_container, _playback, onStateChange) {
      onStateChange({ status: 'connecting' });
      onStateChange({ status: 'playing' });
    },
    disconnect() {
      // Nothing to release — deterministic/no real resources.
    },
  };
}

/**
 * A plain, React-free state machine — deliberately extracted from the hook
 * below so the core no-autoplay / guaranteed-teardown contract is directly
 * unit-testable with plain vitest (no React renderer / Testing Library
 * dependency needed — this repository has none yet, see
 * `live-playback.test.ts`'s own header comment for why that matters here).
 * `useLivePlayback()` is a thin React wrapper around one of these.
 */
export class LivePlaybackController {
  private state: LivePlaybackState = { status: 'idle' };
  private adapter: LivePlaybackAdapter | undefined;
  private readonly listeners = new Set<(state: LivePlaybackState) => void>();

  constructor(
    private readonly playback: LiveCameraPlayback | undefined,
    private readonly adapterFactory: LivePlaybackAdapterFactory = defaultLivePlaybackAdapterFactory,
  ) {}

  getState(): LivePlaybackState {
    return this.state;
  }

  subscribe(listener: (state: LivePlaybackState) => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private setState(next: LivePlaybackState): void {
    this.state = next;
    for (const listener of this.listeners) {
      listener(next);
    }
  }

  /**
   * The ONLY method that ever calls an adapter's `connect()` — construction
   * alone never does, and neither does anything else on this class. Callers
   * must invoke this ONLY from an explicit user action ("Play Live"). A
   * camera with no `playback` configuration (`this.playback === undefined`)
   * is a no-op — there is nothing to connect to (MANDATORY ARCHITECTURE
   * CORRECTION 1).
   */
  play(container: HTMLElement): void {
    if (!this.playback) {
      return;
    }
    // Switching cameras/replaying always disconnects any PRIOR adapter
    // first — never two live connections at once.
    this.adapter?.disconnect();
    const adapter = this.adapterFactory(this.playback);
    this.adapter = adapter;
    adapter.connect(container, this.playback, (next) => this.setState(next));
  }

  /** Tears playback down and returns to `'idle'`. Idempotent — safe to call even if `play()` was never called. */
  stop(): void {
    this.adapter?.disconnect();
    this.adapter = undefined;
    this.setState({ status: 'idle' });
  }
}

/** A logical preview session whose lifetime is scoped to one TouristMap selection. */
export class LivePlaybackSession {
  private readonly controller: LivePlaybackController;
  private acquired = false;

  constructor(playback: LiveCameraPlayback | undefined, adapterFactory: LivePlaybackAdapterFactory = defaultLivePlaybackAdapterFactory) {
    this.controller = new LivePlaybackController(playback, adapterFactory);
  }

  getState(): LivePlaybackState { return this.controller.getState(); }
  subscribe(listener: (state: LivePlaybackState) => void): () => void { return this.controller.subscribe(listener); }
  acquire(container: HTMLElement): void {
    if (this.acquired) return;
    this.acquired = true;
    this.controller.play(container);
  }
  release(): void {
    // Presentation unmounts (including Strict Mode replay) do not end the
    // logical selected-camera session; the owner explicitly stops it.
  }
  stop(): void {
    this.acquired = false;
    this.controller.stop();
  }
}

export interface UseLivePlaybackResult {
  readonly state: LivePlaybackState;
  /** Attach to the DOM node the adapter may render video output into (e.g. the HLS `<video>` element). */
  readonly containerRef: RefObject<HTMLDivElement | null>;
  /** The ONLY function that may start playback — call this ONLY from an explicit user action ("Play Live"). */
  readonly play: () => void;
  /** Tears playback down and returns to `'idle'`. Idempotent. */
  readonly stop: () => void;
}

/**
 * See this file's header comment for the full no-autoplay / guaranteed-
 * teardown contract this hook exists to enforce structurally. A thin React
 * wrapper around `LivePlaybackController` — constructing the hook (i.e.
 * mounting `CameraDetailCard`) never itself connects; only calling the
 * returned `play()` does.
 *
 * Controller construction uses `useState`'s lazy initializer (NOT a
 * `useRef` + "if empty, assign" pattern) because React's rules forbid
 * reading or writing `ref.current` synchronously during render — only the
 * `useState(() => ...)` initializer form is sanctioned for "construct once,
 * keep stable identity for this mount" semantics. The initializer runs
 * exactly once per mount, so `playback` is captured a single time.
 *
 * That one-time capture is safe (never stale after a camera switch)
 * because of the caller's architecture, not anything in this hook:
 * `tourist-map.tsx` renders `CameraDetailCard` as
 * `<CameraDetailCard key={selectedCamera.cameraId} ...>`. A `key` change on
 * camera switch makes React fully unmount the previous `CameraDetailCard`
 * (running this hook's unmount cleanup, which stops playback) and mount a
 * brand-new instance from scratch (running this lazy initializer fresh
 * with the new camera's `playback`). This hook is therefore never asked to
 * react to `playback` changing in place — it only ever sees one `playback`
 * value for its entire mounted lifetime.
 */
export function useLivePlayback(
  playback: LiveCameraPlayback | undefined,
  adapterFactory: LivePlaybackAdapterFactory = defaultLivePlaybackAdapterFactory,
): UseLivePlaybackResult {
  const [controller] = useState<LivePlaybackController>(
    () => new LivePlaybackController(playback, adapterFactory),
  );

  const [state, setState] = useState<LivePlaybackState>(() => controller.getState());
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mountedRef = useRef(false);

  useEffect(() => controller.subscribe(setState), [controller]);

  const play = useCallback(() => {
    if (containerRef.current) {
      controller.play(containerRef.current);
    }
  }, [controller]);

  const stop = useCallback(() => controller.stop(), [controller]);

  // Guaranteed teardown on unmount — covers "component unmounts" and
  // "navigation unmounts TouristMap" directly; "Close pressed" / "another
  // camera selected" / "a POI or Page selected" are covered because the
  // caller (`camera-detail-card.tsx`, mounted with `key={camera.cameraId}`
  // only while that one camera is selected) unmounts on every one of those
  // transitions, which runs this exact same cleanup.
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      // React Strict Mode replays effects in development. Deferring the
      // cleanup preserves one playback session across that diagnostic replay,
      // while a genuine unmount still observes an unmounted ref and stops.
      queueMicrotask(() => {
        if (!mountedRef.current) controller.stop();
      });
    };
  }, [controller]);

  return { state, containerRef, play, stop };
}
