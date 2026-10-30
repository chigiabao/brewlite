import { Injectable } from '@nestjs/common';
import {
  collectDefaultMetrics,
  Counter,
  Histogram,
  Registry,
} from 'prom-client';

const registry = new Registry();
collectDefaultMetrics({ register: registry });

const httpRequests = new Counter({
  name: 'brewlite_http_requests_total',
  help: 'Total HTTP requests by method, route and status',
  labelNames: ['method', 'route', 'status'],
  registers: [registry],
});

const httpDuration = new Histogram({
  name: 'brewlite_http_request_duration_seconds',
  help: 'HTTP request duration in seconds',
  labelNames: ['method', 'route', 'status'],
  buckets: [0.01, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
  registers: [registry],
});

@Injectable()
export class MetricsService {
  observeHttp(
    method: string,
    route: string,
    status: number,
    durationSeconds: number,
  ): void {
    const labels = { method, route, status: String(status) };
    httpRequests.inc(labels);
    httpDuration.observe(labels, durationSeconds);
  }

  get contentType(): string {
    return registry.contentType;
  }

  scrape(): Promise<string> {
    return registry.metrics();
  }
}
