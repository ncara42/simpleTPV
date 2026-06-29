import { Button, Input, Select, usePageHeader } from '@simpletpv/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, ShieldCheck } from 'lucide-react';
import { useEffect, useState } from 'react';

import { formErrorMessage } from './lib/form-error.js';
import {
  type ChainReport,
  daysUntilDeadline,
  getVerifactuCertStatus,
  getVerifactuConfig,
  listVerifactuRecords,
  putVerifactuCertificate,
  putVerifactuConfig,
  summarizeVerifactu,
  type VerifactuConfigInput,
  verifactuDeadline,
  type VerifactuEnvironment,
  type VerifactuMode,
  type VerifactuObligadoTipo,
  verifyVerifactuChain,
} from './lib/verifactu.js';

const MODE_OPTIONS = [
  { value: 'DISABLED', label: 'Desactivado' },
  { value: 'ASSISTED', label: 'Asistido (exporto y presento manualmente)' },
  { value: 'DIRECT_OWN_CERT', label: 'Directo con mi certificado' },
  { value: 'COLLAB_SOCIAL', label: 'Colaboración social (el proveedor envía por mí)' },
];
const OBLIGADO_OPTIONS = [
  { value: 'OTHERS', label: 'Autónomo / otros (IRPF) — desde 1-jul-2027' },
  { value: 'IS', label: 'Sociedad (Impuesto de Sociedades) — desde 1-ene-2027' },
];
const ENV_OPTIONS = [
  { value: 'preprod', label: 'Preproducción (pruebas AEAT)' },
  { value: 'prod', label: 'Producción' },
];

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
  const qc = useQueryClient();

  const { data: records = [] } = useQuery({
    queryKey: ['verifactu-records'],
    queryFn: () => listVerifactuRecords(),
  });
  const { data: config } = useQuery({
    queryKey: ['verifactu-config'],
    queryFn: getVerifactuConfig,
  });
  const { data: certStatus } = useQuery({
    queryKey: ['verifactu-cert'],
    queryFn: getVerifactuCertStatus,
  });

  const [mode, setMode] = useState<VerifactuMode>('DISABLED');
  const [razonSocial, setRazonSocial] = useState('');
  const [obligadoTipo, setObligadoTipo] = useState<VerifactuObligadoTipo>('OTHERS');
  const [exento, setExento] = useState(false);
  const [exentoMotivo, setExentoMotivo] = useState('');
  const [environment, setEnvironment] = useState<VerifactuEnvironment>('preprod');
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);
  const [pem, setPem] = useState('');
  const [report, setReport] = useState<ChainReport | null>(null);

  // Sincroniza el formulario cuando llega (o cambia) la config persistida.
  useEffect(() => {
    if (!config) return;
    setMode(config.mode);
    setRazonSocial(config.razonSocial ?? '');
    setObligadoTipo(config.obligadoTipo ?? 'OTHERS');
    setExento(config.exento);
    setExentoMotivo(config.exentoMotivo ?? '');
    setEnvironment(config.environment);
  }, [config]);

  const now = new Date();
  const stats = summarizeVerifactu(records, now.toISOString().slice(0, 10));
  const operational = stats.failed === 0;
  const days = daysUntilDeadline(obligadoTipo, now.toISOString().slice(0, 10));

  const saveConfig = useMutation({
    mutationFn: () => {
      const input: VerifactuConfigInput = {
        mode,
        razonSocial: razonSocial.trim() || null,
        obligadoTipo,
        exento,
        exentoMotivo: exentoMotivo.trim() || null,
        environment,
      };
      return putVerifactuConfig(input);
    },
    onSuccess: () => {
      setError('');
      setSaved(true);
      void qc.invalidateQueries({ queryKey: ['verifactu-config'] });
    },
    onError: (e) => {
      setSaved(false);
      setError(formErrorMessage(e, 'No se pudo guardar la configuración.'));
    },
  });

  const verify = useMutation({
    mutationFn: verifyVerifactuChain,
    onSuccess: (r) => setReport(r),
    onError: (e) => setError(formErrorMessage(e, 'No se pudo verificar la cadena.')),
  });

  const uploadCert = useMutation({
    mutationFn: () => putVerifactuCertificate(pem),
    onSuccess: () => {
      setPem('');
      setError('');
      void qc.invalidateQueries({ queryKey: ['verifactu-cert'] });
    },
    onError: (e) => setError(formErrorMessage(e, 'No se pudo guardar el certificado.')),
  });

  return (
    <section className="catalog" data-testid="verifactu-page">
      {/* Aviso de plazo: cuenta atrás hasta la entrada en vigor de la obligación. */}
      {!exento && (
        <p
          className={days <= 90 ? 'settings-warning' : 'settings-success'}
          role="status"
          data-testid="vf-plazo"
        >
          {days > 0
            ? `Faltan ${days} días para tu obligación VERI*FACTU (${verifactuDeadline(obligadoTipo)}).`
            : `La obligación VERI*FACTU ya está vigente desde ${verifactuDeadline(obligadoTipo)}.`}
        </p>
      )}

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
          <p className="vf-connector-sub">
            Modalidad {MODE_OPTIONS.find((o) => o.value === mode)?.label ?? mode} ·{' '}
            {environment === 'prod' ? 'producción' : 'preproducción'}
          </p>
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

      {/* Configuración del cumplimiento. */}
      <div className="help-section">
        <div className="help-section-head">
          <h3 className="help-title">
            <ShieldCheck size={18} aria-hidden="true" /> Configuración
          </h3>
          <p className="help-intro">
            Define cómo cumples con VERI*FACTU. En «Colaboración social» nosotros enviamos por ti;
            en «Directo» usas tu propio certificado; en «Asistido» exportas y presentas tú.
          </p>
        </div>

        <div className="settings-grid">
          <div className="settings-field">
            <label htmlFor="vf-mode">Modalidad</label>
            <Select
              ariaLabel="Modalidad de cumplimiento"
              value={mode}
              onChange={(v) => {
                setMode(v as VerifactuMode);
                setSaved(false);
              }}
              options={MODE_OPTIONS}
              data-testid="vf-mode"
            />
          </div>
          <div className="settings-field">
            <label htmlFor="vf-razon">Razón social (obligado)</label>
            <Input
              id="vf-razon"
              type="text"
              value={razonSocial}
              maxLength={120}
              placeholder="Nombre fiscal del comercio"
              onChange={(e) => {
                setRazonSocial(e.target.value);
                setSaved(false);
              }}
              data-testid="vf-razon"
            />
          </div>
          <div className="settings-field">
            <label htmlFor="vf-obligado">Tipo de obligado</label>
            <Select
              ariaLabel="Tipo de obligado"
              value={obligadoTipo}
              onChange={(v) => {
                setObligadoTipo(v as VerifactuObligadoTipo);
                setSaved(false);
              }}
              options={OBLIGADO_OPTIONS}
              data-testid="vf-obligado"
            />
          </div>
          <div className="settings-field">
            <label htmlFor="vf-env">Entorno AEAT</label>
            <Select
              ariaLabel="Entorno AEAT"
              value={environment}
              onChange={(v) => {
                setEnvironment(v as VerifactuEnvironment);
                setSaved(false);
              }}
              options={ENV_OPTIONS}
              data-testid="vf-env"
            />
          </div>
        </div>

        <label className="settings-check-row">
          <input
            type="checkbox"
            checked={exento}
            onChange={(e) => {
              setExento(e.target.checked);
              setSaved(false);
            }}
            data-testid="vf-exento"
          />
          <span>
            Estoy fuera del ámbito de VERI*FACTU (SII, foral o facturación no informatizada)
          </span>
        </label>
        {exento && (
          <div className="settings-field">
            <label htmlFor="vf-exento-motivo">Motivo de la exención</label>
            <Input
              id="vf-exento-motivo"
              type="text"
              value={exentoMotivo}
              maxLength={200}
              onChange={(e) => {
                setExentoMotivo(e.target.value);
                setSaved(false);
              }}
              data-testid="vf-exento-motivo"
            />
          </div>
        )}

        {error && (
          <p className="settings-error" data-testid="vf-error">
            {error}
          </p>
        )}
        <div className="settings-actions">
          <Button
            icon={<Check size={16} />}
            onClick={() => saveConfig.mutate()}
            disabled={saveConfig.isPending}
            data-testid="vf-save"
          >
            {saveConfig.isPending ? 'Guardando…' : saved ? 'Guardado ✓' : 'Guardar configuración'}
          </Button>
        </div>
      </div>

      {/* Certificado de cliente (solo modo directo). */}
      {mode === 'DIRECT_OWN_CERT' && (
        <div className="help-section" data-testid="vf-cert-section">
          <div className="help-section-head">
            <h3 className="help-title">Certificado de cliente</h3>
            <p className="help-intro">
              Pega tu certificado en formato PEM (certificado + clave privada). Se cifra en el
              servidor y nunca se vuelve a mostrar. Convierte tu .p12/.pfx a PEM si hace falta.
            </p>
          </div>
          {certStatus ? (
            <p className="muted" data-testid="vf-cert-status">
              Certificado cargado{certStatus.subject ? ` · ${certStatus.subject}` : ''} (desde{' '}
              {certStatus.createdAt.slice(0, 10)}).
            </p>
          ) : (
            <p className="muted" data-testid="vf-cert-status">
              Sin certificado cargado.
            </p>
          )}
          <textarea
            className="settings-textarea"
            rows={6}
            value={pem}
            placeholder="-----BEGIN PRIVATE KEY-----…-----END CERTIFICATE-----"
            onChange={(e) => setPem(e.target.value)}
            data-testid="vf-cert-pem"
          />
          <div className="settings-actions">
            <Button
              onClick={() => uploadCert.mutate()}
              disabled={!pem.trim() || uploadCert.isPending}
              data-testid="vf-cert-save"
            >
              {uploadCert.isPending ? 'Guardando…' : 'Guardar certificado'}
            </Button>
          </div>
        </div>
      )}

      {/* Verificación de la cadena de huellas. */}
      <div className="help-section">
        <div className="help-section-head">
          <h3 className="help-title">Integridad de la cadena</h3>
          <p className="help-intro">
            Recomputa todas las huellas SHA-256 y verifica el encadenamiento (inalterabilidad).
          </p>
        </div>
        <div className="settings-actions">
          <Button
            variant="ghost"
            onClick={() => verify.mutate()}
            disabled={verify.isPending}
            data-testid="vf-verify"
          >
            {verify.isPending ? 'Verificando…' : 'Verificar cadena'}
          </Button>
        </div>
        {report && (
          <p
            className={report.ok ? 'settings-success' : 'settings-error'}
            role="status"
            data-testid="vf-verify-report"
          >
            {report.ok
              ? `Cadena íntegra: ${report.total} registros verificados.`
              : `Cadena rota en ${report.brokenAt ?? '—'}: ${report.detail ?? 'fallo de integridad'}.`}
          </p>
        )}
      </div>

      {/* Declaración responsable del software (RD 1007/2023, art. 13). */}
      <div className="help-section" data-testid="vf-declaracion">
        <div className="help-section-head">
          <h3 className="help-title">Declaración responsable</h3>
          <p className="help-intro">
            Este sistema informático de facturación genera registros VERI*FACTU con huella SHA-256
            encadenada e inalterable y los remite a la AEAT de forma continua, conforme al RD
            1007/2023 y la Orden HAC/1177/2024. Cada documento incluye el QR de cotejo y la leyenda
            «VERI*FACTU».
          </p>
        </div>
      </div>
    </section>
  );
}
