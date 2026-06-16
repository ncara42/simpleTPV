import './help.css';

import { usePageHeader } from '@simpletpv/ui';
import { LifeBuoy, Mail, MessageCircle, Phone } from 'lucide-react';
import type { ReactNode } from 'react';

// Canales de soporte configurables por despliegue (VITE_SUPPORT_*), con defaults
// para que la ayuda funcione sin configuración. Mismos nombres que el backoffice.
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

// FAQ centrada en las tareas reales del cajero en el TPV, para que se autoresuelva
// antes de tener que llamar al responsable o al soporte.
const FAQ: Faq[] = [
  {
    q: '¿Cómo abro la caja al empezar el turno?',
    a: 'En Caja, introduce el efectivo inicial del cajón y pulsa «Abrir caja». No podrás cobrar hasta que la caja esté abierta.',
  },
  {
    q: '¿Cómo cobro una venta?',
    a: 'Añade productos al ticket (escaneando el código o buscando por nombre), pulsa «Cobrar», elige efectivo o tarjeta e indica el importe entregado si es en efectivo.',
  },
  {
    q: '¿Cómo cierro la caja al terminar?',
    a: 'En Caja pulsa «Cerrar caja» y cuenta el efectivo por denominaciones. El sistema calcula el cuadre (esperado frente a contado) y el cierre queda guardado en «Cierres recientes».',
  },
  {
    q: '¿Cómo consulto el stock de un producto en otras tiendas?',
    a: 'En Venta, pulsa sobre el contador de stock de la tarjeta del producto: se abre el detalle con las existencias en cada tienda, incluso si está agotado en la tuya.',
  },
  {
    q: '¿Cómo hago una devolución?',
    a: 'En Tickets emitidos localiza el ticket y emite la devolución de las líneas correspondientes. Para devoluciones sin ticket hace falta el PIN de un responsable.',
  },
  {
    q: '¿Cómo fichan los empleados?',
    a: 'En Fichaje cada empleado registra su entrada, las pausas y la salida. El contador del turno se muestra junto a «Fichaje» en el menú.',
  },
  {
    q: '¿Qué pasa si se cae la conexión a internet?',
    a: 'El TPV sigue funcionando sin conexión: las ventas se guardan y se sincronizan solas al recuperarla. El cobro solo se bloquea si el servidor está degradado.',
  },
  {
    q: '¿Por qué no puedo registrar entradas o retiradas de efectivo?',
    a: 'Los movimientos de caja los autoriza un responsable. Si necesitas ingresar o retirar efectivo, avisa a tu encargado o administrador.',
  },
];

export function HelpPage() {
  usePageHeader('Ayuda', 'Soporte y preguntas frecuentes');

  return (
    <section className="help-page" data-testid="help-page">
      <section className="help-section">
        <header className="help-section-head">
          <h3 className="help-title">
            <LifeBuoy size={18} aria-hidden="true" /> ¿Necesitas ayuda?
          </h3>
          <p className="help-intro">
            Escríbenos por cualquiera de estos canales. Horario de soporte: L-V de 9:00 a 19:00.
          </p>
        </header>
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
      </section>

      <section className="help-section">
        <header className="help-section-head">
          <h3 className="help-title">Preguntas frecuentes</h3>
        </header>
        <div className="help-faq" data-testid="help-faq">
          {FAQ.map((f) => (
            <details key={f.q} className="help-faq-item" data-testid="faq-item">
              <summary>{f.q}</summary>
              <p>{f.a}</p>
            </details>
          ))}
        </div>
      </section>
    </section>
  );
}
