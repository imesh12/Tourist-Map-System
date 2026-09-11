import { afterEach, describe, expect, it, vi } from 'vitest';
import type { LiveCameraPlayback } from 'shared-types';
import { resolveCameraPlaybackAdapterFactory } from './live-camera-e2e';
import { defaultLivePlaybackAdapterFactory, LivePlaybackController, type LivePlaybackAdapter } from './live-playback';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe('camera playback browser injection', () => {
  it.each(['development', 'test', 'production'])('explicit prop wins in %s', (mode) => {
    vi.stubEnv('NODE_ENV', mode);
    const explicit = vi.fn();
    const injected = vi.fn();
    vi.stubGlobal('window', { __TOURIST_MAP_E2E__: { playbackAdapterFactory: injected } });
    expect(resolveCameraPlaybackAdapterFactory(explicit)).toBe(explicit);
    expect(injected).not.toHaveBeenCalled();
  });

  it('uses the normal factory without an E2E global', () => {
    vi.stubGlobal('window', {});
    expect(resolveCameraPlaybackAdapterFactory()).toBe(defaultLivePlaybackAdapterFactory);
  });

  it('uses the normal factory during server rendering', () => {
    vi.stubGlobal('window', undefined);
    expect(resolveCameraPlaybackAdapterFactory()).toBe(defaultLivePlaybackAdapterFactory);
  });

  it('never reads the E2E global in production', () => {
    vi.stubEnv('NODE_ENV', 'production');
    const readHook = vi.fn(() => { throw new Error('Production read the E2E hook'); });
    vi.stubGlobal('window', Object.defineProperty({}, '__TOURIST_MAP_E2E__', { get: readHook }));
    expect(resolveCameraPlaybackAdapterFactory()).toBe(defaultLivePlaybackAdapterFactory);
    expect(readHook).not.toHaveBeenCalled();
  });

  it.each(['development', 'test'])('injected factory in %s connects only on Play and disconnects on stop', (mode) => {
    vi.stubEnv('NODE_ENV', mode);
    const adapter: LivePlaybackAdapter = {
      connect: vi.fn((_container, _playback, change) => change({ status: 'playing' })),
      disconnect: vi.fn(),
    };
    const factory = vi.fn(() => adapter);
    vi.stubGlobal('window', { __TOURIST_MAP_E2E__: { playbackAdapterFactory: factory } });
    const playback: LiveCameraPlayback = { transport: 'HLS', playbackUrl: 'https://relay.example.test/harbor.m3u8' };
    const controller = new LivePlaybackController(playback, resolveCameraPlaybackAdapterFactory());
    expect(factory).not.toHaveBeenCalled();
    expect(adapter.connect).not.toHaveBeenCalled();
    expect(controller.getState()).toEqual({ status: 'idle' });
    const container = {} as HTMLElement;
    controller.play(container);
    expect(factory).toHaveBeenCalledTimes(1);
    expect(factory).toHaveBeenCalledWith(playback);
    expect(adapter.connect).toHaveBeenCalledTimes(1);
    expect(adapter.connect).toHaveBeenCalledWith(container, playback, expect.any(Function));
    expect(controller.getState()).toEqual({ status: 'playing' });
    controller.stop();
    controller.stop();
    expect(adapter.disconnect).toHaveBeenCalledTimes(1);
  });
});
