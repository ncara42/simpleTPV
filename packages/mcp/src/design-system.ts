/**
 * Contrato de diseño de SimpleTPV para el cliente que renderiza los datos del MCP.
 *
 * El MCP devuelve SOLO datos (JSON) y deja que el modelo COMPONGA la presentación
 * (layout, agrupación, elección de visualizaciones). Lo que viaja aquí —vía el
 * campo `instructions` del servidor MCP, que el host inyecta en el contexto del
 * modelo en el `initialize`— cubre dos cosas:
 *
 *  1. ENTREGA: cómo materializar la vista en el cliente. En claude.ai el modelo
 *     construye un ARTEFACTO; debe INCRUSTAR en él los datos que ya recibió de las
 *     tools y NO hacer peticiones de red en runtime. El sandbox de artefactos NO
 *     puede alcanzar la API del TPV (sin token de la sesión OAuth, CORS), así que
 *     un artefacto que haga `fetch` "en tiempo real" se rompe con «Load failed»
 *     —exactamente el bug que esta sección previene—. Los datos ya están en contexto.
 *  2. IDENTIDAD VISUAL: tokens de color, radios, tipografía y reglas de superficie
 *     tomados de la fuente de verdad del producto (`packages/ui/src/styles/theme.css`).
 *
 * Objetivo: que el widget conserve la forma de montar del modelo pero se vea "de
 * producto" (personalidad SimpleTPV) en lugar de genérico. Reemplaza al antiguo
 * panel `ui://` (iframe con el design system del backoffice), retirado para que la
 * UI la siga componiendo el modelo: aquí le damos la ENTREGA y la PIEL, no el esqueleto.
 *
 * Si cambian los tokens en `theme.css`, actualizar los hex de aquí para no derivar.
 */
export const DESIGN_SYSTEM_INSTRUCTIONS = `# SimpleTPV — cómo presentar estos datos

Las herramientas de este servidor devuelven datos de un TPV (punto de venta) multitienda. Tu trabajo es PRESENTARLOS, no describirlos: cuando el usuario pregunte por el estado del negocio ("cómo va mi empresa", "cómo va el mes", un resumen o un informe), construye una vista visual con las cifras CONCRETAS que te han devuelto las herramientas.

## Cómo entregar (CRÍTICO — léelo antes de montar nada)
1. **Usa los datos que YA tienes.** Las tools te han devuelto los números en el resultado de la llamada (p. ej. \`get_company_overview\`, \`get_sales_breakdown\`). Esos valores son tu fuente: van DENTRO de lo que construyas.
2. **Artefacto autocontenido con los datos incrustados.** En claude.ai/Desktop, presenta el resumen como UN artefacto (React). Escribe los datos como literales en el propio código (un \`const\` con las cifras que recibiste). El artefacto debe pintarse él solo, sin nada externo.
3. **NUNCA hagas peticiones de red desde el artefacto.** Nada de \`fetch\`, \`XMLHttpRequest\`, \`axios\` ni "cargar en tiempo real" desde la API, \`localhost\` o cualquier URL del TPV. El artefacto corre en un sandbox SIN acceso a tu API ni a tu sesión: cualquier petición falla con «Load failed» y el panel sale roto. No hay datos en vivo; trabajas con la foto que ya tienes en contexto.
4. **Solo dependencias del sandbox.** React y \`recharts\` para los gráficos (vienen incluidos), e iconos de \`lucide-react\` si hace falta. No importes de CDNs externos.
5. **Si no puedes crear artefacto** (p. ej. móvil), presenta las KPIs y cortes clave en el propio chat (texto/tablas). Nunca respondas solo "el dashboard carga los datos": SIEMPRE muestra las cifras.

## Regla de oro: tu estructura, esta piel
Tú eliges layout, agrupación y qué visualización usar; ese esqueleto es tuyo. Lo único no negociable es el lenguaje visual de abajo: color, forma, tipografía y superficie. No alteres tu composición por seguir esto, solo vístela.

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

## Gráficos (recharts, recoloreados a esta paleta)
- Construye los gráficos con \`recharts\`; aplica los hex de abajo a \`fill\`/\`stroke\`. Nada de imágenes ni iframes externos.
- Comparar categorías → barras horizontales (máx. ~8). Ranking → barras con dos pistas: relleno índigo sobre una pista tenue de fondo.
- Proporción de un total → donut SOLO si hay ≤6 partes; con más, usa barras.
- Evolución temporal → línea o área en índigo.
- Variación frente a un periodo anterior → píldora con flecha: ▲ verde si sube, ▼ rojo si baja, ≈ gris si estable; el fondo de la píldora es el tinte tenue de ese mismo color.
- Un KPI suelto (importe, margen %) va en un tile numérico o un medidor de progreso, nunca como un gráfico.

## Espaciado
- Escala base de 4px. Padding cómodo de tarjeta 16–20px; aire entre secciones ~24px. Busca ritmo, no el mismo padding en todo.

En una frase: tu composición + esta piel. Índigo como acento, verde/rojo solo para el signo, hairlines en vez de sombras, sin fondo blanco envolviendo el widget, y tipografía SF con números tabulares.`;
