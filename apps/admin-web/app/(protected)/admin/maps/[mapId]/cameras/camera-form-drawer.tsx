'use client';

import { useEffect, useState, type FormEvent } from 'react';
import type { PublicContentLanguage, TranslationMetadata } from 'shared-types';
import { TranslationEditor, type TranslationsFieldsState } from '@/components/translation-editor';

/** Mirrors `liveCameraNameSchema`/`liveCameraDescriptionSchema`'s own bounds (packages/validation/src/live-camera.ts). */
const CAMERA_NAME_MAX_LENGTH = 150;
const CAMERA_DESCRIPTION_MAX_LENGTH = 2000;

/**
 * The shared Create/Edit Live Camera drawer — LIVE CAMERAS FOUNDATION
 * checkpoint. Mirrors `PageFormDrawer`'s exact "one form component for both
 * modes" shape: only the initial values, and what `cameras-manager.tsx`
 * does with the submitted payload, differ.
 *
 * Playback configuration is deliberately narrow (MANDATORY ARCHITECTURE
 * CORRECTIONS 1/2 from the Phase A→B review): a transport choice of
 * "Not configured" / "WebRTC" / "HLS", and — only when a transport is
 * chosen — a single browser-safe relay URL field. There is NO RTSP URL
 * field, NO camera username field, NO camera password field, and NO
 * private IP field anywhere in this form — see this file's own "Playback"
 * section copy for how that boundary is explained to the admin.
 */

export type CameraTransportChoice = 'NONE' | 'WEBRTC' | 'HLS' | 'YOUTUBE';

export interface CameraFormValues {
  readonly name: string;
  readonly description: string;
  readonly latitude: string;
  readonly longitude: string;
  readonly status: 'ENABLED' | 'DISABLED';
  readonly transport: CameraTransportChoice;
  readonly playbackUrl: string;
  readonly translations: TranslationsFieldsState;
  readonly translationMetadata?: TranslationMetadata;
}

export interface GeneratedCameraTranslations { readonly translations: TranslationsFieldsState; readonly translationMetadata?: TranslationMetadata }

interface CameraFormDrawerProps {
  readonly mode: 'create' | 'edit';
  readonly initialValues: CameraFormValues;
  readonly enabledLanguages: readonly PublicContentLanguage[];
  readonly defaultLanguage: PublicContentLanguage;
  readonly isSaving: boolean;
  readonly formError?: string;
  readonly fieldErrors: readonly string[];
  readonly onCancel: () => void;
  readonly onSubmit: (values: CameraFormValues) => void;
  readonly translationMetadata?: TranslationMetadata;
  readonly onGenerateTranslations?: (sources: { readonly name: string; readonly description: string }) => Promise<GeneratedCameraTranslations | undefined>;
  readonly isGeneratingTranslations?: boolean;
}

export function CameraFormDrawer({
  mode,
  initialValues,
  enabledLanguages,
  defaultLanguage,
  isSaving,
  formError,
  fieldErrors,
  onCancel,
  onSubmit,
  translationMetadata,
  onGenerateTranslations,
  isGeneratingTranslations,
}: CameraFormDrawerProps) {
  const [name, setName] = useState(initialValues.name);
  const [description, setDescription] = useState(initialValues.description);
  const [latitude, setLatitude] = useState(initialValues.latitude);
  const [longitude, setLongitude] = useState(initialValues.longitude);
  const [status, setStatus] = useState<'ENABLED' | 'DISABLED'>(initialValues.status);
  const [transport, setTransport] = useState<CameraTransportChoice>(initialValues.transport);
  const [playbackUrl, setPlaybackUrl] = useState(initialValues.playbackUrl);
  const [translations, setTranslations] = useState<TranslationsFieldsState>(initialValues.translations);
  const [currentTranslationMetadata, setCurrentTranslationMetadata] = useState(translationMetadata);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent): void {
      if (event.key === 'Escape') {
        onCancel();
      }
    }
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onCancel]);

  function handleSubmit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    if (isSaving) {
      return;
    }
    onSubmit({ name, description, latitude, longitude, status, transport, playbackUrl, translations, translationMetadata: currentTranslationMetadata });
  }

  async function handleGenerateTranslations(): Promise<void> {
    const result = await onGenerateTranslations?.({ name, description });
    if (result) {
      setTranslations(result.translations);
      setCurrentTranslationMetadata(result.translationMetadata);
    }
  }

  return (
    <div className="drawer-overlay" onClick={onCancel}>
      <div className="drawer" role="dialog" aria-modal="true" aria-labelledby="cameraDrawerTitle" onClick={(event) => event.stopPropagation()}>
        <form onSubmit={handleSubmit} noValidate style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
          <div className="drawer-header">
            <h2 id="cameraDrawerTitle" className="drawer-title">
              {mode === 'create' ? 'Create Live Camera' : 'Edit Live Camera'}
            </h2>
            <button type="button" className="btn btn-ghost" onClick={onCancel} aria-label="Close">
              ✕
            </button>
          </div>

          <div className="drawer-body">
            {formError ? (
              <div className="alert alert-danger" role="alert">
                {formError}
              </div>
            ) : null}
            {fieldErrors.length > 0 ? (
              <ul className="alert alert-danger" role="alert" style={{ margin: '0 0 var(--space-4)', paddingLeft: '1.2em' }}>
                {fieldErrors.map((message) => (
                  <li key={message}>{message}</li>
                ))}
              </ul>
            ) : null}

            <div className="field">
              <label className="field-label" htmlFor="cameraName">
                Name
              </label>
              <input
                id="cameraName"
                className="input"
                type="text"
                required
                autoFocus
                maxLength={CAMERA_NAME_MAX_LENGTH}
                value={name}
                onChange={(event) => setName(event.target.value)}
                disabled={isSaving}
              />
            </div>

            <div className="field">
              <label className="field-label" htmlFor="cameraDescription">
                Description
              </label>
              <textarea
                id="cameraDescription"
                className="textarea"
                rows={4}
                maxLength={CAMERA_DESCRIPTION_MAX_LENGTH}
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                disabled={isSaving}
              />
              <span className="field-hint">Optional. Shown to tourists in the camera detail panel.</span>
            </div>

            <TranslationEditor
              idPrefix="camera"
              fields={[
                { key: 'name', label: 'Name', maxLength: CAMERA_NAME_MAX_LENGTH },
                { key: 'description', label: 'Description', maxLength: CAMERA_DESCRIPTION_MAX_LENGTH, multiline: true },
              ]}
              enabledLanguages={enabledLanguages}
              defaultLanguage={defaultLanguage}
              value={translations}
              onChange={setTranslations}
              metadata={currentTranslationMetadata}
              onGenerate={onGenerateTranslations ? () => void handleGenerateTranslations() : undefined}
              generating={isGeneratingTranslations}
              disabled={isSaving}
            />

            <div className="field-row" style={{ display: 'flex', gap: 'var(--space-3)' }}>
              <div className="field" style={{ flex: 1 }}>
                <label className="field-label" htmlFor="cameraLatitude">
                  Latitude
                </label>
                <input
                  id="cameraLatitude"
                  className="input"
                  type="number"
                  step="any"
                  min={-90}
                  max={90}
                  required
                  value={latitude}
                  onChange={(event) => setLatitude(event.target.value)}
                  disabled={isSaving}
                />
              </div>
              <div className="field" style={{ flex: 1 }}>
                <label className="field-label" htmlFor="cameraLongitude">
                  Longitude
                </label>
                <input
                  id="cameraLongitude"
                  className="input"
                  type="number"
                  step="any"
                  min={-180}
                  max={180}
                  required
                  value={longitude}
                  onChange={(event) => setLongitude(event.target.value)}
                  disabled={isSaving}
                />
              </div>
            </div>

            <div className="field">
              <span className="field-label" id="cameraPlaybackLabel">
                Live playback
              </span>
              <p className="field-hint" style={{ marginTop: 0 }}>
                Select how this camera&rsquo;s live video will be shown to visitors. For WebRTC/HLS, enter a public browser-safe
                playback URL. For YouTube, enter an official YouTube video URL. Never enter the camera&rsquo;s RTSP address or
                credentials. Leave this as &ldquo;Not configured&rdquo; if no playback exists yet.
              </p>
              <div className="segmented" role="group" aria-labelledby="cameraPlaybackLabel">
                <button
                  type="button"
                  className="segmented-option"
                  aria-pressed={transport === 'NONE'}
                  onClick={() => setTransport('NONE')}
                  disabled={isSaving}
                >
                  Not configured
                </button>
                <button
                  type="button"
                  className="segmented-option"
                  aria-pressed={transport === 'WEBRTC'}
                  onClick={() => setTransport('WEBRTC')}
                  disabled={isSaving}
                >
                  WebRTC
                </button>
                <button
                  type="button"
                  className="segmented-option"
                  aria-pressed={transport === 'HLS'}
                  onClick={() => setTransport('HLS')}
                  disabled={isSaving}
                >
                  HLS
                </button>
                <button
                  type="button"
                  className="segmented-option"
                  aria-pressed={transport === 'YOUTUBE'}
                  onClick={() => setTransport('YOUTUBE')}
                  disabled={isSaving}
                >
                  YouTube
                </button>
              </div>
            </div>

            {transport !== 'NONE' ? (
              <div className="field">
                <label className="field-label" htmlFor="cameraPlaybackUrl">
                  {transport === 'YOUTUBE' ? 'YouTube URL' : 'Relay playback URL'}
                </label>
                <input
                  id="cameraPlaybackUrl"
                  className="input"
                  type="url"
                  required
                  placeholder={transport === 'YOUTUBE' ? 'https://www.youtube.com/watch?v=VIDEO_ID' : 'https://relay.example.com/live/camera-1/index.m3u8'}
                  value={playbackUrl}
                  onChange={(event) => setPlaybackUrl(event.target.value)}
                  disabled={isSaving}
                />
                <span className="field-hint">
                  {transport === 'YOUTUBE' ? 'Use an official YouTube watch, youtu.be, live, or embed URL.' : 'Must be https://. rtsp:// and URLs with an embedded username/password are rejected.'}
                </span>
              </div>
            ) : null}

            <div className="field">
              <span className="field-label" id="cameraStatusLabel">
                Status
              </span>
              <div className="segmented" role="group" aria-labelledby="cameraStatusLabel">
                <button
                  type="button"
                  className="segmented-option"
                  aria-pressed={status === 'ENABLED'}
                  onClick={() => setStatus('ENABLED')}
                  disabled={isSaving}
                >
                  Enabled
                </button>
                <button
                  type="button"
                  className="segmented-option"
                  aria-pressed={status === 'DISABLED'}
                  onClick={() => setStatus('DISABLED')}
                  disabled={isSaving}
                >
                  Disabled
                </button>
              </div>
            </div>
          </div>

          <div className="drawer-footer">
            <button type="button" className="btn btn-secondary" onClick={onCancel} disabled={isSaving}>
              Cancel
            </button>
            <button type="submit" className="btn btn-primary" disabled={isSaving}>
              {isSaving ? 'Saving…' : mode === 'create' ? 'Create' : 'Save'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
