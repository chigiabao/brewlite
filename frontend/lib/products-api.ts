export interface Product {
  id: number;
  name: string;
  price: number;
  imageUrl: string;
  stock: number;
}

const BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

export const MOCK_PRODUCTS: Product[] = [
  {
    id: 1,
    name: 'Cà phê sữa đá',
    price: 35000,
    imageUrl: 'https://images.unsplash.com/photo-1517701604599-bb29b565090c?w=600&auto=format&fit=crop&q=80',
    stock: 100,
  },
  {
    id: 2,
    name: 'Americano',
    price: 40000,
    imageUrl: 'https://images.unsplash.com/photo-1514432324607-a09d9b4aefdd?w=600&auto=format&fit=crop&q=80',
    stock: 100,
  },
  {
    id: 3,
    name: 'Cappuccino',
    price: 45000,
    imageUrl: 'https://images.unsplash.com/photo-1534778101976-62847782c213?w=600&auto=format&fit=crop&q=80',
    stock: 100,
  },
  {
    id: 4,
    name: 'Trà đào cam sả',
    price: 39000,
    imageUrl: 'https://images.unsplash.com/photo-1556679343-c7306c1976bc?w=600&auto=format&fit=crop&q=80',
    stock: 100,
  },
  {
    id: 5,
    name: 'Cà phê Latte',
    price: 45000,
    imageUrl: 'https://images.unsplash.com/photo-1570968915860-54d5c301fa9f?w=600&auto=format&fit=crop&q=80',
    stock: 100,
  },
  {
    id: 6,
    name: 'Matcha Latte',
    price: 49000,
    imageUrl: 'https://images.unsplash.com/photo-1536256263959-770b48d82b0a?w=600&auto=format&fit=crop&q=80',
    stock: 100,
  },
];

export async function getProducts(): Promise<Product[]> {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 2500);
    const response = await fetch(`${BASE_URL}/products`, { signal: controller.signal });
    clearTimeout(timeoutId);
    if (response.ok) {
      const data = await response.json();
      if (Array.isArray(data) && data.length > 0) {
        return data;
      }
    }
  } catch (error) {
    console.warn('Backend unavailable, using fallback mock menu:', error);
  }
  return MOCK_PRODUCTS;
}

export async function getProduct(id: string): Promise<Product> {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 2500);
    const response = await fetch(`${BASE_URL}/products/${id}`, { signal: controller.signal });
    clearTimeout(timeoutId);
    if (response.ok) {
      return await response.json();
    }
  } catch (error) {
    console.warn(`Backend unavailable for product ${id}, using fallback mock:`, error);
  }
  const found = MOCK_PRODUCTS.find((p) => String(p.id) === String(id));
  if (found) return found;
  throw new Error(`Product with id ${id} not found`);
}

