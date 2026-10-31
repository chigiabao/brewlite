import { BadRequestException } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import { OrderStatus as S } from '../generated/prisma/enums.js';
import { assertTransition } from './order-state.js';

describe('G-04: trạng thái đơn hàng', () => {
  it.each([[S.PENDING, S.PAID], [S.PENDING, S.PAYMENT_FAILED], [S.PAYMENT_FAILED, S.PAID],
    [S.PAID, S.PREPARING], [S.PREPARING, S.READY], [S.READY, S.COMPLETED],
    [S.PENDING, S.CANCELLED], [S.PAYMENT_FAILED, S.CANCELLED]])('%s → %s hợp lệ', (a, b) => {
    expect(() => assertTransition(a, b)).not.toThrow();
  });
  it.each([[S.PENDING, S.COMPLETED], [S.PENDING, S.READY], [S.PAID, S.CANCELLED],
    [S.CANCELLED, S.PAID], [S.COMPLETED, S.PENDING], [S.PAID, S.PAID]])
    ('%s → %s bị chặn', (a, b) => {
      expect(() => assertTransition(a, b)).toThrow(BadRequestException);
    });
});
