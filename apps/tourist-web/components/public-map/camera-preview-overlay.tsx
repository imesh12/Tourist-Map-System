'use client';

import { createPortal } from 'react-dom';
import { useEffect, useState } from 'react';
import type { PublishedLiveCamera } from 'shared-types';
import { CameraPreviewCard } from './camera-preview-card';
import type { LivePlaybackSession } from '@/lib/public-map/live-playback';

interface CameraPreviewOverlayProps {
  readonly map?: google.maps.Map;
  readonly camera: PublishedLiveCamera;
  readonly onOpen: () => void;
  readonly onClose: () => void;
  readonly session: LivePlaybackSession;
}

/** Uses Google Maps OverlayView so the preview follows pan/zoom without screen-coordinate math. */
export function CameraPreviewOverlay({ map, camera, onOpen, onClose, session }: CameraPreviewOverlayProps) {
  const [container, setContainer] = useState<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!map) return;
    class CameraOverlay extends google.maps.OverlayView {
      private element: HTMLDivElement | undefined;

      override onAdd(): void {
        this.element = document.createElement('div');
        this.element.className = 'camera-preview-overlay-pane';
        this.getPanes()?.floatPane.appendChild(this.element);
        setContainer(this.element);
      }

      override draw(): void {
        const projection = this.getProjection();
        if (!this.element || !projection) return;
        const point = projection.fromLatLngToDivPixel(new google.maps.LatLng(camera.location.latitude, camera.location.longitude));
        if (!point) return;
        this.element.style.transform = `translate(-50%, -100%) translate(${point.x}px, ${point.y}px)`;
      }

      override onRemove(): void {
        setContainer(null);
        this.element?.remove();
        this.element = undefined;
      }
    }

    const overlay = new CameraOverlay();
    overlay.setMap(map);
    return () => overlay.setMap(null);
  }, [map, camera.location.latitude, camera.location.longitude]);

  const card = <CameraPreviewCard camera={camera} onOpen={onOpen} onClose={onClose} session={session} />;
  return map ? (container ? createPortal(card, container) : null) : <div className="camera-preview-fallback">{card}</div>;
}
