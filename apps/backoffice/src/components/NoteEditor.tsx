import { EditorContent, useEditor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { Bold, Italic, List, ListOrdered } from 'lucide-react';

export interface NoteEditorProps {
  /** Documento JSON de TipTap (ProseMirror). null/undefined = nota vacía. */
  doc: unknown;
  /** Se invoca al perder el foco con el documento JSON actualizado a persistir. */
  onChange: (doc: unknown) => void;
}

// Editor de texto enriquecido de una nota (negrita, cursiva, listas, encabezados vía
// StarterKit). Se carga de forma diferida desde FreeNote para no inflar el bundle del
// dashboard. Persiste como JSON de ProseMirror (no HTML) → rehidratación segura por schema.
export default function NoteEditor({ doc, onChange }: NoteEditorProps) {
  const editor = useEditor({
    extensions: [StarterKit],
    content: (doc as never) ?? '',
    editorProps: { attributes: { class: 'dash-free-note-content' } },
    onBlur: ({ editor: ed }) => onChange(ed.getJSON()),
  });

  if (!editor) return null;

  return (
    <div className="dash-free-note-rte">
      <div className="dash-free-note-toolbar" role="toolbar" aria-label="Formato de la nota">
        <button
          type="button"
          aria-label="Negrita"
          title="Negrita"
          aria-pressed={editor.isActive('bold')}
          className={editor.isActive('bold') ? 'is-active' : ''}
          onClick={() => editor.chain().focus().toggleBold().run()}
        >
          <Bold size={14} aria-hidden="true" />
        </button>
        <button
          type="button"
          aria-label="Cursiva"
          title="Cursiva"
          aria-pressed={editor.isActive('italic')}
          className={editor.isActive('italic') ? 'is-active' : ''}
          onClick={() => editor.chain().focus().toggleItalic().run()}
        >
          <Italic size={14} aria-hidden="true" />
        </button>
        <button
          type="button"
          aria-label="Lista con viñetas"
          title="Lista con viñetas"
          aria-pressed={editor.isActive('bulletList')}
          className={editor.isActive('bulletList') ? 'is-active' : ''}
          onClick={() => editor.chain().focus().toggleBulletList().run()}
        >
          <List size={14} aria-hidden="true" />
        </button>
        <button
          type="button"
          aria-label="Lista numerada"
          title="Lista numerada"
          aria-pressed={editor.isActive('orderedList')}
          className={editor.isActive('orderedList') ? 'is-active' : ''}
          onClick={() => editor.chain().focus().toggleOrderedList().run()}
        >
          <ListOrdered size={14} aria-hidden="true" />
        </button>
      </div>
      <EditorContent editor={editor} />
    </div>
  );
}
