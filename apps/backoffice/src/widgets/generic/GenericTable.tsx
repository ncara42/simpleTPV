import { DataGrid, type DataGridColumn } from '@simpletpv/ui';

import type { GenericSpec } from '../../lib/dashboard-layout.js';
import { toRecords, useGenericData } from './useGenericData.js';

interface GenericTableProps {
  spec: GenericSpec;
}

type Row = Record<string, unknown>;

// Tabla parametrizable: delega en la molécula DataGrid (cabeceras + alineación + zebra + estados
// horneados). `spec.fields` define las columnas (en orden); si falta, se infieren de las claves del
// primer registro. Conserva el contrato del agente (type:'table' + fields) — F2 (#203) mejora el
// diseño SIN tocar el DSL. La capa de datos (useGenericData) vive aquí; la molécula es presentacional.
export function GenericTable({ spec }: GenericTableProps) {
  const { data, isLoading, isError } = useGenericData(spec);
  const records = toRecords(data) as Row[];

  const fields =
    spec.fields && spec.fields.length > 0
      ? spec.fields
      : records.length > 0
        ? Object.keys(records[0]!)
        : [];

  const columns: DataGridColumn[] = fields.map((field) => ({ key: field, header: field }));

  return (
    <div className="dash-generic dash-generic--table" data-testid="dash-generic-table">
      <DataGrid
        title={spec.title}
        columns={columns}
        rows={records}
        isLoading={isLoading}
        isError={isError}
      />
    </div>
  );
}
