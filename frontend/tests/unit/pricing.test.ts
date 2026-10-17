import { describe, it, expect } from 'vitest';
import {
  calculateUnitPrice,
  calculateLineTotal,
  SIZE_SURCHARGE,
  TOPPING_SURCHARGE,
} from '@/lib/pricing';

describe('Pricing Logic (frontend/lib/pricing.ts)', () => {
  it('Size S with 0 topping: 35k, S, 0 topping -> 35k', () => {
    const price = calculateUnitPrice(35000, 'S', []);
    expect(price).toBe(35000);
  });

  it('Size M with 0 topping: 35k, M, 0 topping -> 40k', () => {
    const price = calculateUnitPrice(35000, 'M', []);
    expect(price).toBe(40000);
  });

  it('Size L with 0 topping: 35k, L, 0 topping -> 45k', () => {
    const price = calculateUnitPrice(35000, 'L', []);
    expect(price).toBe(45000);
  });

  it('1 topping: 35k, S, 1 topping -> 40k', () => {
    const price = calculateUnitPrice(35000, 'S', ['CREAM']);
    expect(price).toBe(40000);
  });

  it('2 toppings: 35k, M, 2 toppings -> 50k (35k + 5k size + 10k toppings)', () => {
    const price = calculateUnitPrice(35000, 'M', ['CREAM', 'PEARL']);
    expect(price).toBe(50000);
  });

  it('Duplicate topping: ["CREAM", "CREAM"] -> only charged once', () => {
    const price = calculateUnitPrice(35000, 'S', ['CREAM', 'CREAM']);
    expect(price).toBe(40000);
  });

  it('Line total calculation: unit 50k x 3 -> 150k', () => {
    const lineTotal = calculateLineTotal(50000, 3);
    expect(lineTotal).toBe(150000);
  });

  it('Throws error when base price is negative', () => {
    expect(() => calculateUnitPrice(-1000, 'M', [])).toThrow('Invalid base price');
  });

  it('Throws error when base price is not an integer', () => {
    expect(() => calculateUnitPrice(35000.5, 'M', [])).toThrow('Invalid base price');
  });
});
