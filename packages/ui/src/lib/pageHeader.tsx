import {
  createContext,
  type ReactNode,
  useContext,
  useLayoutEffect,
  useMemo,
  useState,
} from 'react';

/**
 * Cabecera de la vista activa, elevada a la TopBar. Cada vista declara su título
 * y descripción con `usePageHeader(...)` y el shell los pinta en la barra superior,
 * de modo que el contenido no repite ese bloque y gana espacio vertical.
 *
 * Compartido por backoffice y tpv (antes duplicado en cada app).
 */
export interface PageHeader {
  title: string;
  description?: string | undefined;
  /** data-testid opcional para la descripción (preserva hooks e2e como `catalog-count`). */
  descriptionTestId?: string | undefined;
}

interface PageHeaderContextValue {
  header: PageHeader;
  setHeader: (header: PageHeader) => void;
}

const PageHeaderContext = createContext<PageHeaderContextValue | null>(null);

export function PageHeaderProvider({ children }: { children: ReactNode }) {
  const [header, setHeader] = useState<PageHeader>({ title: '' });
  const value = useMemo<PageHeaderContextValue>(() => ({ header, setHeader }), [header]);
  return <PageHeaderContext.Provider value={value}>{children}</PageHeaderContext.Provider>;
}

/** Lo lee el shell para alimentar la TopBar. */
export function usePageHeaderValue(): PageHeader {
  return useContext(PageHeaderContext)?.header ?? { title: '' };
}

/**
 * Declara el título (y descripción) de la vista. Se sincroniza con la TopBar antes
 * del primer pintado (useLayoutEffect) para que no haya parpadeo al cambiar de
 * vista. Llamar siempre en el cuerpo del componente, sin condicionar.
 */
export function usePageHeader(
  title: string,
  description?: string,
  descriptionTestId?: string,
): void {
  const setHeader = useContext(PageHeaderContext)?.setHeader;
  useLayoutEffect(() => {
    setHeader?.({ title, description, descriptionTestId });
  }, [setHeader, title, description, descriptionTestId]);
}
