/**
 * FOUNDATION V1 – Hợp đồng giao tiếp giữa các feature. Chủ quản: A, review bởi module liên quan.
 * Không nhập trực tiếp service/controller của feature khác; dùng các kiểu public tại đây.
 * Chỉ là type; không xử lý nghiệp vụ và không gọi DB.
 */
export type Size = 'S' | 'M' | 'L';
export type Topping = 'Trân châu' | 'Kem';
export type PayMethod = 'WALLET' | 'CARD';
export type OrderStatusV1 =
  | 'PENDING'
  | 'PAID'
  | 'PAYMENT_FAILED'
  | 'PREPARING'
  | 'READY'
  | 'COMPLETED'
  | 'CANCELLED'
  | 'REFUNDED';

export type OrderLineRequest = {
  productId: number;
  size: Size;
  toppings: Topping[];
  qty: number;
};
export type CreateOrderRequest = {
  items: OrderLineRequest[];
  couponCode?: string;
  pointsToRedeem?: number;
};
export type OrderSummary = {
  id: number;
  status: OrderStatusV1;
  subtotal: number;
  discountTotal: number;
  pointsRedeemed: number;
  total: number;
};
export type PaymentRequest = { orderId: number; method: PayMethod };
export type PaymentResult = { orderId: number; status: OrderStatusV1 };
export type CouponQuote = {
  couponCode?: string;
  couponDiscount: number;
  pointsDiscount: number;
  totalDiscount: number;
};
