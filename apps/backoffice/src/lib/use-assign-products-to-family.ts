import { useMutation, useQueryClient } from '@tanstack/react-query';

import { updateProduct } from './products.js';

// Resultado de un alta masiva: cuántos PATCH triunfaron y cuántos fallaron.
// `failedIds` permite reintentar solo los que no entraron (S-02 podría usarlo).
export interface AssignResult {
  ok: number;
  failed: number;
  failedIds: string[];
}

// Variables de la mutación: a qué familia (nodo) se asignan los productos y
// qué productos. `familyId` es el destino; cada producto se reasigna con
// `updateProduct(id, { familyId })`.
export interface AssignVars {
  productIds: string[];
  familyId: string;
}

// Hook reutilizable (S-18, P112): asigna N productos EXISTENTES a una familia
// con N PATCH en paralelo (`Promise.allSettled`, P109), sin endpoint bulk ni
// cambios de backend. Tras resolverse, invalida `['products']` y `['families']`
// (P111: contadores del árbol). Devuelve `{ ok, failed, failedIds }` para el
// feedback de error parcial (P145). Agnóstico de FamiliesPage: S-02 lo consume
// pasando solo `{ productIds, familyId }`.
export function useAssignProductsToFamily() {
  const qc = useQueryClient();
  return useMutation<AssignResult, Error, AssignVars>({
    mutationFn: async ({ productIds, familyId }: AssignVars): Promise<AssignResult> => {
      const results = await Promise.allSettled(
        productIds.map((id) => updateProduct(id, { familyId })),
      );
      const failedIds = productIds.filter((_, i) => results[i]!.status === 'rejected');
      return {
        ok: productIds.length - failedIds.length,
        failed: failedIds.length,
        failedIds,
      };
    },
    // Se invalida SIEMPRE (éxito total o parcial): aunque algunos fallen, los que
    // entraron ya cambiaron de familia y el árbol/listas deben reflejarlo.
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: ['products'] });
      void qc.invalidateQueries({ queryKey: ['families'] });
    },
  });
}
