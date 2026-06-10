import { ArgumentsHost, Catch, ExceptionFilter, HttpStatus, Logger } from '@nestjs/common';
import { Prisma } from '@simpletpv/db';

// Mínimo estructural de la respuesta Express que usamos (evita depender de
// @types/express en el filtro).
interface HttpResponse {
  status(code: number): { json(body: unknown): void };
}

// Traduce los errores conocidos de Prisma a respuestas HTTP con CAUSA legible
// (D-14): sin esto, un email duplicado o un borrado con FK revientan en un 500
// "Internal server error" que el formulario no puede explicar al usuario.
//   P2002 (unique)      → 409 con el campo en conflicto
//   P2003 (FK violada)  → 409 "tiene registros relacionados"
//   P2025 (no existe)   → 404
// El resto de códigos siguen siendo 500 (se loguean para diagnóstico).
@Catch(Prisma.PrismaClientKnownRequestError)
export class PrismaExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(PrismaExceptionFilter.name);

  catch(exception: Prisma.PrismaClientKnownRequestError, host: ArgumentsHost): void {
    const res = host.switchToHttp().getResponse<HttpResponse>();

    if (exception.code === 'P2002') {
      const target = exception.meta?.target;
      const fields = Array.isArray(target) ? target.join(', ') : String(target ?? 'valor único');
      res.status(HttpStatus.CONFLICT).json({
        statusCode: HttpStatus.CONFLICT,
        message: `Ya existe un registro con ese ${fields}`,
        error: 'Conflict',
      });
      return;
    }

    if (exception.code === 'P2003') {
      res.status(HttpStatus.CONFLICT).json({
        statusCode: HttpStatus.CONFLICT,
        message: 'No se puede completar: tiene registros relacionados (ventas, stock…)',
        error: 'Conflict',
      });
      return;
    }

    if (exception.code === 'P2025') {
      res.status(HttpStatus.NOT_FOUND).json({
        statusCode: HttpStatus.NOT_FOUND,
        message: 'El registro no existe (puede haberse borrado en otra sesión)',
        error: 'Not Found',
      });
      return;
    }

    this.logger.error(`Prisma ${exception.code}: ${exception.message}`);
    res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
      statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
      message: 'Internal server error',
    });
  }
}
