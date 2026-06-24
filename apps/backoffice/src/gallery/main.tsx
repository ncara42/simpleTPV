import '@simpletpv/ui/theme.css';
import '@simpletpv/ui/theme-geist.css';
import '@simpletpv/ui/chart.css';
import '@simpletpv/ui/datatable.css';
import '@simpletpv/ui/dataviz.css';
import './gallery.css';

import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import { WidgetGallery } from './WidgetGallery.js';

// Entry de la galería de widgets (#264): página showcase estática (datos demo literales), servida
// como entry de Vite aparte (gallery.html). No se monta en la app real; es referencia + regresión.
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <WidgetGallery />
  </StrictMode>,
);
