import { Controller, Get, Headers, Res, UnauthorizedException } from '@nestjs/common';
import type { Response } from 'express';
import { isProduction } from '../config/app-config.js';
import { MetricsService } from './metrics.service.js';

@Controller('metrics')
export class MetricsController {
  constructor(private readonly metrics: MetricsService) {}

  @Get()
  async scrape(
    @Headers('authorization') authorization: string | undefined,
    @Res() response: Response,
  ): Promise<void> {
    const token = process.env.METRICS_TOKEN?.trim();
    if (token && authorization !== `Bearer ${token}`) {
      throw new UnauthorizedException('METRICS_TOKEN_INVALID');
    }
    if (isProduction() && !token) {
      throw new UnauthorizedException('METRICS_TOKEN_REQUIRED');
    }

    response.type(this.metrics.contentType).send(await this.metrics.scrape());
  }
}
