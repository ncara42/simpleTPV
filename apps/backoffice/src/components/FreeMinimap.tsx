import type { MinimapProjection, Size } from '../lib/free-geometry.js';

export interface FreeMinimapProps {
  projection: MinimapProjection;
  size: Size;
  /** Coordenadas (px relativas al minimapa) donde el usuario quiere centrar la vista. */
  onNavigate: (miniX: number, miniY: number) => void;
}

// Vista reducida del lienzo en una esquina: pinta cada elemento como un rectángulo y el
// rectángulo del viewport actual. Clic/arrastre → navega (centra la vista en ese punto).
export function FreeMinimap({ projection, size, onNavigate }: FreeMinimapProps) {
  const navigateFromEvent = (e: React.PointerEvent): void => {
    const rect = e.currentTarget.getBoundingClientRect();
    onNavigate(e.clientX - rect.left, e.clientY - rect.top);
  };

  const onPointerDown = (e: React.PointerEvent): void => {
    e.currentTarget.setPointerCapture(e.pointerId);
    navigateFromEvent(e);
  };
  const onPointerMove = (e: React.PointerEvent): void => {
    if (e.buttons === 1) navigateFromEvent(e);
  };

  return (
    <div
      className="dash-free-minimap"
      data-testid="dash-free-minimap"
      style={{ width: size.width, height: size.height }}
      role="img"
      aria-label="Minimapa del lienzo"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
    >
      {projection.items.map((it) => (
        <span
          key={it.id}
          className={`dash-free-minimap-item dash-free-minimap-item--${it.kind}`}
          style={{ left: it.x, top: it.y, width: Math.max(2, it.w), height: Math.max(2, it.h) }}
        />
      ))}
      <span
        className="dash-free-minimap-view"
        style={{
          left: projection.viewportRect.x,
          top: projection.viewportRect.y,
          width: projection.viewportRect.w,
          height: projection.viewportRect.h,
        }}
      />
    </div>
  );
}
