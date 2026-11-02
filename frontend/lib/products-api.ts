// FIX 09 (B): Chỉ đọc sản phẩm thật từ NestJS. Lỗi backend phải được hiển thị, không được dùng menu giả.
export interface Product {
  id: number;
  name: string;
  price: number;
  imageUrl: string;
  stock: number;
  category?: 'all' | 'vietnamese' | 'espresso' | 'tea' | 'specialty';
  description?: string;
  rating?: number;
  badge?: string;
  originalPrice?: number;
}

const BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';
const REQUEST_TIMEOUT_MS = 8000;

export class ProductNotFoundError extends Error {
  constructor() {
    super('Không tìm thấy sản phẩm này');
    this.name = 'ProductNotFoundError';
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function normalizeProduct(data: unknown): Product {
  if (!isRecord(data) ||
      typeof data.id !== 'number' || !Number.isSafeInteger(data.id) || data.id <= 0 ||
      typeof data.name !== 'string' || !data.name.trim() ||
      typeof data.price !== 'number' || !Number.isSafeInteger(data.price) || data.price < 0 ||
      typeof data.stock !== 'number' || !Number.isSafeInteger(data.stock) || data.stock < 0 ||
      typeof data.imageUrl !== 'string') {
    throw new Error('API trả dữ liệu sản phẩm không hợp lệ');
  }

  // Category chỉ giúp lọc trên UI, không dùng để tính giá hay tạo đơn.
  const name = data.name.toLowerCase();
  const category: Product['category'] =
    name.includes('trà') || name.includes('tea') ? 'tea' :
    name.includes('muối') || name.includes('cold brew') || name.includes('matcha') ? 'specialty' :
    name.includes('americano') || name.includes('espresso') || name.includes('latte') || name.includes('cappuccino') ? 'espresso' :
    'vietnamese';

  return {
    id: data.id,
    name: data.name.trim(),
    price: data.price,
    imageUrl: data.imageUrl,
    stock: data.stock,
    category,
    // Không tự bịa rating, giá gốc hay badge khi backend không cung cấp.
    ...(typeof data.description === 'string' ? { description: data.description } : {}),
    ...(typeof data.badge === 'string' ? { badge: data.badge } : {}),
    ...(typeof data.rating === 'number' && Number.isFinite(data.rating) ? { rating: data.rating } : {}),
    ...(typeof data.originalPrice === 'number' && Number.isSafeInteger(data.originalPrice)
      ? { originalPrice: data.originalPrice } : {}),
  };
}

async function requestProducts(path: string): Promise<unknown> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(`${BASE_URL}${path}`, { signal: controller.signal });
    if (response.status === 404 && path.startsWith('/products/')) throw new ProductNotFoundError();
    if (!response.ok) throw new Error(`API sản phẩm lỗi HTTP ${response.status}`);
    return await response.json();
  } catch (error) {
    if (controller.signal.aborted) throw new Error('Tải sản phẩm quá thời gian cho phép');
    throw error;
  } finally {
    // Luôn hủy timeout, kể cả khi backend lỗi/JSON lỗi.
    clearTimeout(timeout);
  }
}

export async function getProducts(): Promise<Product[]> {
  const data = await requestProducts('/products');
  if (!Array.isArray(data)) throw new Error('API danh sách sản phẩm không trả mảng');
  // Danh sách [] là trạng thái trống hợp lệ, tuyệt đối không thay bằng mock.
  return data.map(normalizeProduct);
}

export async function getProduct(id: string): Promise<Product> {
  if (!/^\d+$/.test(id) || !Number.isSafeInteger(Number(id)) || Number(id) <= 0) {
    throw new ProductNotFoundError();
  }
  return normalizeProduct(await requestProducts(`/products/${id}`));
}
