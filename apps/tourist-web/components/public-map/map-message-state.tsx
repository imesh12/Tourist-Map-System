/**
 * The shared full-viewport "here's a friendly sentence, nothing else"
 * state — checkpoint 1B.9 §6.D/§13. Used for both the unpublished/
 * nonexistent state (app/maps/[mapId]/not-found.tsx) and the generic
 * server/network failure state (app/maps/[mapId]/page.tsx's own 'error'
 * branch) — the same component, different `message` text, so both states
 * look and behave identically to a visitor (full-viewport, centered,
 * accessible) rather than one being a polished custom page and the other an
 * afterthought.
 *
 * §12/§13: never receives or renders anything beyond a pre-written,
 * tourist-friendly sentence — no error code, no stack trace, no internal
 * identifier is ever passed into this component, by construction (its only
 * prop is a plain `string`).
 */
export interface MapMessageStateProps {
  readonly message: string;
}

export function MapMessageState({ message }: MapMessageStateProps) {
  return (
    <div className="tourist-map-shell tourist-map-message-shell" data-testid="tourist-map-message-state" role="status">
      <h1 className="tourist-map-message-heading">Tourist Map System</h1>
      <p className="tourist-map-message-text">{message}</p>
    </div>
  );
}
