import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { finalize, type Observable } from 'rxjs';
import { MetricsService } from './metrics.service.js';

@Injectable()
export class MetricsInterceptor implements NestInterceptor {
  constructor(private readonly metrics: MetricsService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (context.getType() !== 'http') return next.handle();

    const http = context.switchToHttp();
    const request = http.getRequest<Request>();
    const response = http.getResponse<Response>();
    const startedAt = process.hrtime.bigint();

    return next.handle().pipe(
      finalize(() => {
        const route =
          (request.route as { path?: string } | undefined)?.path ??
          request.originalUrl.split('?')[0] ??
          'unknown';
        const seconds = Number(process.hrtime.bigint() - startedAt) / 1e9;
        this.metrics.observeHttp(request.method, route, response.statusCode, seconds);
      }),
    );
  }
}
