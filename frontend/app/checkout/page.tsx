'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCartStore } from '@/store/cart';

function formatVnd(value: number) {
  return new Intl.NumberFormat('vi-VN', {
    style: 'currency',
    currency: 'VND',
  }).format(value);
}

export default function CheckoutPage() {
  const router = useRouter();
  const items = useCartStore((state) => state.items);
  const clear = useCartStore((state) => state.clear);

  const [paymentMethod, setPaymentMethod] = useState<'WALLET' | 'CARD'>('WALLET');
  const [isProcessing, setIsProcessing] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const total = items.reduce(
    (sum, item) => sum + item.unitPrice * item.qty,
    0,
  );

  if (items.length === 0) {
    return (
      <div style={{ maxWidth: '600px', margin: '3rem auto', textAlign: 'center' }}>
        <h1 style={{ fontSize: '1.8rem', fontWeight: 800, color: '#292524', marginBottom: '1rem' }}>
          Không có sản phẩm để thanh toán
        </h1>
        <p style={{ color: '#78716c', marginBottom: '2rem' }}>
          Giỏ hàng của bạn đang trống. Vui lòng chọn món trước khi thanh toán.
        </p>
        <Link href="/" className="btn btn-primary">
          Khám phá thực đơn
        </Link>
      </div>
    );
  }

  const handleSimulatePayment = async (shouldFail: boolean = false) => {
    setIsProcessing(true);
    setErrorMessage(null);

    // Simulate ordering and payment call
    setTimeout(() => {
      setIsProcessing(false);

      if (shouldFail) {
        // Payment Failure Rule per GUIDE-V2 C & F:
        // KEEP CART INTACT! DO NOT CLEAR CART!
        setErrorMessage('Thanh toán thất bại: Số dư tài khoản không đủ. Giỏ hàng của bạn vẫn được giữ nguyên để thử lại.');
      } else {
        // Payment Success Rule per GUIDE-V2 C & F:
        // Clear cart only AFTER payment is confirmed success!
        clear();
        const fakeOrderId = 'ORD-' + Math.floor(100000 + Math.random() * 900000);
        router.push(`/orders/${fakeOrderId}/confirmed`);
      }
    }, 50);
  };

  return (
    <div style={{ maxWidth: '800px', margin: '0 auto' }}>
      <h1 style={{ fontSize: '2rem', fontWeight: 800, color: '#292524', marginBottom: '1.5rem' }}>
        Xác Nhận & Thanh Toán
      </h1>

      {errorMessage && (
        <div
          style={{
            padding: '1rem',
            backgroundColor: '#fee2e2',
            color: '#dc2626',
            borderRadius: '8px',
            border: '1px solid #fecaca',
            marginBottom: '1.5rem',
            fontWeight: 600,
          }}
        >
          ⚠️ {errorMessage}
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 340px', gap: '2rem' }}>
        <div style={{ backgroundColor: '#fff', padding: '1.5rem', borderRadius: '12px', border: '1px solid #e7e5e4' }}>
          <h2 style={{ fontSize: '1.25rem', fontWeight: 700, marginBottom: '1rem' }}>
            Thông Tin Đơn Hàng ({items.length} món)
          </h2>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            {items.map((item, idx) => (
              <div
                key={idx}
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  paddingBottom: '0.75rem',
                  borderBottom: '1px solid #f5f5f4',
                }}
              >
                <div>
                  <div style={{ fontWeight: 700, color: '#292524' }}>
                    {item.name} × {item.qty}
                  </div>
                  <div style={{ fontSize: '0.85rem', color: '#78716c' }}>
                    Size {item.size} {item.toppings.length > 0 ? `• Topping: ${item.toppings.join(', ')}` : ''}
                  </div>
                </div>
                <div style={{ fontWeight: 600, color: '#8b4513' }}>
                  {formatVnd(item.unitPrice * item.qty)}
                </div>
              </div>
            ))}
          </div>

          <div style={{ marginTop: '1.5rem' }}>
            <h3 style={{ fontSize: '1rem', fontWeight: 700, marginBottom: '0.75rem' }}>
              Phương Thức Thanh Toán
            </h3>
            <div style={{ display: 'flex', gap: '1rem' }}>
              <label
                style={{
                  flex: 1,
                  padding: '1rem',
                  borderRadius: '8px',
                  border: paymentMethod === 'WALLET' ? '2px solid #8b4513' : '1px solid #d6d3d1',
                  cursor: 'pointer',
                  backgroundColor: paymentMethod === 'WALLET' ? '#fef7ed' : '#fff',
                }}
              >
                <input
                  type="radio"
                  name="method"
                  checked={paymentMethod === 'WALLET'}
                  onChange={() => setPaymentMethod('WALLET')}
                  style={{ marginRight: '0.5rem' }}
                />
                <strong>Ví Điện Tử (ShopWallet)</strong>
              </label>

              <label
                style={{
                  flex: 1,
                  padding: '1rem',
                  borderRadius: '8px',
                  border: paymentMethod === 'CARD' ? '2px solid #8b4513' : '1px solid #d6d3d1',
                  cursor: 'pointer',
                  backgroundColor: paymentMethod === 'CARD' ? '#fef7ed' : '#fff',
                }}
              >
                <input
                  type="radio"
                  name="method"
                  checked={paymentMethod === 'CARD'}
                  onChange={() => setPaymentMethod('CARD')}
                  style={{ marginRight: '0.5rem' }}
                />
                <strong>Thẻ Tín Dụng / Ghi Nợ</strong>
              </label>
            </div>
          </div>
        </div>

        <div style={{ backgroundColor: '#fff', padding: '1.5rem', borderRadius: '12px', border: '1px solid #e7e5e4', height: 'fit-content' }}>
          <h2 style={{ fontSize: '1.25rem', fontWeight: 700, marginBottom: '1.25rem' }}>
            Tổng Thanh Toán
          </h2>

          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem', color: '#78716c' }}>
            <span>Tạm tính</span>
            <span>{formatVnd(total)}</span>
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '1rem', color: '#78716c' }}>
            <span>Phí dịch vụ</span>
            <span>0 ₫</span>
          </div>

          <div style={{ height: '1px', background: '#e7e5e4', margin: '1rem 0' }} />

          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '1.25rem', fontWeight: 800, color: '#8b4513', marginBottom: '1.5rem' }}>
            <span>Tổng cộng</span>
            <span>{formatVnd(total)}</span>
          </div>

          <button
            type="button"
            className="btn btn-checkout"
            disabled={isProcessing}
            onClick={() => handleSimulatePayment(false)}
            style={{ width: '100%', marginBottom: '0.75rem' }}
          >
            {isProcessing ? 'Đang xử lý...' : 'Xác Nhận & Thanh Toán Thành Công'}
          </button>

          <button
            type="button"
            disabled={isProcessing}
            onClick={() => handleSimulatePayment(true)}
            style={{
              width: '100%',
              padding: '0.5rem',
              background: 'transparent',
              border: '1px dashed #dc2626',
              color: '#dc2626',
              borderRadius: '6px',
              fontSize: '0.85rem',
              cursor: 'pointer',
              fontWeight: 600,
            }}
          >
            Mô phỏng Thanh toán Thất bại (Test giữ Cart)
          </button>

          <div style={{ textAlign: 'center', marginTop: '1rem' }}>
            <Link href="/cart" style={{ color: '#78716c', fontSize: '0.875rem', textDecoration: 'none' }}>
              ← Quay lại Giỏ hàng
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
