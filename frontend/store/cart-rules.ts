// FIX 09 (C): Quy tắc giỏ hàng độc lập với Zustand để có thể kiểm thử trực tiếp.
// Đây chỉ là giá hiển thị; Orders ở backend mới quyết định giá và tồn kho thực tế.
export const MAX_CART_QTY = 99;
export const ALLOWED_CART_TOPPINGS = ['Trân châu', 'Kem'] as const;

export type CartSize = 'S' | 'M' | 'L';
export type CartItem = {
  productId: number;
  name: string;
  size: CartSize;
  toppings: string[];
  unitPrice: number;
  qty: number;
};

const isPlainRecord = (input: unknown): input is Record<string, unknown> =>
  input !== null && typeof input === 'object' && !Array.isArray(input);

export function normalizeToppings(toppings: readonly string[]): string[] {
  if (!Array.isArray(toppings)) throw new Error('Danh sách topping không hợp lệ');
  const cleaned = toppings.map((topping) => {
    if (typeof topping !== 'string') throw new Error('Topping không hợp lệ');
    return topping.trim();
  });
  // Chỉ cho phép đúng 2 loại topping được khóa trong Master Contract.
  if (cleaned.some((topping) => !ALLOWED_CART_TOPPINGS.some((allowed) => allowed === topping))) {
    throw new Error('Topping không nằm trong danh sách cho phép');
  }
  return [...new Set(cleaned)].sort();
}

export function cartLineKey(item: Pick<CartItem, 'productId' | 'size' | 'toppings'>): string {
  return `${item.productId}|${item.size}|${normalizeToppings(item.toppings).join('|')}`;
}

// Giá trị cũ trong localStorage có thể sai kiểu hoặc bị chỉnh tay: không tin dữ liệu persist.
export function sanitizeCartItem(input: unknown): CartItem | null {
  if (!isPlainRecord(input)) return null;
  const { productId, name, size, toppings, qty, unitPrice } = input;
  if (typeof productId !== 'number' || !Number.isSafeInteger(productId) || productId <= 0) return null;
  if (typeof name !== 'string' || !name.trim()) return null;
  if (size !== 'S' && size !== 'M' && size !== 'L') return null;
  if (typeof qty !== 'number' || !Number.isSafeInteger(qty) || qty < 1) return null;
  if (typeof unitPrice !== 'number' || !Number.isSafeInteger(unitPrice) || unitPrice < 0) return null;
  if (!Array.isArray(toppings)) return null;
  try {
    return {
      productId,
      name: name.trim(),
      size,
      toppings: normalizeToppings(toppings),
      qty: Math.min(qty, MAX_CART_QTY),
      unitPrice,
    };
  } catch {
    return null;
  }
}

// Gộp các dòng có cùng sản phẩm/size/tập topping, bất kể thứ tự hay topping trùng.
// Khi cùng món được thêm lại, dùng giá preview mới nhất; backend vẫn tự tính lại giá thật.
export function mergeCartItems(values: unknown): CartItem[] {
  if (!Array.isArray(values)) return [];
  const lines = new Map<string, CartItem>();
  for (const value of values) {
    const item = sanitizeCartItem(value);
    if (!item) continue;
    const key = cartLineKey(item);
    const previous = lines.get(key);
    lines.set(key, previous
      ? { ...item, qty: Math.min(MAX_CART_QTY, previous.qty + item.qty) }
      : item);
  }
  return [...lines.values()];
}

export function clampCartQty(qty: number): number {
  if (!Number.isSafeInteger(qty)) throw new Error('Số lượng phải là số nguyên');
  return Math.max(1, Math.min(MAX_CART_QTY, qty));
}

export function cartTotal(items: readonly CartItem[]): number {
  return items.reduce((sum, item) => sum + item.unitPrice * item.qty, 0);
}

export function cartCount(items: readonly CartItem[]): number {
  return items.reduce((sum, item) => sum + item.qty, 0);
}
