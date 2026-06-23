/**
 * Contrato de diseño de SimpleTPV para el cliente que renderiza los datos del MCP.
 *
 * El MCP devuelve SOLO datos (JSON) y deja que el modelo COMPONGA la presentación
 * (layout, agrupación, elección de visualizaciones). Lo que viaja aquí —vía el
 * campo `instructions` del servidor MCP, que el host inyecta en el contexto del
 * modelo en el `initialize`— NO es estructura sino IDENTIDAD VISUAL: tokens de
 * color, radios, tipografía y reglas de superficie tomados de la fuente de verdad
 * del producto (`packages/ui/src/styles/theme.css`).
 *
 * Objetivo: que el widget conserve la forma de montar del modelo pero se vea "de
 * producto" (personalidad SimpleTPV) en lugar de genérico. Reemplaza al antiguo
 * panel `ui://` (iframe con el design system del backoffice), retirado para que la
 * UI la siga componiendo el modelo: aquí solo le damos la PIEL, no el esqueleto.
 *
 * Si cambian los tokens en `theme.css`, actualizar los hex de aquí para no derivar.
 */
export const DESIGN_SYSTEM_INSTRUCTIONS = `# SimpleTPV — sistema visual para presentar estos datos

Las herramientas de este servidor devuelven datos de un TPV (punto de venta) multitienda. Cuando los presentes de forma visual (tarjetas, gráficos, paneles), COMPÓN como mejor sepas —tú eliges el layout, la agrupación y qué visualización usar— pero VÍSTELO con la identidad de SimpleTPV definida abajo, para que el resultado parezca de producto y no genérico.

## Regla de oro: tu estructura, esta piel
Mantén tu forma de montar el widget. Lo único que cambia es el lenguaje visual: color, forma, tipografía y superficie. No alteres tu composición por seguir esto.

## Sin "hoja de papel"
- NO envuelvas el widget entero en una tarjeta o panel de fondo sólido. El contenedor exterior debe ser TRANSPARENTE y fundirse con el fondo del chat; las piezas (KPIs, gráficos) flotan directamente.
- Una tarjeta individual (p. ej. un KPI) puede tener superficie propia, pero defínela con HAIRLINE (borde de 1px), no con sombras. Evita sombras marcadas, degradados llamativos y fondos saturados.

## Color (usa estos valores exactos)
- Superficies: lienzo \`#f6f6f4\`; tarjeta/superficie \`#ffffff\`; sutil \`#f4f4f2\`.
- Líneas (hairline): \`#e6e5e0\`; marcada \`#d8d6cf\`.
- Texto: principal \`#18181a\`; atenuado \`#6b6b66\`; suave/etiquetas \`#71706c\`.
- Acento de datos (el color "de marca" en gráficos): ÍNDIGO \`#635bff\` (fuerte \`#4f46e5\`; tinte 8% \`#635bff14\`). Es el color primario de barras y líneas. NO uses verde como color por defecto de los gráficos.
- Semánticos, SOLO por significado: positivo/sube \`#16734f\`; negativo/baja \`#c0392b\`; aviso \`#b45309\`. Cada uno con su versión tenue para fondos de píldora.
- Paleta categórica (series múltiples o barras apiladas, en este orden): \`#635bff\`, \`#0ea5e9\`, \`#f59e0b\`, \`#8b5cf6\`, \`#ec4899\`, \`#10b981\`, \`#f43f5e\`, \`#64748b\`.
- Tooltip: fondo \`#0a2540\`, texto \`#ffffff\`.

## Forma (border-radius)
- Tarjetas y paneles: \`12px\`. Inputs y botones: \`8px\`. Píldoras y badges: \`999px\` (totalmente redondas).

## Tipografía
- Familia: "SF Pro Text", system-ui, sans-serif. Activa números tabulares (\`font-variant-numeric: tabular-nums\`) en TODA cifra.
- Cifra KPI: grande, peso 600, tracking ligeramente negativo (\`-0.02em\`). Su etiqueta encima: pequeña, en MAYÚSCULAS, peso 600, color suave, \`letter-spacing: 0.04em\`.
- Título de sección: ~17px, peso 600.

## Gráficos (los tuyos, recoloreados a esta paleta)
- Comparar categorías → barras horizontales (máx. ~8). Ranking → barras con dos pistas: relleno índigo sobre una pista tenue de fondo.
- Proporción de un total → donut SOLO si hay ≤6 partes; con más, usa barras.
- Evolución temporal → línea o área en índigo.
- Variación frente a un periodo anterior → píldora con flecha: ▲ verde si sube, ▼ rojo si baja, ≈ gris si estable; el fondo de la píldora es el tinte tenue de ese mismo color.
- Un KPI suelto (importe, margen %) va en un tile numérico o un medidor de progreso, nunca como un gráfico.

## Espaciado
- Escala base de 4px. Padding cómodo de tarjeta 16–20px; aire entre secciones ~24px. Busca ritmo, no el mismo padding en todo.

En una frase: tu composición + esta piel. Índigo como acento, verde/rojo solo para el signo, hairlines en vez de sombras, sin fondo blanco envolviendo el widget, y tipografía SF con números tabulares.`;
