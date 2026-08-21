/**
 * The shared non-interactive fallback notice — checkpoint 1B.1-D, restyled
 * in checkpoint 1A.10. Used whenever a real, interactive map cannot be
 * rendered: no API key configured for the selected provider, the SDK
 * failed to load, or the provider has no live adapter yet.
 *
 * Only ever renders the reason — the actual current center/zoom/bounds
 * values are checkpoint 1A.10's `MapPreviewInfo`, an always-visible
 * information area rendered by `map-settings-form.tsx` below `MapPreview`
 * regardless of whether the live map or this fallback is showing, so that
 * information is never duplicated between the two.
 */
interface MapPreviewSummaryProps {
  readonly notice: string;
}

export function MapPreviewSummary({ notice }: MapPreviewSummaryProps) {
  return (
    <div
      data-testid="map-preview-summary"
      aria-label="Map preview"
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        textAlign: 'center',
        minHeight: 320,
        border: '1px dashed var(--color-border-strong)',
        borderRadius: 'var(--radius-md)',
        padding: 'var(--space-5)',
        fontSize: 13,
        color: 'var(--color-text-secondary)',
        background: 'var(--color-bg)',
      }}
    >
      <p style={{ margin: 0, maxWidth: '40ch' }}>{notice}</p>
    </div>
  );
}
