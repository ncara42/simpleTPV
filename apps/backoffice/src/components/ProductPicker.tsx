import './ProductPicker.css';

import { Input } from '@simpletpv/ui';
import { useQuery } from '@tanstack/react-query';
import { useEffect, useMemo, useRef, useState } from 'react';

import { listProducts } from '../lib/products.js';

type Props = {
  value: string | null;
  onChange: (id: string | null) => void;
  excludeIds?: string[];
  placeholder?: string;
};

const DEBOUNCE_MS = 300;

/**
 * ProductPicker: componente reutilizable de búsqueda y selección de productos.
 *
 * Permite buscar por nombre, SKU y código de barras (EAN) con debounce.
 * Filtra productos excluidos si se especifican.
 * Muestra para cada resultado el nombre + referencia cuando existe.
 *
 * Accesible mediante testids: product-picker, product-picker-input, product-picker-option.
 */
export function ProductPicker({ value, onChange, excludeIds = [], placeholder }: Props) {
  const [searchTerm, setSearchTerm] = useState('');
  const [isOpen, setIsOpen] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const inputRef = useRef<HTMLInputElement>(null);
  const optionsRef = useRef<HTMLDivElement>(null);

  // Debounce del término de búsqueda para no saturar la API.
  const [debouncedTerm, setDebouncedTerm] = useState(searchTerm);

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedTerm(searchTerm);
    }, DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [searchTerm]);

  // Fetch de productos con el término debounced.
  const { data: products = [] } = useQuery({
    queryKey: ['products', debouncedTerm],
    queryFn: () => listProducts(debouncedTerm),
  });

  // Filtrar excluidos.
  const excludedSet = useMemo(() => new Set(excludeIds), [excludeIds]);
  const filteredProducts = useMemo(
    () => products.filter((p) => !excludedSet.has(p.id)),
    [products, excludedSet],
  );

  // Encontrar el producto seleccionado actual.
  const selectedProduct = useMemo(
    () => (value ? products.find((p) => p.id === value) : null),
    [value, products],
  );

  // Cuando seleccionar un producto, cerrar el menú y limpiar búsqueda.
  const handleSelect = (productId: string) => {
    onChange(productId);
    setSearchTerm('');
    setIsOpen(false);
    setHighlightedIndex(-1);
  };

  // Limpiar selección (click en X o valor null explícitamente).
  const handleClear = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    onChange(null);
    setSearchTerm('');
    setIsOpen(false);
    inputRef.current?.focus();
  };

  // Navegación con teclado.
  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!isOpen && (e.key === 'ArrowDown' || e.key === 'Enter')) {
      setIsOpen(true);
      return;
    }

    if (!isOpen) return;

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setHighlightedIndex((prev) => (prev < filteredProducts.length - 1 ? prev + 1 : prev));
        break;
      case 'ArrowUp':
        e.preventDefault();
        setHighlightedIndex((prev) => (prev > 0 ? prev - 1 : -1));
        break;
      case 'Enter':
        e.preventDefault();
        if (highlightedIndex >= 0) {
          handleSelect(filteredProducts[highlightedIndex]!.id);
        }
        break;
      case 'Escape':
        e.preventDefault();
        setIsOpen(false);
        setHighlightedIndex(-1);
        break;
    }
  };

  // Cerrar al hacer click fuera.
  useEffect(() => {
    if (!isOpen) return;

    const handleClickOutside = (e: MouseEvent) => {
      if (
        inputRef.current &&
        !inputRef.current.contains(e.target as Node) &&
        optionsRef.current &&
        !optionsRef.current.contains(e.target as Node)
      ) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen]);

  return (
    <div className="product-picker" data-testid="product-picker">
      <div className="product-picker-input-wrapper">
        <Input
          ref={inputRef}
          type="text"
          placeholder={placeholder ?? 'Busca por nombre, SKU o código de barras…'}
          value={value && selectedProduct ? selectedProduct.name : searchTerm}
          onChange={(e) => {
            setSearchTerm(e.target.value);
            setIsOpen(true);
            setHighlightedIndex(-1);
          }}
          onKeyDown={handleKeyDown}
          onFocus={() => {
            if (!value) {
              setIsOpen(true);
            }
          }}
          data-testid="product-picker-input"
          aria-autocomplete="list"
          aria-expanded={isOpen}
          aria-controls="product-picker-options"
          role="combobox"
        />
        {value && (
          <button
            type="button"
            className="product-picker-clear"
            onClick={handleClear}
            aria-label="Limpiar selección"
            title="Limpiar"
          >
            ✕
          </button>
        )}
      </div>

      {isOpen && filteredProducts.length > 0 && (
        <div
          ref={optionsRef}
          className="product-picker-options"
          id="product-picker-options"
          role="listbox"
        >
          {filteredProducts.map((product, idx) => (
            <div
              key={product.id}
              className={`product-picker-option ${highlightedIndex === idx ? 'highlighted' : ''}`}
              onClick={() => handleSelect(product.id)}
              onMouseEnter={() => setHighlightedIndex(idx)}
              role="option"
              aria-selected={product.id === value}
              data-testid="product-picker-option"
            >
              <div className="product-picker-option-name">{product.name}</div>
              {(product.sku || product.barcode) && (
                <div className="product-picker-option-reference">
                  {product.sku && <span className="sku">SKU: {product.sku}</span>}
                  {product.barcode && <span className="barcode">EAN: {product.barcode}</span>}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {isOpen && debouncedTerm && filteredProducts.length === 0 && (
        <div className="product-picker-empty">Sin resultados para "{debouncedTerm}"</div>
      )}
    </div>
  );
}
