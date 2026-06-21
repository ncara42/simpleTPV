interface LoaderProps {
  size?: number;
  className?: string;
}

/**
 * Indicador de carga (spinner), estilo Loader de ai-elements. Anillo girando con los tokens
 * del sistema; respeta `prefers-reduced-motion`.
 */
export function Loader({ size = 16, className }: LoaderProps) {
  return (
    <span
      className={`chat-loader${className ? ` ${className}` : ''}`}
      style={{ width: size, height: size }}
      role="status"
      aria-label="Cargando"
    />
  );
}
