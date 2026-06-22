// Etiquetas legibles para los chips de tool-call del chat. Mapea el nombre técnico
// de cada tool a una frase en pasado ("Consultó ventas del mes"). Si llega una tool
// desconocida, se devuelve el nombre crudo como fallback.

const TOOL_LABELS: Record<string, string> = {
  // Consultas de datos
  sales_kpis: 'Consultó los KPIs de ventas',
  sales_by_hour: 'Consultó las ventas por hora',
  sales_by_family: 'Consultó las ventas por familia',
  product_rankings: 'Consultó el ranking de productos',
  stock_alerts: 'Revisó las alertas de stock',
  purchase_orders: 'Consultó los pedidos de compra',
  sales_by_employee: 'Consultó las ventas por empleado',
  time_clock_today: 'Consultó el control horario de hoy',
  stores_list: 'Consultó la lista de tiendas',
  users_list: 'Consultó la lista de usuarios',
  supplier_prices_comparison: 'Comparó precios de proveedores',
  // Operaciones de lienzo
  add_widget: 'Añadió un widget',
  add_shape: 'Añadió una forma',
  add_text: 'Añadió un texto',
  add_note: 'Añadió una nota',
  add_insight: 'Añadió un análisis',
  remove_element: 'Eliminó un elemento',
  arrange: 'Reordenó el lienzo',
  clear_canvas: 'Vació el lienzo',
  // Acciones de pantalla (fuera del dashboard)
  highlight_on_view: 'Resaltó un elemento en pantalla',
  filter_view: 'Filtró el listado',
};

export function toolLabel(name: string): string {
  return TOOL_LABELS[name] ?? name;
}
