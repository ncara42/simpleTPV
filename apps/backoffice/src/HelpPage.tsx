import { LifeBuoy, Mail, MessageCircle, Phone } from 'lucide-react';
import type { ReactNode } from 'react';

import { ApiKeysSection } from './ApiKeysPage.js';
import { usePageHeader } from './lib/pageHeader.js';

// Canales de soporte. Configurables por despliegue (VITE_SUPPORT_*) con defaults
// para que el panel funcione sin configuración. El WhatsApp es el número en
// formato internacional sin signos (p. ej. 34600123456) para construir el wa.me.
const SUPPORT_EMAIL = import.meta.env.VITE_SUPPORT_EMAIL ?? 'soporte@simpletpv.es';
const SUPPORT_PHONE = import.meta.env.VITE_SUPPORT_PHONE ?? '+34 600 123 456';
const SUPPORT_WHATSAPP = import.meta.env.VITE_SUPPORT_WHATSAPP ?? '34600123456';

const telHref = `tel:${SUPPORT_PHONE.replace(/\s/g, '')}`;
const waHref = `https://wa.me/${SUPPORT_WHATSAPP}`;
const mailHref = `mailto:${SUPPORT_EMAIL}`;

interface Faq {
  q: string;
  a: ReactNode;
}

// FAQ centrada en tareas reales del producto (apunta a la sección del backoffice
// que las resuelve), para que el comerciante se autoresuelva antes de escribir.
const FAQ: Faq[] = [
  {
    q: '¿Cómo doy de alta un producto?',
    a: 'En Catálogo › «Nuevo producto». Para cargar muchos a la vez, usa «Importar CSV» con las columnas name, salePrice, sku, barcode.',
  },
  {
    q: '¿Cómo organizo el catálogo en familias?',
    a: 'En Familias puedes crear familias y subfamilias (con la profundidad que necesites), marcar como arquetipo los grupos de productos casi idénticos, reordenar arrastrando y mover productos entre nodos.',
  },
  {
    q: '¿Cómo cargo el stock inicial de cada tienda?',
    a: 'En Stock › «Importar CSV». También puedes ajustar existencias y mínimos por tienda pulsando sobre el contador de stock de un producto.',
  },
  {
    q: '¿Cómo muevo stock entre tiendas?',
    a: 'En Stock › Traspasos. Crea el traspaso (origen, destino y líneas) y márcalo como enviado; la tienda destino lo recibe.',
  },
  {
    q: '¿Dónde veo ventas, márgenes y la evolución del negocio?',
    a: 'El Dashboard resume ventas, beneficio y comparativas. En Ventas tienes el detalle filtrable y exportable a CSV.',
  },
  {
    q: '¿Cómo gestiono los usuarios y sus permisos?',
    a: 'En Usuarios. Hay tres roles: Admin (todo), Responsable (gestión de su tienda) y Dependiente (venta en el TPV).',
  },
  {
    q: '¿Para qué sirven las API keys?',
    a: 'En API Keys generas claves de acceso externo de solo lectura al stock (p. ej. para un ERP o un cliente mayorista). La clave se muestra una sola vez y es revocable.',
  },
  {
    q: '¿Cómo preparo un pedido mayorista para un cliente?',
    a: 'En Mayorista: da de alta el cliente y su tarifa, y crea el pedido. El precio de cada línea se congela desde la tarifa del cliente.',
  },
];

export function HelpPage() {
  usePageHeader('Ayuda', 'Soporte y preguntas frecuentes');

  return (
    <section className="catalog" data-testid="help-page">
      <div className="table-panel table-panel--content">
        <h3 className="help-title">
          <LifeBuoy size={18} aria-hidden="true" /> ¿Necesitas ayuda?
        </h3>
        <p className="muted help-intro">
          Escríbenos por cualquiera de estos canales. Horario de soporte: L-V de 9:00 a 19:00.
        </p>
        <div className="help-channels">
          <a
            className="help-channel"
            href={waHref}
            target="_blank"
            rel="noopener noreferrer"
            data-testid="help-whatsapp"
          >
            <MessageCircle size={22} aria-hidden="true" />
            <span className="help-channel-label">WhatsApp</span>
            <span className="help-channel-value">{SUPPORT_PHONE}</span>
          </a>
          <a className="help-channel" href={mailHref} data-testid="help-email">
            <Mail size={22} aria-hidden="true" />
            <span className="help-channel-label">Email</span>
            <span className="help-channel-value">{SUPPORT_EMAIL}</span>
          </a>
          <a className="help-channel" href={telHref} data-testid="help-phone">
            <Phone size={22} aria-hidden="true" />
            <span className="help-channel-label">Teléfono</span>
            <span className="help-channel-value">{SUPPORT_PHONE}</span>
          </a>
        </div>
      </div>

      <div className="table-panel table-panel--content">
        <h3 className="help-title">Preguntas frecuentes</h3>
        <div className="help-faq" data-testid="help-faq">
          {FAQ.map((f) => (
            <details key={f.q} className="help-faq-item" data-testid="faq-item">
              <summary>{f.q}</summary>
              <p>{f.a}</p>
            </details>
          ))}
        </div>

        {/* Integraciones (D-09b): la gestión de claves API vive aquí — una page
            propia en el menú era overkill para una función que se toca poco. */}
        <div className="help-integrations" id="integraciones" data-testid="help-integrations">
          <h3>Integraciones · Claves API</h3>
          <p className="muted">
            Acceso externo de solo lectura al stock para integraciones (webs, ERPs…).
          </p>
          <ApiKeysSection />
        </div>
      </div>
    </section>
  );
}
