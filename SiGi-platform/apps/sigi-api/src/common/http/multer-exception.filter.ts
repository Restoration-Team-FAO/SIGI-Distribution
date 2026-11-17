import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { MulterError } from 'multer';

@Catch(MulterError)
export class MulterExceptionFilter implements ExceptionFilter {
  catch(exception: MulterError, host: ArgumentsHost) {
    const request = host.switchToHttp().getRequest<Request>();
    const response = host.switchToHttp().getResponse<Response>();
    const statusCode = exception.code === 'LIMIT_FILE_SIZE' ? 413 : 400;
    const message =
      exception.code === 'LIMIT_FILE_SIZE'
        ? 'El archivo excede el tamaño máximo permitido.'
        : 'No se pudo procesar la carga del archivo.';
    const code =
      exception.code === 'LIMIT_FILE_SIZE' ? 'upload.file_too_large' : 'upload.invalid_payload';
    const requestId = request.header('x-request-id') ?? null;

    response.status(statusCode).json({
      statusCode,
      code,
      message,
      error: exception.code,
      requestId,
    });
  }
}
