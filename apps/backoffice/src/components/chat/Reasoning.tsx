/**
 * Re-exporta el componente Reasoning de AI Elements (Vercel).
 * Mantiene la interfaz anterior ({ children, isStreaming, defaultOpen })
 * para que ChatMessages.tsx no necesite cambios en su contrato.
 */
export {
  Reasoning,
  ReasoningContent,
  ReasoningTrigger,
  useReasoning,
} from '../ai-elements/reasoning.js';
