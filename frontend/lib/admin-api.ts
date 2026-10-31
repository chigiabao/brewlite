import { api } from './api';

export interface DashboardStats {
  totalRevenue: number;
  revenueToday: number;
  totalOrders: number;
  ordersByStatus: Record<string, number>;
  totalProducts: number;
  lowStockCount: number;
  totalCustomers: number;
  totalLoyaltyPoints: number;
  revenueChart: { date: string; revenue: number; orderCount: number }[];
  recentOrders: AdminOrder[];
  topSellingProducts: {
    id: number;
    name: string;
    imageUrl: string;
    price: number;
    totalSold: number;
    totalRevenue: number;
  }[];
}

export interface AdminOrderItem {
  id: number;
  productId: number;
  product: { id: number; name: string; imageUrl: string };
  size: string;
  toppings: string[];
  qty: number;
  unitPrice: number;
  lineTotal: number;
}

export interface AdminOrder {
  id: number;
  userId: number;
  user: { id: number; email: string; loyaltyPoints: number };
  status: string;
  subtotal: number;
  discountTotal: number;
  pointsRedeemed: number;
  total: number;
  couponCode: string | null;
  createdAt: string;
  items: AdminOrderItem[];
  payments?: {
    id: number;
    method: string;
    status: string;
    amount?: number;
    transactionId: string | null;
    createdAt: string;
  }[];
}

export interface AdminProduct {
  id: number;
  name: string;
  price: number;
  imageUrl: string;
  stock: number;
  version: number;
  totalSold?: number;
}

export interface AdminCoupon {
  code: string;
  discountPercent: number | null;
  discountAmount: number | null;
  minOrderValue: number;
  maxUses: number | null;
  usedCount: number;
  expiresAt: string;
  active: boolean;
  _count?: { orders: number };
}

export interface AdminUser {
  id: number;
  email: string;
  loyaltyPoints: number;
  orderCount: number;
  paidOrderCount: number;
  totalSpent: number;
}

export const adminApi = {
  getStats: () => api<DashboardStats>('/admin/stats'),

  getOrders: (status?: string, search?: string) => {
    const params = new URLSearchParams();
    if (status && status !== 'ALL') params.append('status', status);
    if (search) params.append('search', search);
    const qs = params.toString() ? `?${params.toString()}` : '';
    return api<AdminOrder[]>(`/admin/orders${qs}`);
  },

  updateOrderStatus: (orderId: number, status: string) =>
    api<AdminOrder>(`/admin/orders/${orderId}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ status }),
    }),

  getProducts: () => api<AdminProduct[]>('/admin/products'),

  createProduct: (data: { name: string; price: number; imageUrl: string; stock?: number }) =>
    api<AdminProduct>('/admin/products', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  updateProduct: (
    id: number,
    data: { name?: string; price?: number; imageUrl?: string; stock?: number },
  ) =>
    api<AdminProduct>(`/admin/products/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),

  updateStock: (id: number, payload: { stock?: number; delta?: number }) =>
    api<AdminProduct>(`/admin/products/${id}/stock`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    }),

  deleteProduct: (id: number) =>
    api<{ id: number }>(`/admin/products/${id}`, {
      method: 'DELETE',
    }),

  getCoupons: () => api<AdminCoupon[]>('/admin/coupons'),

  createCoupon: (data: {
    code: string;
    discountPercent?: number;
    discountAmount?: number;
    minOrderValue?: number;
    maxUses?: number;
    expiresAt?: string;
    active?: boolean;
  }) =>
    api<AdminCoupon>('/admin/coupons', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  updateCoupon: (
    code: string,
    data: {
      active?: boolean;
      discountPercent?: number;
      discountAmount?: number;
      minOrderValue?: number;
      maxUses?: number;
      expiresAt?: string;
    },
  ) =>
    api<AdminCoupon>(`/admin/coupons/${code}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    }),

  deleteCoupon: (code: string) =>
    api<{ code: string }>(`/admin/coupons/${code}`, {
      method: 'DELETE',
    }),

  getUsers: () => api<AdminUser[]>('/admin/users'),

  adjustUserPoints: (id: number, pointsDelta: number) =>
    api<AdminUser>(`/admin/users/${id}/points`, {
      method: 'PATCH',
      body: JSON.stringify({ pointsDelta }),
    }),
};
