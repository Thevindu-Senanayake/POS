import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus, Logger } from '@nestjs/common';
import { Prisma } from '@pos/db';
import type { ApiErrorDTO } from '@pos/shared';
import type { Response } from 'express';

/**
 * Single global filter that normalises every thrown error into the shared
 * ApiErrorDTO shape and maps common Prisma errors to sensible HTTP statuses.
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger('Exceptions');

  catch(exception: unknown, host: ArgumentsHost): void {
    const res = host.switchToHttp().getResponse<Response>();

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let message: string | string[] = 'Internal server error';
    let error = 'InternalServerError';

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const response = exception.getResponse();
      if (typeof response === 'string') {
        message = response;
      } else if (response && typeof response === 'object') {
        const body = response as { message?: string | string[]; error?: string };
        message = body.message ?? exception.message;
        error = body.error ?? exception.name;
      }
    } else if (exception instanceof Prisma.PrismaClientKnownRequestError) {
      ({ status, message, error } = this.mapPrismaError(exception));
    } else if (exception instanceof Prisma.PrismaClientValidationError) {
      status = HttpStatus.BAD_REQUEST;
      message = 'Invalid data supplied to the database layer';
      error = 'BadRequest';
    } else if (exception instanceof Error) {
      message = exception.message;
    }

    if (status >= HttpStatus.INTERNAL_SERVER_ERROR) {
      this.logger.error(exception instanceof Error ? (exception.stack ?? exception.message) : String(exception));
    }

    const payload: ApiErrorDTO = { statusCode: status, message, error };
    res.status(status).json(payload);
  }

  private mapPrismaError(e: Prisma.PrismaClientKnownRequestError): {
    status: number;
    message: string;
    error: string;
  } {
    switch (e.code) {
      case 'P2002': {
        const target = (e.meta as { target?: string[] | string })?.target;
        const fields = Array.isArray(target) ? target.join(', ') : target;
        return { status: HttpStatus.CONFLICT, message: `Already exists (unique constraint${fields ? `: ${fields}` : ''})`, error: 'Conflict' };
      }
      case 'P2025':
        return { status: HttpStatus.NOT_FOUND, message: 'Record not found', error: 'NotFound' };
      case 'P2003':
        return { status: HttpStatus.BAD_REQUEST, message: 'Related record does not exist (foreign key constraint)', error: 'BadRequest' };
      default:
        return {
          status: HttpStatus.BAD_REQUEST,
          message: e.message.split('\n').pop()?.trim() ?? e.message,
          error: 'BadRequest',
        };
    }
  }
}
