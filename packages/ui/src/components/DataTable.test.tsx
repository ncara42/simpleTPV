import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { DataTable, type DataTableColumn } from './DataTable.js';

interface Sale {
  id: string;
  ticket: string;
  total: number;
}

const columns: DataTableColumn<Sale>[] = [
  { key: 'ticket', header: 'Ticket', sortable: true },
  { key: 'total', header: 'Total', align: 'right', render: (r) => `${r.total.toFixed(2)} €` },
];

const rows: Sale[] = [
  { id: 'a', ticket: 'T01-000001', total: 24.9 },
  { id: 'b', ticket: 'T01-000002', total: 73.8 },
];

describe('DataTable', () => {
  it('renders headers and rows (con render y valor por defecto)', () => {
    render(<DataTable columns={columns} rows={rows} rowKey={(r) => r.id} />);
    expect(screen.getByRole('columnheader', { name: /Ticket/ })).toBeInTheDocument();
    expect(screen.getAllByTestId('ui-dt-row')).toHaveLength(2);
    expect(screen.getByText('T01-000001')).toBeInTheDocument();
    expect(screen.getByText('24.90 €')).toBeInTheDocument();
  });

  it('muestra el estado vacío cuando no hay filas', () => {
    render(
      <DataTable columns={columns} rows={[]} rowKey={(r) => r.id} emptyState="No hay ventas" />,
    );
    expect(screen.getByText('No hay ventas')).toBeInTheDocument();
    expect(screen.queryAllByTestId('ui-dt-row')).toHaveLength(0);
  });

  it('en carga muestra skeleton, no filas de datos', () => {
    render(<DataTable columns={columns} rows={rows} rowKey={(r) => r.id} loading />);
    expect(screen.queryAllByTestId('ui-dt-row')).toHaveLength(0);
  });

  it('una cabecera ordenable emite onSortChange y refleja aria-sort', () => {
    const onSortChange = vi.fn();
    render(
      <DataTable
        columns={columns}
        rows={rows}
        rowKey={(r) => r.id}
        sort={{ key: 'ticket', dir: 'asc' }}
        onSortChange={onSortChange}
      />,
    );
    const header = screen.getByRole('columnheader', { name: /Ticket/ });
    expect(header).toHaveAttribute('aria-sort', 'ascending');
    fireEvent.click(screen.getByRole('button', { name: /Ticket/ }));
    expect(onSortChange).toHaveBeenCalledWith('ticket');
  });

  it('paginador: navega y respeta los límites', () => {
    const onPageChange = vi.fn();
    render(
      <DataTable
        columns={columns}
        rows={rows}
        rowKey={(r) => r.id}
        pagination={{ page: 1, pageSize: 2, totalItems: 5, onPageChange }}
      />,
    );
    expect(screen.getByText('1–2 de 5')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Página anterior' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Página siguiente' }));
    expect(onPageChange).toHaveBeenCalledWith(2);
  });
});
