import Link from 'next/link';

export default async function OrderConfirmedPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  return (
    <div style={{ maxWidth: '600px', margin: '3rem auto', textAlign: 'center', backgroundColor: '#fff', padding: '3rem 2rem', borderRadius: '16px', border: '1px solid #e7e5e4' }}>
      <div style={{ fontSize: '4rem', marginBottom: '1rem' }}>🎉</div>
      <h1 style={{ fontSize: '2rem', fontWeight: 800, color: '#16a34a', marginBottom: '0.5rem' }}>
        Đặt Hàng Thành Công!
      </h1>
      <p style={{ color: '#78716c', marginBottom: '1.5rem', fontSize: '1.05rem' }}>
        Mã đơn hàng của bạn là: <strong>#{id}</strong>
      </p>
      <p style={{ color: '#57534e', marginBottom: '2rem', lineHeight: '1.6' }}>
        Thanh toán đã được xác nhận. Giỏ hàng đã được làm mới tự động. Quán đang chuẩn bị món cho bạn!
      </p>

      <div style={{ display: 'flex', gap: '1rem', justifyContent: 'center' }}>
        <Link href="/" className="btn btn-primary">
          Tiếp tục đặt món
        </Link>
        <Link href="/cart" className="btn" style={{ backgroundColor: '#f5f5f4', color: '#44403c' }}>
          Kiểm tra giỏ hàng
        </Link>
      </div>
    </div>
  );
}
