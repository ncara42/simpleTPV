import { useQuery } from '@tanstack/react-query';

import { usePageHeader } from './lib/pageHeader.js';
import { listVerifactuRecords, summarizeVerifactu } from './lib/verifactu.js';

// "hace N s/min/h/d" desde un ISO; texto de respaldo si aún no hay envíos.
function relativeFromNow(iso: string | null, nowMs: number): string {
  if (!iso) return 'sin envíos';
  const s = Math.max(0, Math.floor((nowMs - new Date(iso).getTime()) / 1000));
  if (s < 60) return `hace ${s} s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `hace ${m} min`;
  const h = Math.floor(m / 60);
  if (h < 24) return `hace ${h} h`;
  return `hace ${Math.floor(h / 24)} d`;
}

export function VerifactuPage() {
  usePageHeader('VeriFactu', 'Cumplimiento y cola de envíos a AEAT');

  // Registros reales del tenant; los KPIs del panel se derivan de ellos (no hay
  // endpoint de estadísticas dedicado).
  const { data: records = [] } = useQuery({
    queryKey: ['verifactu-records'],
    queryFn: () => listVerifactuRecords(),
  });

  const now = new Date();
  const stats = summarizeVerifactu(records, now.toISOString().slice(0, 10));
  const operational = stats.failed === 0;

  return (
    <section className="catalog" data-testid="verifactu-page">
      <div className="vf-cards">
        <div className="vf-card" data-testid="vf-sent-card">
          <span className="vf-card-label">Registros enviados hoy</span>
          <span className="vf-card-value">{stats.sentToday}</span>
          <span className="vf-card-foot vf-up">▲ al día</span>
        </div>
        <div className="vf-card" data-testid="vf-queued-card">
          <span className="vf-card-label">En cola</span>
          <span className="vf-card-value">{stats.queued}</span>
          <span className="vf-card-foot">{stats.queued === 0 ? 'sin pendientes' : 'en cola'}</span>
        </div>
        <div className="vf-card" data-testid="vf-failed-card">
          <span className="vf-card-label">Fallidos</span>
          <span className="vf-card-value">{stats.failed}</span>
          <span className="vf-card-foot">{stats.failed === 0 ? '—' : 'requieren reintento'}</span>
        </div>
      </div>

      <div className="vf-connector" data-testid="vf-connector">
        <div>
          <p className="vf-connector-title">Estado del conector</p>
          <p className="vf-connector-sub">Proveedor homologado · sandbox AEAT</p>
        </div>
        <div className="vf-connector-status">
          <span className="vf-status-badge">
            <span className={`stock-dot ${operational ? 'stock-green' : 'stock-red'}`} />
            {operational ? 'Operativo' : 'Con incidencias'}
          </span>
          <span className="muted">
            Último envío {relativeFromNow(stats.lastSentAt, now.getTime())}
          </span>
        </div>
      </div>
    </section>
  );
}
