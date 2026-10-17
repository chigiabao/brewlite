import Link from 'next/link';

interface Product {
  id: string;
  name: string;
  price: number;
  description: string;
  category: string;
  image: string;
}

const SAMPLE_PRODUCTS: Product[] = [
  {
    id: 'prod-1',
    name: 'Cappuccino',
    price: 35000,
    description: 'Hương vị cà phê Espresso đậm đà hòa quyện cùng lớp bọt sữa béo mịn hảo hạng.',
    category: 'Cà phê Ý',
    image: '☕',
  },
  {
    id: 'prod-2',
    name: 'Trà đào cam sả',
    price: 30000,
    description: 'Thức uống thanh mát giải nhiệt từ cốt trà thanh dịu, đào miếng giòn ngọt ngào.',
    category: 'Trà trái cây',
    image: '🍑',
  },
  {
    id: 'prod-3',
    name: 'Caramel Macchiato',
    price: 45000,
    description: 'Vị ngọt caramel quyến rũ kết hợp tinh tế cùng cà phê thơm ngậy.',
    category: 'Cà phê Ý',
    image: '🍯',
  },
  {
    id: 'prod-4',
    name: 'Matcha Latte',
    price: 40000,
    description: 'Bột trà xanh Nhật Bản nguyên chất phối hợp sữa tươi thanh trùng ngọt ngào.',
    category: 'Trà sữa & Đá xay',
    image: '🍵',
  },
];

function formatVnd(value: number) {
  return new Intl.NumberFormat('vi-VN', {
    style: 'currency',
    currency: 'VND',
  }).format(value);
}

export default function HomePage() {
  return (
    <div style={{ maxWidth: '1000px', margin: '0 auto' }}>
      <section style={{ textAlign: 'center', marginBottom: '2.5rem' }}>
        <h1 style={{ fontSize: '2.4rem', fontWeight: 800, color: '#451a03', marginBottom: '0.5rem' }}>
          Menu Đồ Uống CoffeeShop
        </h1>
        <p style={{ color: '#78716c', fontSize: '1.1rem' }}>
          Chọn món yêu thích, tùy biến size và topping theo ý muốn của bạn
        </p>
      </section>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '1.5rem' }}>
        {SAMPLE_PRODUCTS.map((product) => (
          <div
            key={product.id}
            style={{
              backgroundColor: '#fff',
              border: '1px solid #e7e5e4',
              borderRadius: '16px',
              padding: '1.5rem',
              display: 'flex',
              flexDirection: 'column',
              boxShadow: '0 2px 8px rgba(0,0,0,0.04)',
            }}
          >
            <div
              style={{
                fontSize: '3rem',
                textAlign: 'center',
                backgroundColor: '#fef7ed',
                borderRadius: '12px',
                padding: '1.5rem 0',
                marginBottom: '1rem',
              }}
            >
              {product.image}
            </div>

            <div style={{ flex: 1 }}>
              <span
                style={{
                  fontSize: '0.75rem',
                  fontWeight: 700,
                  color: '#d97706',
                  textTransform: 'uppercase',
                }}
              >
                {product.category}
              </span>
              <h2 style={{ fontSize: '1.3rem', fontWeight: 700, margin: '0.25rem 0', color: '#1c1917' }}>
                {product.name}
              </h2>
              <p style={{ fontSize: '0.875rem', color: '#78716c', marginBottom: '1rem', lineHeight: '1.4' }}>
                {product.description}
              </p>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: '1rem' }}>
              <span style={{ fontSize: '1.25rem', fontWeight: 800, color: '#8b4513' }}>
                {formatVnd(product.price)}
              </span>

              <Link
                href={`/products/${product.id}`}
                className="btn btn-primary"
                style={{ fontSize: '0.9rem', padding: '0.5rem 1rem' }}
              >
                Tùy chọn & Đặt
              </Link>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
