import { describe, expect, it, vi } from 'vitest';
import type { LiveCameraPlayback } from 'shared-types';
import {
  createDeterministicTestPlaybackAdapter,
  createYouTubePlaybackAdapter,
  createWebRtcPlaybackAdapter,
  LivePlaybackController,
  LivePlaybackSession,
  type LivePlaybackAdapter,
  type LivePlaybackState,
} from './live-playback';

/**
 * LIVE CAMERAS FOUNDATION checkpoint — unit tests for the playback
 * abstraction's core NO AUTOPLAY / guaranteed-teardown contract.
 *
 * Deliberately exercises `LivePlaybackController` directly (a plain,
 * React-free class — see its own doc comment in `live-playback.ts`) rather
 * than the `useLivePlayback()` React hook: this repository has no React
 * component/hook testing infrastructure yet (no Testing Library, no jsdom
 * dependency — every existing `apps/tourist-web/lib/public-map/*.test.ts`
 * file tests plain functions only), and introducing one is out of scope for
 * this foundation checkpoint. Every behavior this suite proves at the
 * controller level (never connects until `play()` is called; a switch/
 * replay always disconnects the prior adapter; `stop()` guarantees
 * teardown) is exactly what the hook then inherits unchanged, since the
 * hook is a thin wrapper with no additional connect/disconnect logic of its
 * own (see `useLivePlayback`'s own doc comment).
 *
 * `createHlsPlaybackAdapter()` is intentionally NOT exercised here — it
 * uses real `document`/`HTMLVideoElement` APIs this Node-environment test
 * run has no jsdom polyfill for (see this repository's vitest setup — no
 * `environment: 'jsdom'` is configured anywhere). It stays a real, browser-
 * only adapter (this file's own header comment); a future checkpoint that
 * adds component-level testing infrastructure is the right place to cover
 * it directly.
 */

const HLS_PLAYBACK: LiveCameraPlayback = { transport: 'HLS', playbackUrl: 'https://relay.example.com/live/cam-1.m3u8' };

function fakeContainer(): HTMLElement {
  // Never actually touched by the mock/deterministic/WebRTC adapters below
  // (none of them read from or write to the container) — a plain object
  // satisfies the type without needing a real DOM element.
  return {} as HTMLElement;
}

function mockAdapter(): { adapter: LivePlaybackAdapter; connect: ReturnType<typeof vi.fn>; disconnect: ReturnType<typeof vi.fn> } {
  const connect = vi.fn((_container: HTMLElement, _playback: LiveCameraPlayback, onStateChange: (state: LivePlaybackState) => void) => {
    onStateChange({ status: 'playing' });
  });
  const disconnect = vi.fn();
  return { adapter: { connect, disconnect }, connect, disconnect };
}

describe('LivePlaybackController — NO AUTOPLAY', () => {
  it('never connects on construction — rendering/selecting a camera must not start playback', () => {
    const { adapter, connect } = mockAdapter();
    const controller = new LivePlaybackController(HLS_PLAYBACK, () => adapter);
    expect(controller.getState()).toEqual({ status: 'idle' });
    expect(connect).not.toHaveBeenCalled();
  });

  it('play() is a no-op when the camera has no playback configuration at all', () => {
    const { adapter, connect } = mockAdapter();
    const controller = new LivePlaybackController(undefined, () => adapter);
    controller.play(fakeContainer());
    expect(connect).not.toHaveBeenCalled();
    expect(controller.getState()).toEqual({ status: 'idle' });
  });
});

describe('LivePlaybackController — Play starts the playback abstraction', () => {
  it('play() invokes the adapter and adopts its reported state', () => {
    const { adapter, connect } = mockAdapter();
    const controller = new LivePlaybackController(HLS_PLAYBACK, () => adapter);
    controller.play(fakeContainer());
    expect(connect).toHaveBeenCalledTimes(1);
    expect(controller.getState()).toEqual({ status: 'playing' });
  });

  it('notifies subscribers of every state change', () => {
    const { adapter } = mockAdapter();
    const controller = new LivePlaybackController(HLS_PLAYBACK, () => adapter);
    const states: LivePlaybackState[] = [];
    controller.subscribe((state) => states.push(state));
    controller.play(fakeContainer());
    expect(states).toEqual([{ status: 'playing' }]);
  });
});

describe('LivePlaybackController — teardown', () => {
  it('stop() disconnects the active adapter and returns to idle', () => {
    const { adapter, disconnect } = mockAdapter();
    const controller = new LivePlaybackController(HLS_PLAYBACK, () => adapter);
    controller.play(fakeContainer());
    controller.stop();
    expect(disconnect).toHaveBeenCalledTimes(1);
    expect(controller.getState()).toEqual({ status: 'idle' });
  });

  it('stop() is idempotent — safe even if play() was never called', () => {
    const { adapter, disconnect } = mockAdapter();
    const controller = new LivePlaybackController(HLS_PLAYBACK, () => adapter);
    expect(() => controller.stop()).not.toThrow();
    expect(disconnect).not.toHaveBeenCalled();
    expect(controller.getState()).toEqual({ status: 'idle' });
  });

  it('switching (a second play() call) disconnects the PRIOR adapter before connecting the new one', () => {
    const first = mockAdapter();
    const second = mockAdapter();
    const factory = vi.fn().mockReturnValueOnce(first.adapter).mockReturnValueOnce(second.adapter);
    const controller = new LivePlaybackController(HLS_PLAYBACK, factory);

    controller.play(fakeContainer());
    expect(first.connect).toHaveBeenCalledTimes(1);

    controller.play(fakeContainer());
    expect(first.disconnect).toHaveBeenCalledTimes(1);
    expect(second.connect).toHaveBeenCalledTimes(1);
    expect(controller.getState()).toEqual({ status: 'playing' });
  });
});

describe('LivePlaybackSession — logical preview ownership', () => {
  it('acquires once, absorbs presentation release/reacquire, and stops on final owner release', () => {
    const first = mockAdapter();
    const session = new LivePlaybackSession(HLS_PLAYBACK, () => first.adapter);
    expect(first.connect).not.toHaveBeenCalled();
    session.acquire(fakeContainer());
    session.acquire(fakeContainer());
    expect(first.connect).toHaveBeenCalledTimes(1);
    session.release();
    session.acquire(fakeContainer());
    expect(first.connect).toHaveBeenCalledTimes(1);
    session.stop();
    expect(first.disconnect).toHaveBeenCalledTimes(1);
  });

  it('uses separate sessions for playback identity changes and tears down the old one first', () => {
    const oldAdapter = mockAdapter();
    const newAdapter = mockAdapter();
    const oldSession = new LivePlaybackSession(HLS_PLAYBACK, () => oldAdapter.adapter);
    const newSession = new LivePlaybackSession({ transport: 'WEBRTC', playbackUrl: 'https://relay.example.com/cam-2' }, () => newAdapter.adapter);
    oldSession.acquire(fakeContainer());
    oldSession.stop();
    newSession.acquire(fakeContainer());
    expect(oldAdapter.disconnect).toHaveBeenCalledTimes(1);
    expect(newAdapter.connect).toHaveBeenCalledTimes(1);
  });
});

describe('createDeterministicTestPlaybackAdapter — test-only, never the domain default', () => {
  it('connect() transitions synchronously to playing with no timers/network', () => {
    const adapter = createDeterministicTestPlaybackAdapter();
    const states: LivePlaybackState[] = [];
    adapter.connect(fakeContainer(), HLS_PLAYBACK, (state) => states.push(state));
    expect(states).toEqual([{ status: 'connecting' }, { status: 'playing' }]);
  });

  it('disconnect() is a safe no-op', () => {
    const adapter = createDeterministicTestPlaybackAdapter();
    expect(() => adapter.disconnect()).not.toThrow();
  });
});

describe('createWebRtcPlaybackAdapter — deliberate seam, never a real connection this checkpoint', () => {
  it('connect() reports an error state rather than fabricating a stream', () => {
    const adapter = createWebRtcPlaybackAdapter();
    const states: LivePlaybackState[] = [];
    adapter.connect(fakeContainer(), { transport: 'WEBRTC', playbackUrl: 'https://relay.example.com/whep/cam-1' }, (state) =>
      states.push(state),
    );
    expect(states).toHaveLength(1);
    expect(states[0]?.status).toBe('error');
  });

  it('disconnect() is a safe no-op — nothing was ever connected', () => {
    const adapter = createWebRtcPlaybackAdapter();
    expect(() => adapter.disconnect()).not.toThrow();
  });
});

describe('createYouTubePlaybackAdapter — click-only iframe lifecycle', () => {
  it('creates a youtube-nocookie iframe on connect and removes it on disconnect', () => {
    const iframe = { style: {}, remove: vi.fn() } as unknown as HTMLIFrameElement & { src?: string };
    vi.stubGlobal('document', { createElement: vi.fn(() => iframe) });
    const container = { replaceChildren: vi.fn() } as unknown as HTMLElement;
    const states: LivePlaybackState[] = [];
    const adapter = createYouTubePlaybackAdapter();
    adapter.connect(container, { transport: 'YOUTUBE', playbackUrl: 'https://youtu.be/abcDEF_1234' }, (state) => states.push(state));
    expect(iframe.src).toBe('https://www.youtube-nocookie.com/embed/abcDEF_1234?autoplay=1&mute=1&rel=0');
    expect(container.replaceChildren).toHaveBeenCalledWith(iframe);
    expect(states).toEqual([{ status: 'playing' }]);
    adapter.disconnect();
    expect(iframe.remove).toHaveBeenCalledTimes(1);
    vi.unstubAllGlobals();
  });
});
