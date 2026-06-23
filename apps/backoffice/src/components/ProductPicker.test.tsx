import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { Product } from '../lib/products.js';
import { ProductPicker } from './ProductPicker';

// Mock listProducts
vi.mock('../lib/products', () => ({
  listProducts: vi.fn(),
}));

import { listProducts } from '../lib/products.js';

const mockProducts: Product[] = [
  {
    id: '1',
    name: 'Producto A',
    sku: 'SKU-001',
    barcode: 'EAN001',
    description: 'Desc A',
    salePrice: '10.00',
    costPrice: '5.00',
    taxRate: '21',
    saleUnit: 'unit',
    unitSymbol: 'ud',
    familyId: 'fam1',
    active: true,
  },
  {
    id: '2',
    name: 'Producto B',
    sku: 'SKU-002',
    barcode: null,
    description: 'Desc B',
    salePrice: '20.00',
    costPrice: '10.00',
    taxRate: '21',
    saleUnit: 'unit',
    unitSymbol: 'ud',
    familyId: 'fam1',
    active: true,
  },
  {
    id: '3',
    name: 'Especial',
    sku: 'SPECIAL-1',
    barcode: 'EAN003',
    description: 'Special product',
    salePrice: '15.00',
    costPrice: '7.50',
    taxRate: '21',
    saleUnit: 'unit',
    unitSymbol: 'ud',
    familyId: 'fam1',
    active: true,
  },
];

describe('ProductPicker', () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
      },
    });
    vi.mocked(listProducts).mockResolvedValue(mockProducts);
  });

  const renderPicker = (props: Parameters<typeof ProductPicker>[0]) => {
    return render(
      <QueryClientProvider client={queryClient}>
        <ProductPicker {...props} />
      </QueryClientProvider>,
    );
  };

  it('renders with placeholder text', () => {
    renderPicker({
      value: null,
      onChange: vi.fn(),
    });
    expect(screen.getByPlaceholderText(/Busca por nombre/)).toBeInTheDocument();
  });

  it('filters products by name', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    renderPicker({ value: null, onChange });

    const input = screen.getByTestId('product-picker-input');
    await user.type(input, 'Producto A');

    await waitFor(() => {
      expect(screen.getByText('Producto A')).toBeInTheDocument();
    });
  });

  it('filters products by SKU', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    renderPicker({ value: null, onChange });

    const input = screen.getByTestId('product-picker-input');
    await user.type(input, 'SKU-001');

    await waitFor(() => {
      expect(screen.getByText('SKU: SKU-001')).toBeInTheDocument();
    });
  });

  it('filters products by barcode', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    renderPicker({ value: null, onChange });

    const input = screen.getByTestId('product-picker-input');
    await user.type(input, 'EAN001');

    await waitFor(() => {
      expect(screen.getByText('EAN: EAN001')).toBeInTheDocument();
    });
  });

  it('excludes products from excludeIds', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    renderPicker({
      value: null,
      onChange,
      excludeIds: ['1'],
    });

    const input = screen.getByTestId('product-picker-input');
    await user.click(input);

    await waitFor(() => {
      expect(screen.queryByText('Producto A')).not.toBeInTheDocument();
      expect(screen.getByText('Producto B')).toBeInTheDocument();
    });
  });

  it('calls onChange when product is selected', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    renderPicker({ value: null, onChange });

    const input = screen.getByTestId('product-picker-input');
    await user.click(input);

    await waitFor(() => {
      const option = screen.getAllByTestId('product-picker-option')[0];
      expect(option).toBeInTheDocument();
    });

    const option = screen.getAllByTestId('product-picker-option')[0];
    await user.click(option!);

    expect(onChange).toHaveBeenCalledWith('1');
  });

  it('shows selected product name in input', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    const { rerender } = renderPicker({
      value: null,
      onChange,
    });

    const input = screen.getByTestId('product-picker-input');
    await user.click(input);

    await waitFor(() => {
      const option = screen.getAllByTestId('product-picker-option')[0];
      expect(option).toBeInTheDocument();
    });

    const option = screen.getAllByTestId('product-picker-option')[0];
    await user.click(option!);

    // Re-render with new value
    rerender(
      <QueryClientProvider client={queryClient}>
        <ProductPicker value="1" onChange={onChange} />
      </QueryClientProvider>,
    );

    await waitFor(() => {
      expect(screen.getByDisplayValue('Producto A')).toBeInTheDocument();
    });
  });

  it('clears selection when clear button is clicked', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    const { rerender } = renderPicker({
      value: '1',
      onChange,
    });

    await waitFor(() => {
      expect(screen.getByDisplayValue('Producto A')).toBeInTheDocument();
    });

    // Verificar que existe el botón de limpiar
    const clearButton = screen.getByRole('button', { name: /Limpiar selección/ });
    await user.click(clearButton);

    expect(onChange).toHaveBeenCalledWith(null);
  });
});
