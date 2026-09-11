import { defaultLivePlaybackAdapterFactory, type LivePlaybackAdapterFactory } from './live-playback';

declare global {
  interface Window {
    __TOURIST_MAP_E2E__?: {
      readonly playbackAdapterFactory: LivePlaybackAdapterFactory;
    };
  }
}

// Only for deterministic Playwright lifecycle verification; never a transport.
// The test installs this before navigation. Production never reads the global.
export function resolveCameraPlaybackAdapterFactory(explicit?: LivePlaybackAdapterFactory): LivePlaybackAdapterFactory {
  return explicit ?? (
    process.env.NODE_ENV !== 'production' && typeof window !== 'undefined'
      ? window.__TOURIST_MAP_E2E__?.playbackAdapterFactory
      : undefined
  ) ?? defaultLivePlaybackAdapterFactory;
}
