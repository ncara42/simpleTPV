import { Module } from '@nestjs/common';

import { VerifactuController } from './verifactu.controller.js';
import { SandboxVerifactuProvider, VERIFACTU_PROVIDER } from './verifactu.provider.js';
import { VerifactuService } from './verifactu.service.js';

// Provee el adaptador de proveedor (sandbox por defecto). Para producción,
// sustituir SandboxVerifactuProvider por el adaptador del proveedor certificado.
@Module({
  controllers: [VerifactuController],
  providers: [
    VerifactuService,
    { provide: VERIFACTU_PROVIDER, useClass: SandboxVerifactuProvider },
  ],
  exports: [VerifactuService],
})
export class VerifactuModule {}
