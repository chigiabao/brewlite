// Bảng phụ thu dùng chung. Phải giống hệt backend/src/common/pricing.ts.
// Giá trị là đề xuất, được khóa trong contracts/brewlite-v1.json (A review thay đổi).
export const SIZE_EXTRA = { S: 0, M: 5000, L: 10000 } as const;
export const TOPPING_PRICE = 5000;

export type Size = keyof typeof SIZE_EXTRA;

export function calculateUnitPrice(basePrice: number, size: Size, toppings: string[]): number {
  return basePrice + SIZE_EXTRA[size] + toppings.length * TOPPING_PRICE;
}

// Giữ lại alias unitPrice để đảm bảo tương thích ngược
export const unitPrice = calculateUnitPrice;
