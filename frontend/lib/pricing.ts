import type { CartSize } from '@/store/cart';

export const SIZE_SURCHARGE: Record<CartSize, number> = {
  S: 0,
  M: 5_000,
  L: 10_000,
};

export const TOPPING_SURCHARGE = 5_000;

/**
 * Calculates unit price for 1 cup of beverage based on base price, size, and toppings.
 * NOTE: For frontend display / preview only. Backend E recalculates authoritative price.
 */
export function calculateUnitPrice(
  basePrice: number,
  size: CartSize,
  toppings: string[],
): number {
  if (!Number.isInteger(basePrice) || basePrice < 0) {
    throw new Error('Invalid base price');
  }

  const uniqueToppings = [...new Set(toppings)];

  return (
    basePrice +
    SIZE_SURCHARGE[size] +
    uniqueToppings.length * TOPPING_SURCHARGE
  );
}

/**
 * Calculates line total for a variant line: unitPrice * qty.
 */
export function calculateLineTotal(
  unitPrice: number,
  qty: number,
): number {
  return unitPrice * qty;
}
