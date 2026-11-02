import { describe, expect, it, vi } from 'vitest';
import { HealthController } from './health.controller.js';

describe('HealthController', () => {
  const prisma = {
    $queryRaw: vi.fn().mockResolvedValue([{ '?column?': 1 }]),
  };

  const controller = new HealthController(prisma as never);

  it('GET /health trả về status ok', () => {
    expect(controller.root()).toEqual({ status: 'ok' });
  });

  it('GET /health/live trả về status ok', () => {
    expect(controller.live()).toEqual({ status: 'ok' });
  });

  it('GET /health/ready kiểm tra database connection', async () => {
    await expect(controller.ready()).resolves.toEqual({
      status: 'ok',
      database: 'reachable',
    });
    expect(prisma.$queryRaw).toHaveBeenCalled();
  });
});
