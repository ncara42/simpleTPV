// Etiquetas legibles para los pasos de la cadena de pensamiento del chat. Mapea el nombre
// técnico de cada tool a una frase en pasado ("Consultó las ventas por hora"). Si llega una
// tool no mapeada, se devuelve un texto GENÉRICO: NUNCA el nombre técnico crudo, para no
// filtrar identificadores internos del código al usuario.

const TOOL_LABELS: Record<string, string> = {
  // ── Consultas de datos ──
  sales_kpis: 'Consultó los KPIs de ventas',
  margin_kpis: 'Consultó los márgenes',
  stockout_kpis: 'Consultó las roturas de stock',
  sales_by_hour: 'Consultó las ventas por hora',
  sales_by_family: 'Consultó las ventas por familia',
  sales_by_store: 'Consultó las ventas por tienda',
  sales_by_employee: 'Consultó las ventas por empleado',
  discount_by_employee: 'Revisó los descuentos por empleado',
  product_rankings: 'Consultó el ranking de productos',
  product_rotation: 'Analizó la rotación de productos',
  archetype_rotation: 'Analizó la rotación por categoría',
  stock_alerts: 'Revisó las alertas de stock',
  stock_global: 'Consultó el inventario global',
  stock_by_store: 'Consultó el inventario por tienda',
  stock_expiring: 'Revisó los lotes por caducar',
  stock_to_reorder: 'Revisó los productos a reponer',
  stock_movements: 'Revisó los movimientos de stock',
  products: 'Consultó el catálogo de productos',
  product_families: 'Consultó las familias de producto',
  stores_list: 'Consultó la lista de tiendas',
  users_list: 'Consultó el equipo',
  suppliers: 'Consultó los proveedores',
  supplier_prices_comparison: 'Comparó precios de proveedores',
  promotions: 'Consultó las promociones',
  purchase_orders: 'Consultó los pedidos de compra',
  transfers: 'Consultó los traspasos',
  wholesale_orders: 'Consultó los pedidos mayoristas',
  customers: 'Consultó los clientes',
  cash_sessions: 'Consultó las sesiones de caja',
  z_report: 'Consultó el informe Z',
  returns: 'Consultó las devoluciones',
  time_clock_today: 'Consultó el control horario de hoy',
  time_clock_history: 'Consultó el histórico de fichajes',
  // ── Operaciones de lienzo ──
  add_widget: 'Añadió un widget',
  add_shape: 'Añadió una forma',
  add_text: 'Añadió un texto',
  add_note: 'Añadió una nota',
  add_insight: 'Añadió un análisis',
  remove_element: 'Eliminó un elemento',
  arrange: 'Reordenó el lienzo',
  clear_canvas: 'Vació el lienzo',
  // ── Acciones sobre la vista ──
  highlight_on_view: 'Resaltó un elemento en pantalla',
  filter_view: 'Filtró la vista',
};

/** Texto humano de un paso. Para tools no mapeadas devuelve un genérico (jamás el nombre crudo). */
export function toolLabel(name: string): string {
  return TOOL_LABELS[name] ?? 'Consultó datos';
}
