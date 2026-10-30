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

export const MOCK_PRODUCTS: Product[] = [
  {
    id: 1,
    name: 'Cà phê sữa đá Sài Gòn',
    price: 35000,
    originalPrice: 42000,
    category: 'vietnamese',
    badge: 'Bán chạy nhất',
    rating: 4.9,
    description: 'Vị đắng đằm thắm của Robusta Buôn Ma Thuột hòa quyện cùng sữa đặc béo ngậy truyền thống.',
    imageUrl: 'https://images.unsplash.com/photo-1517701604599-bb29b565090c?w=600&auto=format&fit=crop&q=80',
    stock: 100,
  },
  {
    id: 2,
    name: 'Cà phê Muối Cố Đô',
    price: 38000,
    originalPrice: 45000,
    category: 'vietnamese',
    badge: 'Đặc sản Hot',
    rating: 5.0,
    description: 'Lớp kem muối sánh mịn mặn mặn béo ngậy phủ trên nền cà phê phin đậm đà thơm ngát.',
    imageUrl: 'https://images.unsplash.com/photo-1541167760496-1628856ab772?w=600&auto=format&fit=crop&q=80',
    stock: 95,
  },
  {
    id: 3,
    name: 'Bạc xỉu 3 tầng sương mai',
    price: 39000,
    category: 'vietnamese',
    badge: 'Yêu thích',
    rating: 4.8,
    description: 'Nhiều sữa ít cà phê, béo ngậy ngọt dịu thích hợp cho những ai thích vị cà phê nhẹ nhàng.',
    imageUrl: 'https://images.unsplash.com/photo-1572286258217-578f2ee18244?w=600&auto=format&fit=crop&q=80',
    stock: 80,
  },
  {
    id: 4,
    name: 'Classic Americano',
    price: 40000,
    originalPrice: 45000,
    category: 'espresso',
    badge: 'Không đường',
    rating: 4.7,
    description: 'Chiết xuất từ hạt Arabica Cầu Đất thượng hạng, hương hoa quả thanh thoát, hậu vị sạch.',
    imageUrl: 'https://images.unsplash.com/photo-1514432324607-a09d9b4aefdd?w=600&auto=format&fit=crop&q=80',
    stock: 120,
  },
  {
    id: 5,
    name: 'Caramel Macchiato Latte',
    price: 48000,
    originalPrice: 55000,
    category: 'espresso',
    badge: 'Signature',
    rating: 4.9,
    description: 'Sự hòa quyện hoàn hảo giữa espresso nồng nàn, sữa nóng đánh bọt mịn và sốt sốt caramel ngọt thơm.',
    imageUrl: 'https://images.unsplash.com/photo-1570968915860-54d5c301fa9f?w=600&auto=format&fit=crop&q=80',
    stock: 65,
  },
  {
    id: 6,
    name: 'Cappuccino Nghệ Thuật',
    price: 45000,
    category: 'espresso',
    badge: 'Thượng hạng',
    rating: 4.9,
    description: 'Lớp bọt sữa dày mịn màng vẽ latte art tinh tế, rắc chút bột quế thơm lừng.',
    imageUrl: 'https://images.unsplash.com/photo-1534778101976-62847782c213?w=600&auto=format&fit=crop&q=80',
    stock: 90,
  },
  {
    id: 7,
    name: 'Trà đào cam sả thanh nhiệt',
    price: 39000,
    originalPrice: 45000,
    category: 'tea',
    badge: 'Giải nhiệt hè',
    rating: 4.8,
    description: 'Vị trà thơm nồng thoang thoảng hương sả ấm áp, miếng đào giòn ngọt và cam tươi mọng nước.',
    imageUrl: 'https://images.unsplash.com/photo-1556679343-c7306c1976bc?w=600&auto=format&fit=crop&q=80',
    stock: 110,
  },
  {
    id: 8,
    name: 'Trà sen vàng macchiato',
    price: 45000,
    category: 'tea',
    badge: 'Mới ra mắt',
    rating: 4.9,
    description: 'Hạt sen bùi béo kết hợp trà sen ngát hương, phủ lớp milk foam phô mai mằn mặn độc đáo.',
    imageUrl: 'https://images.unsplash.com/photo-1576092768241-dec231879fc3?w=600&auto=format&fit=crop&q=80',
    stock: 75,
  },
  {
    id: 9,
    name: 'Matcha Latte Uji Nhật Bản',
    price: 49000,
    originalPrice: 59000,
    category: 'specialty',
    badge: 'Cao cấp',
    rating: 4.9,
    description: 'Bột matcha nguyên chất nhập khẩu từ vùng Uji Kyoto, vị chát thanh dịu quyện cùng sữa tươi béo ngọt.',
    imageUrl: 'https://images.unsplash.com/photo-1536256263959-770b48d82b0a?w=600&auto=format&fit=crop&q=80',
    stock: 50,
  },
  {
    id: 10,
    name: 'Cold Brew Cam Vàng Thượng Hạng',
    price: 49000,
    category: 'specialty',
    badge: 'Độc quyền',
    rating: 5.0,
    description: 'Ủ lạnh chậm suốt 16 tiếng, ít chua, vị mượt mà như rượu vang hòa cùng tinh dầu cam tươi sảng khoái.',
    imageUrl: 'https://images.unsplash.com/photo-1517701550927-30cf4ba1dba5?w=600&auto=format&fit=crop&q=80',
    stock: 40,
  },
];

function enrichProduct(p: Product): Product {
  const name = p.name.toLowerCase();
  let category: Product['category'] = 'vietnamese';
  let badge: string | undefined = undefined;
  const rating = 4.9;

  if (name.includes('americano') || name.includes('espresso') || name.includes('latte') || name.includes('cappuccino')) {
    category = 'espresso';
  } else if (name.includes('trà') || name.includes('tea')) {
    category = 'tea';
  } else if (name.includes('muối') || name.includes('cold brew') || name.includes('matcha')) {
    category = 'specialty';
  }

  if (name.includes('sữa')) badge = 'Bán chạy nhất';
  if (name.includes('americano')) badge = 'Không đường';
  if (name.includes('cappuccino')) badge = 'Thượng hạng';
  if (name.includes('trà đào')) badge = 'Giải nhiệt hè';
  if (name.includes('matcha')) badge = 'Cao cấp';

  return {
    ...p,
    category: p.category ?? category,
    badge: p.badge ?? badge,
    rating: p.rating ?? rating,
  };
}

export async function getProducts(): Promise<Product[]> {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 2500);
    const response = await fetch(`${BASE_URL}/products`, { signal: controller.signal });
    clearTimeout(timeoutId);
    if (response.ok) {
      const data = await response.json();
      if (Array.isArray(data) && data.length > 0) {
        return data.map(enrichProduct);
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
      const data = await response.json();
      return enrichProduct(data);
    }
  } catch (error) {
    console.warn(`Backend unavailable for product ${id}, using fallback mock:`, error);
  }
  const found = MOCK_PRODUCTS.find((p) => String(p.id) === String(id));
  if (found) return found;
  throw new Error(`Product with id ${id} not found`);
}


