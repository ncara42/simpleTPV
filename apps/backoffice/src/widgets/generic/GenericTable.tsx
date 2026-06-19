import { DataTable, type DataTableColumn } from '@simpletpv/ui';

import type { GenericSpec } from '../../lib/dashboard-layout.js';
import { textField, toRecords, useGenericData } from './useGenericData.js';

interface GenericTableProps {
  spec: GenericSpec;
}

type Row = Record<string, unknown>;

// Tabla parametrizable. `spec.fields` define las columnas a mostrar (en orden); si falta,
// se infieren de las claves del primer registro. Hace su propia query contra `spec.endpoint`.
export function GenericTable({ spec }: GenericTableProps) {
  const { data, isLoading, isError } = useGenericData(spec);
  const records = toRecords(data) as Row[];

  const fields =
    spec.fields && spec.fields.length > 0
      ? spec.fields
      : records.length > 0
        ? Object.keys(records[0]!)
        : [];

  const columns: DataTableColumn<Row>[] = fields.map((field) => ({
    key: field,
    header: field,
    render: (row) => textField(row, field),
  }));

  return (
    <div className="dash-generic dash-generic--table">
      <div className="dash-generic-title">{spec.title}</div>
      <DataTable
        columns={columns}
        rows={records}
        rowKey={(_row, index) => String(index)}
        loading={isLoading}
        emptyState={isError ? 'No se pudieron cargar los datos.' : 'Sin datos.'}
        data-testid="dash-generic-table"
      />
    </div>
  );
}
