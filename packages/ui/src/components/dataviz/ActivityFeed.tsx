import type { ReactNode } from 'react';

import { WidgetStates } from './atoms.js';

// Feed de actividad (#264): línea de tiempo de ventas y alertas recientes. Cada hito lleva un punto
// de color semántico sobre una guía vertical, título (con énfasis) y meta (tienda · hora).
// Presentacional: recibe los hitos ya resueltos.
export type ActivityTone = 'accent' | 'success' | 'warning' | 'danger';

export interface ActivityItem {
  /** Título del hito; puede llevar marcado (p. ej. <strong>) — se renderiza como nodo. */
  title: ReactNode;
  /** Meta secundaria (tienda · hora). */
  meta?: string;
  tone?: ActivityTone;
}
export interface ActivityFeedProps {
  items: ActivityItem[];
  isLoading?: boolean;
  isError?: boolean;
}

export function ActivityFeed({ items, isLoading = false, isError = false }: ActivityFeedProps) {
  if (isLoading) return <WidgetStates state="loading" />;
  if (isError) return <WidgetStates state="error" />;
  if (!items || items.length === 0) return <WidgetStates state="empty" />;

  return (
    <ol className="dv-feed">
      {items.map((it, i) => (
        <li key={i} className="dv-feed-item">
          <span className={`dv-feed-dot dv-feed-dot--${it.tone ?? 'accent'}`} aria-hidden="true" />
          <div className="dv-feed-title">{it.title}</div>
          {it.meta ? <div className="dv-feed-meta">{it.meta}</div> : null}
        </li>
      ))}
    </ol>
  );
}
