import { createContext, type ReactNode, useContext, useLayoutEffect, useState } from 'react';

// Dos contextos separados para evitar el bucle de re-render:
// - SetContext: provee el setter estable (useState dispatch, misma referencia siempre).
//   Los pages son consumidores de este y NUNCA se re-renderizan cuando cambian las actions.
// - ValueContext: provee el valor actual. Solo ViewToolbar (la sub-barra de la tabla) lo consume y se re-renderiza.
const PageActionsSetContext = createContext<((a: ReactNode) => void) | null>(null);
const PageActionsValueContext = createContext<ReactNode>(null);

export function PageActionsProvider({ children }: { children: ReactNode }) {
  const [actions, setActions] = useState<ReactNode>(null);
  return (
    <PageActionsSetContext.Provider value={setActions}>
      <PageActionsValueContext.Provider value={actions}>
        {children}
      </PageActionsValueContext.Provider>
    </PageActionsSetContext.Provider>
  );
}

/** Lo lee ViewToolbar (sub-barra de la tabla) para pintar los botones de la view activa. */
export function usePageActionsValue(): ReactNode {
  return useContext(PageActionsValueContext);
}

/**
 * Declara los botones de acción de la view activa. Usa el setter estable para no
 * re-suscribirse al contexto de valor y evitar bucles de render.
 */
export function usePageActions(actions: ReactNode): void {
  const setActions = useContext(PageActionsSetContext);
  useLayoutEffect(() => {
    setActions?.(actions);
    return () => setActions?.(null);
  });
}
