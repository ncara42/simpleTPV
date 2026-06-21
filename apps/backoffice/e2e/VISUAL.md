# Regresión visual de paneles v2 (#211)

Captura por screenshot las **recetas** (`kpiRow`, `kpiRow+oneChart`, `kpiRow+twoCharts`,
`heroChart+sideStats`, `tableFull`) y los **bloques** pre-cableados del dashboard a 4 breakpoints
(320/768/1024/1440), más los estados `loading`/`error`/`empty` de un panel representativo.

## Cómo funciona

- **Harness aislado** (`src/visual/*` → `visual.html`): un entry de Vite aparte que monta
  `GenericPanel` con specs de cada receta/bloque. No se monta en la app real.
- **Datos mock**: el spec (`e2e/visual.spec.ts`) stubea `/api/**` con `page.route` — **no hay
  backend**. Por eso usa su propio config (`playwright.visual.config.ts`), separado del e2e funcional.
- **Baselines por plataforma**: se commitean los `*-visual-linux.png` porque CI corre el job
  `visual` DENTRO del contenedor oficial de Playwright (`mcr.microsoft.com/playwright:v1.60.0-noble`),
  el mismo entorno donde se generan → casan pixel a pixel.

## Comandos

```bash
# Ejecutar la suite (en el contenedor de CI; en local sirve si estás en Linux con esa toolchain)
pnpm --filter @simpletpv/backoffice test:visual

# Actualizar baselines tras un cambio visual INTENCIONADO (genera los -linux vía Docker, no destructivo)
pnpm --filter @simpletpv/backoffice visual:baselines
```

> En macOS/Windows los baselines `-linux` no casan con el render local. Usa `visual:baselines`
> (Docker) para regenerarlos en el entorno correcto y revisa el diff antes de commitear.
