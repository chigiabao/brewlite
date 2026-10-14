// Bảng phụ thu dùng chung. Phải giống hệt backend/src/common/pricing.ts.
// Giá trị là đề xuất, PO (F) chốt lại với nhóm rồi sửa ở cả 2 nơi.
export const SIZE_EXTRA = { S: 0, M: 5000, L: 10000 } as const;
export const TOPPING_PRICE = 5000;

export type Size = keyof typeof SIZE_EXTRA;

export function unitPrice(base: number, size: Size, toppings: string[]): number {
  return base + SIZE_EXTRA[size] + toppings.length * TOPPING_PRICE;
}
