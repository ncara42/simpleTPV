import { Check, Copy } from 'lucide-react';
import { type ComponentPropsWithoutRef, useRef, useState } from 'react';
import Markdown, { type Components } from 'react-markdown';
import remarkGfm from 'remark-gfm';

// Bloque de código con botón de copiar (estilo CodeBlock de ai-elements). Sin resaltado de
// sintaxis (no hay shiki en el bundle); el copiado lee el texto del <pre> vía ref.
function CodeBlock({ children }: ComponentPropsWithoutRef<'pre'>) {
  const ref = useRef<HTMLPreElement>(null);
  const [copied, setCopied] = useState(false);

  const copy = (): void => {
    const text = ref.current?.textContent ?? '';
    navigator.clipboard?.writeText(text).then(
      () => {
        setCopied(true);
        window.setTimeout(() => setCopied(false), 1500);
      },
      () => {
        /* clipboard no disponible */
      },
    );
  };

  return (
    <div className="code-block">
      <div className="code-block__head">
        <button
          type="button"
          className="code-block__copy"
          onClick={copy}
          aria-label={copied ? 'Copiado' : 'Copiar código'}
          title={copied ? 'Copiado' : 'Copiar código'}
        >
          {copied ? <Check size={13} aria-hidden="true" /> : <Copy size={13} aria-hidden="true" />}
        </button>
      </div>
      <pre ref={ref}>{children}</pre>
    </div>
  );
}

const COMPONENTS: Components = { pre: CodeBlock };

/** Markdown del chat (GFM + bloques de código con copiar), compartido por respuestas/razonamiento. */
export function ChatMarkdown({ children }: { children: string }) {
  return (
    <Markdown remarkPlugins={[remarkGfm]} components={COMPONENTS}>
      {children}
    </Markdown>
  );
}
