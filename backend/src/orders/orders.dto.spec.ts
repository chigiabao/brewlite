
import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreateOrderDto, OrderItemDto } from './orders.dto.js';

describe('OrderItemDto', () => {
  const validItem = {
    productId: 1,
    size: 'M',
    toppings: ['Trân châu'],
    qty: 2,
  };

  it('accepts valid order item', async () => {
    const dto = plainToInstance(OrderItemDto, validItem);
    const errors = await validate(dto);

    expect(errors).toHaveLength(0);
  });

  it('rejects productId less than 1', async () => {
    const dto = plainToInstance(OrderItemDto, {
      ...validItem,
      productId: 0,
    });

    const errors = await validate(dto);

    expect(errors.some((error) => error.property === 'productId')).toBe(true);
  });

  it('rejects invalid size', async () => {
    const dto = plainToInstance(OrderItemDto, {
      ...validItem,
      size: 'XL',
    });

    const errors = await validate(dto);

    expect(errors.some((error) => error.property === 'size')).toBe(true);
  });

  it('rejects duplicate toppings', async () => {
    const dto = plainToInstance(OrderItemDto, {
      ...validItem,
      toppings: ['Kem', 'Kem'],
    });

    const errors = await validate(dto);

    expect(errors.some((error) => error.property === 'toppings')).toBe(true);
  });

  it('rejects more than two toppings', async () => {
    const dto = plainToInstance(OrderItemDto, {
      ...validItem,
      toppings: ['Trân châu', 'Kem', 'Trân châu'],
    });

    const errors = await validate(dto);

    expect(errors.some((error) => error.property === 'toppings')).toBe(true);
  });

  it('rejects invalid topping', async () => {
    const dto = plainToInstance(OrderItemDto, {
      ...validItem,
      toppings: ['Thạch'],
    });

    const errors = await validate(dto);

    expect(errors.some((error) => error.property === 'toppings')).toBe(true);
  });

  it('rejects qty less than 1', async () => {
    const dto = plainToInstance(OrderItemDto, {
      ...validItem,
      qty: 0,
    });

    const errors = await validate(dto);

    expect(errors.some((error) => error.property === 'qty')).toBe(true);
  });
});

describe('CreateOrderDto', () => {
  const validOrder = {
    items: [
      {
        productId: 1,
        size: 'M',
        toppings: ['Trân châu'],
        qty: 2,
      },
    ],
  };

  it('accepts valid order', async () => {
    const dto = plainToInstance(CreateOrderDto, validOrder);
    const errors = await validate(dto);

    expect(errors).toHaveLength(0);
  });

  it('rejects empty items', async () => {
    const dto = plainToInstance(CreateOrderDto, {
      items: [],
    });

    const errors = await validate(dto);

    expect(errors.some((error) => error.property === 'items')).toBe(true);
  });

  it('rejects invalid nested order item', async () => {
    const dto = plainToInstance(CreateOrderDto, {
      items: [
        {
          ...validOrder.items[0],
          qty: 0,
        },
      ],
    });

    const errors = await validate(dto);
    const itemsError = errors.find((error) => error.property === 'items');

    expect(itemsError).toBeDefined();
    expect(itemsError?.children?.length).toBeGreaterThan(0);
  });

  it('accepts optional couponCode and pointsToRedeem', async () => {
    const dto = plainToInstance(CreateOrderDto, {
      ...validOrder,
      couponCode: 'BREW10',
      pointsToRedeem: 10,
    });

    const errors = await validate(dto);

    expect(errors).toHaveLength(0);
  });

  it('rejects negative pointsToRedeem', async () => {
    const dto = plainToInstance(CreateOrderDto, {
      ...validOrder,
      pointsToRedeem: -1,
    });

    const errors = await validate(dto);

    expect(errors.some((error) => error.property === 'pointsToRedeem')).toBe(true);
  });

  it('rejects non-string couponCode', async () => {
    const dto = plainToInstance(CreateOrderDto, {
      ...validOrder,
      couponCode: 123,
    });

    const errors = await validate(dto);

    expect(errors.some((error) => error.property === 'couponCode')).toBe(true);
  });
});
