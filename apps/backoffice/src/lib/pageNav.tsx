import { createContext, type ReactNode, useContext, useLayoutEffect, useState } from 'react';

// Mismo patrón que pageActions: dos contextos separados para evitar re-renders.
//  · SetContext: setter estable que los pages consumen para registrar su sub-nav.
//  · ValueContext: solo lo lee ViewToolbar (la sub-barra de la tabla).
const PageNavSetContext = createContext<((n: ReactNode) => void) | null>(null);
const PageNavValueContext = createContext<ReactNode>(null);

export function PageNavProvider({ children }: { children: ReactNode }) {
  const [nav, setNav] = useState<ReactNode>(null);
  return (
    <PageNavSetContext.Provider value={setNav}>
      <PageNavValueContext.Provider value={nav}>{children}</PageNavValueContext.Provider>
    </PageNavSetContext.Provider>
  );
}

export function usePageNavValue(): ReactNode {
  return useContext(PageNavValueContext);
}

export function usePageNav(nav: ReactNode): void {
  const setNav = useContext(PageNavSetContext);
  useLayoutEffect(() => {
    setNav?.(nav);
    return () => setNav?.(null);
  });
}
