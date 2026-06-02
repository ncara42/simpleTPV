import { DEMO_VERIFACTU_STATS } from './demo/demoData.js';

export function VerifactuPage() {
  return (
    <section className="catalog" data-testid="verifactu-page">
      <header className="catalog-head">
        <div>
          <h2>VeriFactu</h2>
          <p className="catalog-sub">Cumplimiento y cola de envíos a AEAT</p>
        </div>
      </header>

      <div className="vf-cards">
        <div className="vf-card" data-testid="vf-sent-card">
          <span className="vf-card-label">Registros enviados hoy</span>
          <span className="vf-card-value">{DEMO_VERIFACTU_STATS.sentToday}</span>
          <span className="vf-card-foot vf-up">▲ al día</span>
        </div>
        <div className="vf-card" data-testid="vf-queued-card">
          <span className="vf-card-label">En cola</span>
          <span className="vf-card-value">{DEMO_VERIFACTU_STATS.queued}</span>
          <span className="vf-card-foot">sin pendientes</span>
        </div>
        <div className="vf-card" data-testid="vf-failed-card">
          <span className="vf-card-label">Fallidos</span>
          <span className="vf-card-value">{DEMO_VERIFACTU_STATS.failed}</span>
          <span className="vf-card-foot">—</span>
        </div>
      </div>

      <div className="vf-connector" data-testid="vf-connector">
        <div>
          <p className="vf-connector-title">Estado del conector</p>
          <p className="vf-connector-sub">Proveedor homologado · sandbox AEAT</p>
        </div>
        <div className="vf-connector-status">
          <span className="vf-status-badge">
            <span className="stock-dot stock-green" /> Operativo
          </span>
          <span className="muted">Último envío hace {DEMO_VERIFACTU_STATS.lastSentSeconds} s</span>
        </div>
      </div>
    </section>
  );
}
