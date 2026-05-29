import { Logger } from '@nestjs/common';

import type { VerifactuPayload } from './verifactu.hash.js';

export interface VerifactuSendResult {
  ok: boolean;
  // Identificador de cotejo que devuelve la AEAT/proveedor en caso de éxito.
  csv?: string;
  error?: string;
}

// Adaptador del proveedor de envío a la AEAT (#47). El envío real requiere un
// proveedor certificado homologado y credenciales sandbox que NO tenemos en este
// entorno. Esta interfaz aísla esa integración: para enchufar el proveedor real
// basta con una implementación nueva (con sus credenciales) registrada en el
// módulo en lugar del sandbox.
export interface VerifactuProvider {
  send(payload: VerifactuPayload, hash: string): Promise<VerifactuSendResult>;
}

export const VERIFACTU_PROVIDER = Symbol('VERIFACTU_PROVIDER');

// Implementación sandbox: simula la respuesta del proveedor SIN llamar a la AEAT.
// Por defecto responde OK; útil para dev/test y para ejercitar la cola y el
// encadenamiento. TODO(prod): sustituir por el adaptador del proveedor real.
export class SandboxVerifactuProvider implements VerifactuProvider {
  private readonly logger = new Logger(SandboxVerifactuProvider.name);

  async send(payload: VerifactuPayload, hash: string): Promise<VerifactuSendResult> {
    this.logger.log(
      `[sandbox] envío VeriFactu simulado: ${payload.invoiceNumber} (${hash.slice(0, 12)}…)`,
    );
    // CSV simulado de cotejo (no real). El proveedor real devolvería el de la AEAT.
    return { ok: true, csv: `SANDBOX-${hash.slice(0, 16)}` };
  }
}
