import { describe, it, expect, beforeEach } from 'vitest';
import { useCartStore } from '@/store/cart';

describe('Cart Store Unit Tests (CART-U01 -> CART-U12)', () => {
  beforeEach(() => {
    useCartStore.getState().clear();
  });

  it('CART-U01: Cart ban đầu rỗng', () => {
    const state = useCartStore.getState();
    expect(state.items).toHaveLength(0);
    expect(state.total()).toBe(0);
    expect(state.count()).toBe(0);
  });

  it('CART-U02: add() món mới -> 1 dòng', () => {
    useCartStore.getState().add({
      productId: 'prod-1',
      name: 'Cappuccino',
      size: 'M',
      toppings: ['CREAM'],
      qty: 1,
      unitPrice: 50000,
    });

    const state = useCartStore.getState();
    expect(state.items).toHaveLength(1);
    expect(state.items[0].name).toBe('Cappuccino');
    expect(state.items[0].qty).toBe(1);
  });

  it('CART-U03: add() cùng product + size + toppings -> không tạo dòng mới, tăng qty', () => {
    useCartStore.getState().add({
      productId: 'prod-1',
      name: 'Cappuccino',
      size: 'M',
      toppings: ['CREAM'],
      qty: 1,
      unitPrice: 50000,
    });

    useCartStore.getState().add({
      productId: 'prod-1',
      name: 'Cappuccino',
      size: 'M',
      toppings: ['CREAM'],
      qty: 2,
      unitPrice: 50000,
    });

    const state = useCartStore.getState();
    expect(state.items).toHaveLength(1);
    expect(state.items[0].qty).toBe(3);
  });

  it('CART-U04: cùng product nhưng size khác -> 2 dòng', () => {
    useCartStore.getState().add({
      productId: 'prod-1',
      name: 'Cappuccino',
      size: 'M',
      toppings: ['CREAM'],
      qty: 1,
      unitPrice: 50000,
    });

    useCartStore.getState().add({
      productId: 'prod-1',
      name: 'Cappuccino',
      size: 'L',
      toppings: ['CREAM'],
      qty: 1,
      unitPrice: 55000,
    });

    const state = useCartStore.getState();
    expect(state.items).toHaveLength(2);
  });

  it('CART-U05: cùng product + size nhưng toppings khác -> 2 dòng', () => {
    useCartStore.getState().add({
      productId: 'prod-1',
      name: 'Cappuccino',
      size: 'M',
      toppings: ['CREAM'],
      qty: 1,
      unitPrice: 50000,
    });

    useCartStore.getState().add({
      productId: 'prod-1',
      name: 'Cappuccino',
      size: 'M',
      toppings: ['PEARL'],
      qty: 1,
      unitPrice: 50000,
    });

    const state = useCartStore.getState();
    expect(state.items).toHaveLength(2);
  });

  it('CART-U06: setQty() cập nhật đúng', () => {
    useCartStore.getState().add({
      productId: 'prod-1',
      name: 'Cappuccino',
      size: 'M',
      toppings: ['CREAM'],
      qty: 1,
      unitPrice: 50000,
    });

    useCartStore.getState().setQty('prod-1', 'M', ['CREAM'], 5);

    const state = useCartStore.getState();
    expect(state.items[0].qty).toBe(5);
  });

  it('CART-U07: qty không xuống dưới 1', () => {
    useCartStore.getState().add({
      productId: 'prod-1',
      name: 'Cappuccino',
      size: 'M',
      toppings: ['CREAM'],
      qty: 2,
      unitPrice: 50000,
    });

    useCartStore.getState().setQty('prod-1', 'M', ['CREAM'], 0);
    expect(useCartStore.getState().items[0].qty).toBe(1);

    useCartStore.getState().setQty('prod-1', 'M', ['CREAM'], -10);
    expect(useCartStore.getState().items[0].qty).toBe(1);
  });

  it('CART-U08: qty không vượt 99', () => {
    useCartStore.getState().add({
      productId: 'prod-1',
      name: 'Cappuccino',
      size: 'M',
      toppings: ['CREAM'],
      qty: 90,
      unitPrice: 50000,
    });

    useCartStore.getState().setQty('prod-1', 'M', ['CREAM'], 120);
    expect(useCartStore.getState().items[0].qty).toBe(99);

    useCartStore.getState().add({
      productId: 'prod-1',
      name: 'Cappuccino',
      size: 'M',
      toppings: ['CREAM'],
      qty: 20,
      unitPrice: 50000,
    });
    expect(useCartStore.getState().items[0].qty).toBe(99);
  });

  it('CART-U09: remove() chỉ xóa đúng variant', () => {
    useCartStore.getState().add({
      productId: 'prod-1',
      name: 'Cappuccino M',
      size: 'M',
      toppings: ['CREAM'],
      qty: 1,
      unitPrice: 50000,
    });

    useCartStore.getState().add({
      productId: 'prod-1',
      name: 'Cappuccino L',
      size: 'L',
      toppings: ['CREAM'],
      qty: 1,
      unitPrice: 55000,
    });

    expect(useCartStore.getState().items).toHaveLength(2);

    useCartStore.getState().remove('prod-1', 'M', ['CREAM']);

    const state = useCartStore.getState();
    expect(state.items).toHaveLength(1);
    expect(state.items[0].size).toBe('L');
  });

  it('CART-U10: total() tính đúng nhiều dòng', () => {
    useCartStore.getState().add({
      productId: 'prod-1',
      name: 'Cappuccino',
      size: 'M',
      toppings: [],
      qty: 2,
      unitPrice: 40000, // 80k
    });

    useCartStore.getState().add({
      productId: 'prod-2',
      name: 'Trà đào',
      size: 'S',
      toppings: ['JELLY'],
      qty: 3,
      unitPrice: 35000, // 105k
    });

    expect(useCartStore.getState().total()).toBe(185000);
  });

  it('CART-U11: count() = tổng qty (không phải số dòng)', () => {
    useCartStore.getState().add({
      productId: 'prod-1',
      name: 'Cappuccino',
      size: 'M',
      toppings: [],
      qty: 2,
      unitPrice: 40000,
    });

    useCartStore.getState().add({
      productId: 'prod-2',
      name: 'Trà đào',
      size: 'S',
      toppings: [],
      qty: 3,
      unitPrice: 30000,
    });

    expect(useCartStore.getState().items).toHaveLength(2);
    expect(useCartStore.getState().count()).toBe(5);
  });

  it('CART-U12: clear() -> items = []', () => {
    useCartStore.getState().add({
      productId: 'prod-1',
      name: 'Cappuccino',
      size: 'M',
      toppings: [],
      qty: 2,
      unitPrice: 40000,
    });

    expect(useCartStore.getState().items).toHaveLength(1);

    useCartStore.getState().clear();

    const state = useCartStore.getState();
    expect(state.items).toHaveLength(0);
    expect(state.total()).toBe(0);
    expect(state.count()).toBe(0);
  });
});
