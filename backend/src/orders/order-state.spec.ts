// Test bắt buộc (a) của Task 10 – E viết.
// describe('Order State Machine', () => {
//   it.todo('chặn PENDING → COMPLETED');
//   it.todo('cho phép PENDING → PAID');
//   it.todo('trạng thái kết thúc (COMPLETED, CANCELLED) không chuyển tiếp được');
// });

// import { BadRequestException } from '@nestjs/common';
import { ConflictException } from '@nestjs/common';
import { OrderStatus } from '../generated/prisma/enums.js';
import { assertTransition } from './order-state.js';

describe('Order State Machine', () => {
  it('chặn PENDING → COMPLETED', () => {
    expect(() =>
      assertTransition(OrderStatus.PENDING, OrderStatus.COMPLETED),
    ).toThrow(ConflictException);
  });

  it('cho phép PENDING → PAID', () => {
    expect(() =>
      assertTransition(OrderStatus.PENDING, OrderStatus.PAID),
    ).not.toThrow();
  });

  it('trạng thái kết thúc (COMPLETED, CANCELLED) không chuyển tiếp được', () => {
    expect(() =>
      assertTransition(OrderStatus.COMPLETED, OrderStatus.PENDING),
    ).toThrow(ConflictException);

    expect(() =>
      assertTransition(OrderStatus.CANCELLED, OrderStatus.PENDING),
    ).toThrow(ConflictException);
  });

  it('cho phép các chuyển tiếp hợp lệ theo luồng đặt hàng', () => {
    expect(() =>
      assertTransition(OrderStatus.PAID, OrderStatus.PREPARING),
    ).not.toThrow();

    expect(() =>
      assertTransition(OrderStatus.PREPARING, OrderStatus.READY),
    ).not.toThrow();

    expect(() =>
      assertTransition(OrderStatus.READY, OrderStatus.COMPLETED),
    ).not.toThrow();
  });

  it('cho phép PAYMENT_FAILED thử lại và hủy đơn', () => {
    expect(() =>
      assertTransition(OrderStatus.PENDING, OrderStatus.PAYMENT_FAILED),
    ).not.toThrow();

    expect(() =>
      assertTransition(OrderStatus.PAYMENT_FAILED, OrderStatus.PENDING),
    ).not.toThrow();

    expect(() =>
      assertTransition(OrderStatus.PAYMENT_FAILED, OrderStatus.CANCELLED),
    ).not.toThrow();
  });

  it('chặn các chuyển tiếp không hợp lệ', () => {
    expect(() =>
      assertTransition(OrderStatus.PENDING, OrderStatus.PREPARING),
    ).toThrow(ConflictException);

    expect(() =>
      assertTransition(OrderStatus.PAID, OrderStatus.COMPLETED),
    ).toThrow(ConflictException);

    expect(() =>
      assertTransition(OrderStatus.READY, OrderStatus.PREPARING),
    ).toThrow(ConflictException);
  });
});
