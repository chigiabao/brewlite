'use client';

import { useEffect, useState, useMemo, useCallback } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import {
  adminApi,
  DashboardStats,
  AdminOrder,
  AdminProduct,
  AdminCoupon,
  AdminUser,
} from '@/lib/admin-api';

function formatVND(amount: number): string {
  return new Intl.NumberFormat('vi-VN', {
    style: 'currency',
    currency: 'VND',
    maximumFractionDigits: 0,
  }).format(amount);
}

const STATUS_LABELS: Record<string, { label: string; bg: string; text: string; border: string }> = {
  PENDING: { label: 'Chờ thanh toán', bg: 'bg-amber-950/60', text: 'text-amber-400', border: 'border-amber-700/50' },
  PAID: { label: 'Đã thanh toán', bg: 'bg-sky-950/60', text: 'text-sky-400', border: 'border-sky-700/50' },
  PREPARING: { label: 'Đang pha chế', bg: 'bg-indigo-950/60', text: 'text-indigo-400', border: 'border-indigo-700/50' },
  READY: { label: 'Sẵn sàng lấy', bg: 'bg-emerald-950/60', text: 'text-emerald-400', border: 'border-emerald-700/50' },
  COMPLETED: { label: 'Hoàn thành', bg: 'bg-teal-950/60', text: 'text-teal-300', border: 'border-teal-700/50' },
  CANCELLED: { label: 'Đã hủy', bg: 'bg-rose-950/60', text: 'text-rose-400', border: 'border-rose-700/50' },
  PAYMENT_FAILED: { label: 'Thanh toán lỗi', bg: 'bg-rose-950/60', text: 'text-rose-400', border: 'border-rose-700/50' },
};

export default function AdminPage() {
  const [activeTab, setActiveTab] = useState<'overview' | 'orders' | 'products' | 'coupons' | 'users'>('overview');
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  // Dữ liệu
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [orders, setOrders] = useState<AdminOrder[]>([]);
  const [products, setProducts] = useState<AdminProduct[]>([]);
  const [coupons, setCoupons] = useState<AdminCoupon[]>([]);
  const [users, setUsers] = useState<AdminUser[]>([]);

  // Bộ lọc đơn hàng
  const [orderStatusFilter, setOrderStatusFilter] = useState('ALL');
  const [orderSearch, setOrderSearch] = useState('');

  // Bộ lọc sản phẩm
  const [productSearch, setProductSearch] = useState('');

  // Modals state
  const [selectedOrder, setSelectedOrder] = useState<AdminOrder | null>(null);
  const [editingProduct, setEditingProduct] = useState<AdminProduct | null>(null);
  const [isProductModalOpen, setIsProductModalOpen] = useState(false);
  const [isCouponModalOpen, setIsCouponModalOpen] = useState(false);
  const [selectedUserForPoints, setSelectedUserForPoints] = useState<AdminUser | null>(null);

  // Form states
  const [productForm, setProductForm] = useState({ name: '', price: 35000, imageUrl: '/img/caphesua.jpg', stock: 100 });
  const [couponForm, setCouponForm] = useState({
    code: '',
    discountPercent: 10,
    discountAmount: 0,
    minOrderValue: 0,
    maxUses: 100,
    expiresAt: new Date(Date.now() + 60 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10),
  });
  const [pointsDelta, setPointsDelta] = useState(50);

  const showToast = useCallback((message: string, type: 'success' | 'error' = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3500);
  }, []);

  // Tải dữ liệu toàn bộ
  const refreshAll = useCallback(async () => {
    setLoading(true);
    try {
      const [s, o, p, c, u] = await Promise.all([
        adminApi.getStats().catch(() => null),
        adminApi.getOrders().catch(() => []),
        adminApi.getProducts().catch(() => []),
        adminApi.getCoupons().catch(() => []),
        adminApi.getUsers().catch(() => []),
      ]);
      if (s) setStats(s);
      setOrders(o);
      setProducts(p);
      setCoupons(c);
      setUsers(u);
    } catch {
      showToast('Không thể kết nối đến máy chủ API', 'error');
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  useEffect(() => {
    refreshAll();
  }, [refreshAll]);

  // Đăng nhập nhanh tài khoản Admin demo nếu chưa có token
  const handleQuickAdminLogin = async () => {
    try {
      const res = await fetch('http://localhost:3001/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'admin@brewlite.vn', password: 'password123' }),
      });
      if (!res.ok) throw new Error('Không thể đăng nhập admin');
      const data = await res.json();
      localStorage.setItem('token', data.accessToken);
      window.dispatchEvent(new Event('storage'));
      showToast('Đã cấp quyền Quản trị viên (admin@brewlite.vn)', 'success');
      refreshAll();
    } catch {
      showToast('Đăng nhập thất bại. Vui lòng kiểm tra backend', 'error');
    }
  };

  // Cập nhật trạng thái đơn hàng
  const handleUpdateOrderStatus = async (orderId: number, nextStatus: string) => {
    try {
      await adminApi.updateOrderStatus(orderId, nextStatus);
      showToast(`Đơn hàng #${orderId} đã chuyển sang: ${STATUS_LABELS[nextStatus]?.label || nextStatus}`);
      refreshAll();
      if (selectedOrder?.id === orderId) {
        setSelectedOrder(null);
      }
    } catch (err: unknown) {
      showToast(err instanceof Error ? err.message : 'Lỗi cập nhật trạng thái', 'error');
    }
  };

  // Cập nhật kho nhanh
  const handleQuickStock = async (productId: number, delta: number) => {
    try {
      await adminApi.updateStock(productId, { delta });
      showToast(`Đã ${delta > 0 ? 'nhập thêm' : 'giảm'} ${Math.abs(delta)} món vào kho`);
      refreshAll();
    } catch (err: unknown) {
      showToast(err instanceof Error ? err.message : 'Lỗi cập nhật kho', 'error');
    }
  };

  // Lưu sản phẩm (Thêm mới hoặc sửa)
  const handleSaveProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (editingProduct) {
        await adminApi.updateProduct(editingProduct.id, productForm);
        showToast(`Đã cập nhật sản phẩm "${productForm.name}" thành công!`);
      } else {
        await adminApi.createProduct(productForm);
        showToast(`Đã thêm món mới "${productForm.name}" vào thực đơn!`);
      }
      setIsProductModalOpen(false);
      setEditingProduct(null);
      refreshAll();
    } catch (err: unknown) {
      showToast(err instanceof Error ? err.message : 'Lỗi lưu sản phẩm', 'error');
    }
  };

  // Xóa sản phẩm
  const handleDeleteProduct = async (id: number, name: string) => {
    if (!confirm(`Bạn có chắc chắn muốn xóa sản phẩm "${name}"?`)) return;
    try {
      await adminApi.deleteProduct(id);
      showToast(`Đã xóa sản phẩm "${name}"`);
      refreshAll();
    } catch (err: unknown) {
      showToast(err instanceof Error ? err.message : 'Lỗi xóa sản phẩm', 'error');
    }
  };

  // Lưu mã voucher mới
  const handleSaveCoupon = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await adminApi.createCoupon(couponForm);
      showToast(`Đã tạo mã khuyến mãi "${couponForm.code.toUpperCase()}"`);
      setIsCouponModalOpen(false);
      refreshAll();
    } catch (err: unknown) {
      showToast(err instanceof Error ? err.message : 'Lỗi tạo voucher', 'error');
    }
  };

  // Bật/tắt voucher
  const handleToggleCoupon = async (code: string, currentActive: boolean) => {
    try {
      await adminApi.updateCoupon(code, { active: !currentActive });
      showToast(`Mã ${code} đã ${!currentActive ? 'KÍCH HOẠT' : 'TẠM DỪNG'}`);
      refreshAll();
    } catch (err: unknown) {
      showToast(err instanceof Error ? err.message : 'Lỗi cập nhật voucher', 'error');
    }
  };

  // Xóa voucher
  const handleDeleteCoupon = async (code: string) => {
    if (!confirm(`Xóa vĩnh viễn mã khuyến mãi ${code}?`)) return;
    try {
      await adminApi.deleteCoupon(code);
      showToast(`Đã xóa mã ${code}`);
      refreshAll();
    } catch (err: unknown) {
      showToast(err instanceof Error ? err.message : 'Lỗi xóa voucher', 'error');
    }
  };

  // Tặng điểm thưởng
  const handleAdjustPoints = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedUserForPoints) return;
    try {
      await adminApi.adjustUserPoints(selectedUserForPoints.id, pointsDelta);
      showToast(`Đã cộng ${pointsDelta} điểm thưởng cho ${selectedUserForPoints.email}`);
      setSelectedUserForPoints(null);
      refreshAll();
    } catch (err: unknown) {
      showToast(err instanceof Error ? err.message : 'Lỗi cộng điểm', 'error');
    }
  };

  // Lọc danh sách đơn hàng
  const filteredOrders = useMemo(() => {
    return orders.filter((o) => {
      const matchStatus = orderStatusFilter === 'ALL' || o.status === orderStatusFilter;
      const matchSearch =
        !orderSearch ||
        o.id.toString().includes(orderSearch.trim()) ||
        o.user?.email?.toLowerCase().includes(orderSearch.toLowerCase().trim()) ||
        (o.couponCode && o.couponCode.toLowerCase().includes(orderSearch.toLowerCase().trim()));
      return matchStatus && matchSearch;
    });
  }, [orders, orderStatusFilter, orderSearch]);

  // Lọc sản phẩm
  const filteredProducts = useMemo(() => {
    return products.filter((p) =>
      !productSearch || p.name.toLowerCase().includes(productSearch.toLowerCase().trim()),
    );
  }, [products, productSearch]);

  return (
    <div className="min-h-screen bg-[#0d0c0a] text-stone-100 font-sans selection:bg-amber-700 selection:text-white pb-20">
      {/* Toast Notification */}
      {toast && (
        <div
          className={`fixed top-6 right-6 z-50 flex items-center gap-3 px-5 py-3.5 rounded-xl shadow-2xl border backdrop-blur-md transition-all duration-300 animate-in fade-in slide-in-from-top-4 ${
            toast.type === 'success'
              ? 'bg-emerald-950/90 text-emerald-200 border-emerald-600/60 shadow-emerald-950/50'
              : 'bg-rose-950/90 text-rose-200 border-rose-600/60 shadow-rose-950/50'
          }`}
        >
          <span className="text-xl">{toast.type === 'success' ? '✨' : '⚠️'}</span>
          <p className="text-sm font-semibold">{toast.message}</p>
        </div>
      )}

      {/* Top Luxury Admin Header */}
      <div className="border-b border-amber-900/30 bg-stone-950/90 backdrop-blur-md sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-20 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="w-11 h-11 rounded-2xl bg-gradient-to-tr from-amber-600 via-amber-400 to-amber-200 p-0.5 shadow-lg shadow-amber-950/60">
              <div className="w-full h-full bg-stone-950 rounded-[14px] flex items-center justify-center">
                <span className="text-2xl">☕</span>
              </div>
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-xl font-black tracking-tight bg-gradient-to-r from-amber-100 via-amber-300 to-amber-100 bg-clip-text text-transparent">
                  BrewLite Executive Console
                </h1>
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/40 uppercase tracking-widest">
                  Admin V1
                </span>
              </div>
              <p className="text-xs text-stone-400 flex items-center gap-2 mt-0.5">
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
                Hệ thống trực tuyến • Đồng bộ CSDL PostgreSQL 16
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={refreshAll}
              disabled={loading}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-stone-900 hover:bg-stone-800 text-stone-300 text-xs font-semibold border border-stone-800 transition"
              title="Làm mới dữ liệu"
            >
              <span className={loading ? 'animate-spin' : ''}>🔄</span>
              <span>{loading ? 'Đang tải…' : 'Làm mới'}</span>
            </button>

            <button
              onClick={handleQuickAdminLogin}
              className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-950/50 hover:bg-amber-900/60 text-amber-300 text-xs font-semibold border border-amber-700/50 transition"
              title="Đăng nhập tài khoản admin@brewlite.vn"
            >
              <span>🔑</span>
              <span>Đăng nhập Admin</span>
            </button>

            <Link
              href="/"
              className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-gradient-to-r from-amber-600 to-amber-500 hover:from-amber-500 hover:to-amber-400 text-stone-950 text-xs font-bold shadow-md shadow-amber-950/40 transition hover:scale-105"
            >
              <span>🏪</span>
              <span>Cửa hàng (Storefront)</span>
            </Link>
          </div>
        </div>

        {/* Tab Navigation Menu */}
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex space-x-1 sm:space-x-2 overflow-x-auto border-t border-stone-800/60 scrollbar-none">
          {[
            { id: 'overview', label: '📊 Tổng quan', badge: null },
            {
              id: 'orders',
              label: '📦 Đơn hàng',
              badge: stats?.ordersByStatus?.PAID ? stats.ordersByStatus.PAID : null,
              badgeColor: 'bg-sky-500/20 text-sky-300 border-sky-500/30',
            },
            {
              id: 'products',
              label: '☕ Thực đơn & Kho',
              badge: stats?.lowStockCount ? `${stats.lowStockCount} cảnh báo` : null,
              badgeColor: 'bg-rose-500/20 text-rose-300 border-rose-500/30 animate-pulse',
            },
            { id: 'coupons', label: '🎟️ Mã ưu đãi', badge: coupons.length },
            { id: 'users', label: '👥 Khách hàng', badge: users.length },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={`flex items-center gap-2 py-3.5 px-4 text-xs sm:text-sm font-bold whitespace-nowrap transition-all border-b-2 ${
                activeTab === tab.id
                  ? 'border-amber-400 text-amber-300 bg-amber-950/20'
                  : 'border-transparent text-stone-400 hover:text-stone-200 hover:bg-stone-900/40'
              }`}
            >
              <span>{tab.label}</span>
              {tab.badge !== null && tab.badge !== undefined && (
                <span
                  className={`text-[10px] px-1.5 py-0.5 rounded-full border ${
                    tab.badgeColor || 'bg-stone-800 text-stone-300 border-stone-700'
                  }`}
                >
                  {tab.badge}
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 mt-8">
        {/* ============================================================== */}
        {/* TAB 1: EXECUTIVE DASHBOARD OVERVIEW */}
        {/* ============================================================== */}
        {activeTab === 'overview' && (
          <div className="space-y-8 animate-in fade-in duration-300">
            {/* Top 4 KPI Metrics */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
              {/* Card 1: Doanh thu */}
              <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-stone-900/90 via-stone-900/70 to-stone-950 p-6 border border-amber-900/30 shadow-xl shadow-black/40 group hover:border-amber-500/40 transition">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-xs font-bold uppercase tracking-wider text-amber-400/80">
                    Doanh thu thực tế
                  </span>
                  <div className="w-10 h-10 rounded-xl bg-amber-500/10 text-amber-400 flex items-center justify-center text-lg border border-amber-500/20">
                    💰
                  </div>
                </div>
                <div className="text-2xl sm:text-3xl font-black text-amber-100 tracking-tight">
                  {formatVND(stats?.totalRevenue || 0)}
                </div>
                <div className="mt-3 flex items-center justify-between text-xs text-stone-400 pt-3 border-t border-stone-800">
                  <span>Hôm nay:</span>
                  <strong className="text-emerald-400">+{formatVND(stats?.revenueToday || 0)}</strong>
                </div>
              </div>

              {/* Card 2: Đơn hàng */}
              <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-stone-900/90 via-stone-900/70 to-stone-950 p-6 border border-stone-800 shadow-xl shadow-black/40 group hover:border-sky-500/40 transition">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-xs font-bold uppercase tracking-wider text-sky-400/80">
                    Tổng đơn hàng
                  </span>
                  <div className="w-10 h-10 rounded-xl bg-sky-500/10 text-sky-400 flex items-center justify-center text-lg border border-sky-500/20">
                    📦
                  </div>
                </div>
                <div className="text-2xl sm:text-3xl font-black text-stone-100 tracking-tight">
                  {stats?.totalOrders || 0} <span className="text-sm font-normal text-stone-400">đơn</span>
                </div>
                <div className="mt-3 flex items-center justify-between text-xs text-stone-400 pt-3 border-t border-stone-800">
                  <span>Chờ pha chế:</span>
                  <strong className="text-sky-400">{stats?.ordersByStatus?.PAID || 0} đơn cần làm</strong>
                </div>
              </div>

              {/* Card 3: Sản phẩm & Tồn kho */}
              <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-stone-900/90 via-stone-900/70 to-stone-950 p-6 border border-stone-800 shadow-xl shadow-black/40 group hover:border-emerald-500/40 transition">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-xs font-bold uppercase tracking-wider text-emerald-400/80">
                    Thực đơn & Tồn kho
                  </span>
                  <div className="w-10 h-10 rounded-xl bg-emerald-500/10 text-emerald-400 flex items-center justify-center text-lg border border-emerald-500/20">
                    ☕
                  </div>
                </div>
                <div className="text-2xl sm:text-3xl font-black text-stone-100 tracking-tight">
                  {stats?.totalProducts || 0} <span className="text-sm font-normal text-stone-400">món</span>
                </div>
                <div className="mt-3 flex items-center justify-between text-xs text-stone-400 pt-3 border-t border-stone-800">
                  <span>Cảnh báo kho:</span>
                  {(stats?.lowStockCount || 0) > 0 ? (
                    <strong className="text-rose-400 animate-pulse">{stats?.lowStockCount} món sắp hết (&lt;20)</strong>
                  ) : (
                    <strong className="text-emerald-400">Dồi dào</strong>
                  )}
                </div>
              </div>

              {/* Card 4: Khách hàng */}
              <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-stone-900/90 via-stone-900/70 to-stone-950 p-6 border border-stone-800 shadow-xl shadow-black/40 group hover:border-purple-500/40 transition">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-xs font-bold uppercase tracking-wider text-purple-400/80">
                    Hội viên thân thiết
                  </span>
                  <div className="w-10 h-10 rounded-xl bg-purple-500/10 text-purple-400 flex items-center justify-center text-lg border border-purple-500/20">
                    👥
                  </div>
                </div>
                <div className="text-2xl sm:text-3xl font-black text-stone-100 tracking-tight">
                  {stats?.totalCustomers || 0} <span className="text-sm font-normal text-stone-400">khách</span>
                </div>
                <div className="mt-3 flex items-center justify-between text-xs text-stone-400 pt-3 border-t border-stone-800">
                  <span>Điểm lưu hành:</span>
                  <strong className="text-amber-400">{stats?.totalLoyaltyPoints || 0} pts</strong>
                </div>
              </div>
            </div>

            {/* Middle Section: 7-day Revenue Chart + Order Status Distribution */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* 7-day Revenue Chart */}
              <div className="lg:col-span-2 rounded-2xl bg-stone-900/70 border border-stone-800 p-6 shadow-xl flex flex-col justify-between">
                <div className="flex items-center justify-between mb-6">
                  <div>
                    <h3 className="text-base font-bold text-stone-100">Doanh thu 7 ngày gần nhất</h3>
                    <p className="text-xs text-stone-400">Xu hướng bán hàng theo ngày (VND)</p>
                  </div>
                  <span className="text-xs px-2.5 py-1 rounded bg-stone-800 border border-stone-700 text-amber-300 font-medium">
                    Thời gian thực
                  </span>
                </div>

                {/* Custom SVG / Column Visualization */}
                <div className="h-48 flex items-end justify-between gap-2 pt-6 px-2">
                  {(stats?.revenueChart || []).map((day, idx) => {
                    const maxRev = Math.max(...(stats?.revenueChart || []).map((d) => d.revenue), 100000);
                    const heightPercent = Math.max(10, Math.round((day.revenue / maxRev) * 100));
                    return (
                      <div key={idx} className="flex-1 flex flex-col items-center gap-2 group h-full justify-end">
                        <div className="text-[10px] text-stone-400 opacity-0 group-hover:opacity-100 transition whitespace-nowrap bg-stone-950 px-1.5 py-0.5 rounded border border-stone-700">
                          {formatVND(day.revenue)} ({day.orderCount} đơn)
                        </div>
                        <div
                          style={{ height: `${heightPercent}%` }}
                          className="w-full max-w-[42px] rounded-t-lg bg-gradient-to-t from-amber-700 via-amber-500 to-amber-300 group-hover:brightness-125 transition-all shadow-md shadow-amber-950/40 relative"
                        ></div>
                        <span className="text-[11px] font-semibold text-stone-400">{day.date}</span>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Order Status Breakdown */}
              <div className="rounded-2xl bg-stone-900/70 border border-stone-800 p-6 shadow-xl flex flex-col justify-between">
                <div className="mb-4">
                  <h3 className="text-base font-bold text-stone-100">Phân bổ trạng thái đơn</h3>
                  <p className="text-xs text-stone-400">Tổng quan máy trạng thái đơn hàng</p>
                </div>

                <div className="space-y-3 my-auto">
                  {Object.entries(stats?.ordersByStatus || {}).map(([st, count]) => {
                    const meta = STATUS_LABELS[st] || { label: st, bg: 'bg-stone-800', text: 'text-stone-300' };
                    const total = stats?.totalOrders || 1;
                    const percent = Math.round((count / total) * 100);
                    return (
                      <div key={st} className="space-y-1">
                        <div className="flex items-center justify-between text-xs">
                          <span className={`font-semibold ${meta.text}`}>{meta.label}</span>
                          <span className="text-stone-400 font-mono">
                            {count} đơn ({percent}%)
                          </span>
                        </div>
                        <div className="h-1.5 w-full bg-stone-800 rounded-full overflow-hidden">
                          <div
                            className={`h-full rounded-full ${
                              st === 'PAID'
                                ? 'bg-sky-400'
                                : st === 'PREPARING'
                                ? 'bg-indigo-400'
                                : st === 'READY'
                                ? 'bg-emerald-400'
                                : st === 'COMPLETED'
                                ? 'bg-teal-400'
                                : st === 'CANCELLED'
                                ? 'bg-rose-500'
                                : 'bg-amber-400'
                            }`}
                            style={{ width: `${percent}%` }}
                          ></div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* Bottom Section: Top Selling Products + Recent Orders */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* Top Selling Products */}
              <div className="rounded-2xl bg-stone-900/70 border border-stone-800 p-6 shadow-xl">
                <h3 className="text-base font-bold text-stone-100 mb-1">Món bán chạy nhất</h3>
                <p className="text-xs text-stone-400 mb-4">Xếp hạng theo tổng số ly phục vụ</p>

                <div className="space-y-3">
                  {(stats?.topSellingProducts || []).map((p, idx) => (
                    <div
                      key={p.id}
                      className="flex items-center justify-between p-2.5 rounded-xl bg-stone-950/60 border border-stone-800/80 hover:border-amber-700/50 transition"
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-6 h-6 rounded-full bg-amber-500/20 text-amber-300 text-xs font-bold flex items-center justify-center border border-amber-500/30">
                          {idx + 1}
                        </div>
                        <div className="w-10 h-10 rounded-lg overflow-hidden relative bg-stone-800 flex-shrink-0">
                          <Image
                            src={p.imageUrl || '/img/caphesua.jpg'}
                            alt={p.name}
                            fill
                            className="object-cover"
                            unoptimized
                          />
                        </div>
                        <div>
                          <h4 className="text-xs font-bold text-stone-200 line-clamp-1">{p.name}</h4>
                          <p className="text-[11px] text-amber-400 font-semibold">{formatVND(p.price)}</p>
                        </div>
                      </div>
                      <div className="text-right">
                        <span className="text-xs font-bold text-stone-100">{p.totalSold} ly</span>
                        <p className="text-[10px] text-stone-400">{formatVND(p.totalRevenue)}</p>
                      </div>
                    </div>
                  ))}
                  {(!stats?.topSellingProducts || stats.topSellingProducts.length === 0) && (
                    <p className="text-xs text-stone-500 py-6 text-center">Chưa có dữ liệu đơn hàng</p>
                  )}
                </div>
              </div>

              {/* Recent Orders Live Stream */}
              <div className="lg:col-span-2 rounded-2xl bg-stone-900/70 border border-stone-800 p-6 shadow-xl">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h3 className="text-base font-bold text-stone-100">Đơn hàng mới nhất</h3>
                    <p className="text-xs text-stone-400">Các giao dịch gần đây cần phục vụ</p>
                  </div>
                  <button
                    onClick={() => setActiveTab('orders')}
                    className="text-xs text-amber-400 hover:text-amber-300 font-semibold transition"
                  >
                    Xem tất cả đơn →
                  </button>
                </div>

                <div className="divide-y divide-stone-800/80">
                  {(stats?.recentOrders || []).map((order) => {
                    const meta = STATUS_LABELS[order.status] || {
                      label: order.status,
                      bg: 'bg-stone-800',
                      text: 'text-stone-300',
                      border: 'border-stone-700',
                    };
                    return (
                      <div
                        key={order.id}
                        className="py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:bg-stone-950/40 px-2 rounded-lg transition"
                      >
                        <div className="flex items-start gap-3">
                          <div className="w-9 h-9 rounded-xl bg-stone-800 flex items-center justify-center font-bold text-xs text-amber-300 border border-stone-700 flex-shrink-0">
                            #{order.id}
                          </div>
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="text-xs font-bold text-stone-200">
                                {order.user?.email || `Khách hàng #${order.userId}`}
                              </span>
                              <span
                                className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${meta.bg} ${meta.text} ${meta.border}`}
                              >
                                {meta.label}
                              </span>
                            </div>
                            <p className="text-[11px] text-stone-400 mt-0.5 line-clamp-1">
                              {order.items?.map((it) => `${it.qty}x ${it.product?.name} (Size ${it.size})`).join(', ')}
                            </p>
                          </div>
                        </div>

                        <div className="flex items-center justify-between sm:justify-end gap-3">
                          <span className="text-sm font-bold text-amber-300">{formatVND(order.total)}</span>

                          {/* Nút hành động nhanh theo state machine */}
                          {order.status === 'PAID' && (
                            <button
                              onClick={() => handleUpdateOrderStatus(order.id, 'PREPARING')}
                              className="px-2.5 py-1 text-xs font-bold rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white transition shadow"
                            >
                              ☕ Pha chế
                            </button>
                          )}
                          {order.status === 'PREPARING' && (
                            <button
                              onClick={() => handleUpdateOrderStatus(order.id, 'READY')}
                              className="px-2.5 py-1 text-xs font-bold rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white transition shadow"
                            >
                              🔔 Sẵn sàng
                            </button>
                          )}
                          {order.status === 'READY' && (
                            <button
                              onClick={() => handleUpdateOrderStatus(order.id, 'COMPLETED')}
                              className="px-2.5 py-1 text-xs font-bold rounded-lg bg-teal-600 hover:bg-teal-500 text-white transition shadow"
                            >
                              ✅ Hoàn tất
                            </button>
                          )}
                          <button
                            onClick={() => setSelectedOrder(order)}
                            className="text-xs px-2 py-1 rounded bg-stone-800 hover:bg-stone-700 text-stone-300 border border-stone-700 transition"
                          >
                            Chi tiết
                          </button>
                        </div>
                      </div>
                    );
                  })}
                  {(!stats?.recentOrders || stats.recentOrders.length === 0) && (
                    <p className="text-xs text-stone-500 py-8 text-center">Chưa có đơn hàng nào</p>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ============================================================== */}
        {/* TAB 2: QUẢN LÝ ĐƠN HÀNG (ORDERS MANAGER) */}
        {/* ============================================================== */}
        {activeTab === 'orders' && (
          <div className="space-y-6 animate-in fade-in duration-300">
            {/* Filter and Search Bar */}
            <div className="flex flex-col md:flex-row gap-4 justify-between items-stretch md:items-center bg-stone-900/60 p-4 rounded-2xl border border-stone-800">
              {/* Status filter pills */}
              <div className="flex items-center gap-1.5 overflow-x-auto scrollbar-none pb-2 md:pb-0">
                {[
                  { id: 'ALL', label: 'Tất cả' },
                  { id: 'PAID', label: 'Đã thanh toán (Cần pha)' },
                  { id: 'PREPARING', label: 'Đang pha chế' },
                  { id: 'READY', label: 'Sẵn sàng lấy' },
                  { id: 'COMPLETED', label: 'Hoàn thành' },
                  { id: 'PENDING', label: 'Chờ thanh toán' },
                  { id: 'CANCELLED', label: 'Đã hủy' },
                ].map((pill) => (
                  <button
                    key={pill.id}
                    onClick={() => setOrderStatusFilter(pill.id)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold transition whitespace-nowrap ${
                      orderStatusFilter === pill.id
                        ? 'bg-amber-500 text-stone-950 shadow-md shadow-amber-950/40'
                        : 'bg-stone-800/80 text-stone-400 hover:text-stone-200 hover:bg-stone-700/80'
                    }`}
                  >
                    {pill.label}
                  </button>
                ))}
              </div>

              {/* Search input */}
              <div className="relative min-w-[260px]">
                <input
                  type="text"
                  placeholder="Tìm theo Mã đơn, Email..."
                  value={orderSearch}
                  onChange={(e) => setOrderSearch(e.target.value)}
                  className="w-full bg-stone-950 border border-stone-700/80 rounded-xl px-3.5 py-2 text-xs text-stone-200 placeholder-stone-500 focus:outline-none focus:border-amber-500 transition"
                />
                {orderSearch && (
                  <button
                    onClick={() => setOrderSearch('')}
                    className="absolute right-3 top-2 text-stone-500 hover:text-stone-300 text-xs"
                  >
                    ✕
                  </button>
                )}
              </div>
            </div>

            {/* Orders Table */}
            <div className="rounded-2xl border border-stone-800 bg-stone-900/40 overflow-hidden shadow-xl">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs text-stone-300">
                  <thead className="bg-stone-950/80 uppercase text-[10px] text-stone-400 font-bold border-b border-stone-800 tracking-wider">
                    <tr>
                      <th className="py-3.5 px-4">Mã đơn</th>
                      <th className="py-3.5 px-4">Thời gian</th>
                      <th className="py-3.5 px-4">Khách hàng</th>
                      <th className="py-3.5 px-4">Chi tiết món</th>
                      <th className="py-3.5 px-4">Ưu đãi</th>
                      <th className="py-3.5 px-4">Tổng tiền</th>
                      <th className="py-3.5 px-4">Trạng thái</th>
                      <th className="py-3.5 px-4 text-right">Chuyển trạng thái</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-stone-800/60 font-medium">
                    {filteredOrders.map((order) => {
                      const meta = STATUS_LABELS[order.status] || {
                        label: order.status,
                        bg: 'bg-stone-800',
                        text: 'text-stone-300',
                        border: 'border-stone-700',
                      };
                      return (
                        <tr key={order.id} className="hover:bg-stone-900/60 transition group">
                          <td className="py-3.5 px-4 font-bold text-amber-400">#{order.id}</td>
                          <td className="py-3.5 px-4 text-stone-400 whitespace-nowrap">
                            {new Date(order.createdAt).toLocaleString('vi-VN', {
                              hour: '2-digit',
                              minute: '2-digit',
                              day: '2-digit',
                              month: '2-digit',
                            })}
                          </td>
                          <td className="py-3.5 px-4">
                            <span className="font-semibold text-stone-200 block max-w-[160px] truncate">
                              {order.user?.email || `User #${order.userId}`}
                            </span>
                            <span className="text-[10px] text-stone-500 font-mono">ID: {order.userId}</span>
                          </td>
                          <td className="py-3.5 px-4">
                            <div className="max-w-[220px] space-y-0.5">
                              {order.items?.map((it) => (
                                <div key={it.id} className="text-[11px] text-stone-300 truncate">
                                  <strong className="text-amber-400">{it.qty}x</strong> {it.product?.name} (
                                  {it.size})
                                  {it.toppings && it.toppings.length > 0 && (
                                    <span className="text-[10px] text-stone-500"> +{it.toppings.join(', ')}</span>
                                  )}
                                </div>
                              ))}
                            </div>
                          </td>
                          <td className="py-3.5 px-4 text-stone-400">
                            {order.couponCode ? (
                              <span className="px-2 py-0.5 rounded bg-amber-950/60 text-amber-300 border border-amber-800/50 text-[10px] font-bold">
                                {order.couponCode} (-{formatVND(order.discountTotal)})
                              </span>
                            ) : order.pointsRedeemed > 0 ? (
                              <span className="text-[10px] text-purple-300">
                                -{order.pointsRedeemed} điểm
                              </span>
                            ) : (
                              <span className="text-stone-600">—</span>
                            )}
                          </td>
                          <td className="py-3.5 px-4 font-bold text-stone-100 whitespace-nowrap">
                            {formatVND(order.total)}
                          </td>
                          <td className="py-3.5 px-4 whitespace-nowrap">
                            <span
                              className={`inline-block px-2.5 py-1 rounded-full text-[10px] font-bold border ${meta.bg} ${meta.text} ${meta.border}`}
                            >
                              {meta.label}
                            </span>
                          </td>
                          <td className="py-3.5 px-4 text-right whitespace-nowrap">
                            <div className="flex items-center justify-end gap-1.5">
                              {/* Máy trạng thái hợp lệ: */}
                              {order.status === 'PAID' && (
                                <button
                                  onClick={() => handleUpdateOrderStatus(order.id, 'PREPARING')}
                                  className="px-2.5 py-1 rounded bg-indigo-600 hover:bg-indigo-500 text-white text-[11px] font-bold transition shadow"
                                >
                                  ☕ Bắt đầu pha
                                </button>
                              )}
                              {order.status === 'PREPARING' && (
                                <button
                                  onClick={() => handleUpdateOrderStatus(order.id, 'READY')}
                                  className="px-2.5 py-1 rounded bg-emerald-600 hover:bg-emerald-500 text-white text-[11px] font-bold transition shadow"
                                >
                                  🔔 Sẵn sàng lấy
                                </button>
                              )}
                              {order.status === 'READY' && (
                                <button
                                  onClick={() => handleUpdateOrderStatus(order.id, 'COMPLETED')}
                                  className="px-2.5 py-1 rounded bg-teal-600 hover:bg-teal-500 text-white text-[11px] font-bold transition shadow"
                                >
                                  ✅ Hoàn tất
                                </button>
                              )}

                              {/* Cho phép hủy các đơn hợp lệ */}
                              {(order.status === 'PENDING' || order.status === 'PAID' || order.status === 'PAYMENT_FAILED') && (
                                <button
                                  onClick={() => {
                                    if (confirm(`Bạn có chắc muốn HỦY đơn hàng #${order.id}? Tồn kho sẽ được hoàn lại.`)) {
                                      handleUpdateOrderStatus(order.id, 'CANCELLED');
                                    }
                                  }}
                                  className="px-2 py-1 rounded bg-rose-950/60 hover:bg-rose-900 text-rose-300 border border-rose-800 text-[11px] font-semibold transition"
                                  title="Hủy đơn hàng"
                                >
                                  Hủy
                                </button>
                              )}

                              <button
                                onClick={() => setSelectedOrder(order)}
                                className="px-2.5 py-1 rounded bg-stone-800 hover:bg-stone-700 text-stone-200 text-[11px] font-semibold border border-stone-700 transition"
                                title="Xem hóa đơn đầy đủ"
                              >
                                👁️ Hóa đơn
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                    {filteredOrders.length === 0 && (
                      <tr>
                        <td colSpan={8} className="py-12 text-center text-stone-500">
                          Không tìm thấy đơn hàng nào phù hợp bộ lọc.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* ============================================================== */}
        {/* TAB 3: QUẢN LÝ THỰC ĐƠN & KHO HÀNG (PRODUCTS & INVENTORY) */}
        {/* ============================================================== */}
        {activeTab === 'products' && (
          <div className="space-y-6 animate-in fade-in duration-300">
            {/* Header Actions */}
            <div className="flex flex-col sm:flex-row justify-between items-stretch sm:items-center gap-4 bg-stone-900/60 p-4 rounded-2xl border border-stone-800">
              <div className="relative flex-1 max-w-md">
                <input
                  type="text"
                  placeholder="Tìm kiếm sản phẩm theo tên..."
                  value={productSearch}
                  onChange={(e) => setProductSearch(e.target.value)}
                  className="w-full bg-stone-950 border border-stone-700/80 rounded-xl px-3.5 py-2 text-xs text-stone-200 placeholder-stone-500 focus:outline-none focus:border-amber-500 transition"
                />
              </div>

              <button
                onClick={() => {
                  setEditingProduct(null);
                  setProductForm({ name: '', price: 35000, imageUrl: '/img/caphesua.jpg', stock: 100 });
                  setIsProductModalOpen(true);
                }}
                className="flex items-center justify-center gap-2 px-4 py-2 rounded-xl bg-gradient-to-r from-amber-600 to-amber-500 hover:from-amber-500 hover:to-amber-400 text-stone-950 font-bold text-xs shadow-lg shadow-amber-950/40 transition hover:scale-105"
              >
                <span>➕</span>
                <span>Thêm món mới</span>
              </button>
            </div>

            {/* Products Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
              {filteredProducts.map((product) => {
                const isLowStock = product.stock < 20;
                return (
                  <div
                    key={product.id}
                    className="rounded-2xl bg-stone-900/80 border border-stone-800 hover:border-amber-700/60 p-5 shadow-xl transition-all duration-300 flex flex-col justify-between group"
                  >
                    <div>
                      {/* Product Image Preview */}
                      <div className="w-full h-44 rounded-xl overflow-hidden relative bg-stone-950 mb-4 border border-stone-800">
                        <Image
                          src={product.imageUrl || '/img/caphesua.jpg'}
                          alt={product.name}
                          fill
                          className="object-cover group-hover:scale-105 transition-transform duration-500"
                          unoptimized
                        />
                        <div className="absolute top-2.5 left-2.5 px-2 py-0.5 rounded-md bg-stone-950/80 backdrop-blur-md text-amber-300 text-[10px] font-bold border border-amber-900/40">
                          #{product.id}
                        </div>
                        {isLowStock && (
                          <div className="absolute top-2.5 right-2.5 px-2 py-0.5 rounded-md bg-rose-600 text-white text-[10px] font-bold shadow animate-pulse">
                            ⚠️ Sắp hết hàng
                          </div>
                        )}
                      </div>

                      {/* Info */}
                      <div className="flex items-start justify-between gap-2 mb-2">
                        <h4 className="text-sm font-bold text-stone-100 group-hover:text-amber-300 transition">
                          {product.name}
                        </h4>
                        <span className="text-sm font-black text-amber-400 whitespace-nowrap">
                          {formatVND(product.price)}
                        </span>
                      </div>

                      <div className="flex items-center justify-between text-xs text-stone-400 mb-3">
                        <span>Đã phục vụ:</span>
                        <strong className="text-stone-200">{product.totalSold || 0} ly</strong>
                      </div>

                      {/* Stock Level Bar */}
                      <div className="space-y-1.5 p-3 rounded-xl bg-stone-950/80 border border-stone-800/80 mb-4">
                        <div className="flex items-center justify-between text-xs">
                          <span className="text-stone-400 font-medium">Tồn kho hiện tại:</span>
                          <span
                            className={`font-black ${
                              isLowStock ? 'text-rose-400 font-mono text-sm' : 'text-emerald-400 font-mono'
                            }`}
                          >
                            {product.stock} đơn vị
                          </span>
                        </div>
                        <div className="h-1.5 w-full bg-stone-800 rounded-full overflow-hidden">
                          <div
                            className={`h-full rounded-full transition-all ${
                              isLowStock ? 'bg-rose-500' : 'bg-emerald-500'
                            }`}
                            style={{ width: `${Math.min(100, (product.stock / 150) * 100)}%` }}
                          ></div>
                        </div>

                        {/* Quick Restock Buttons */}
                        <div className="flex items-center justify-between gap-2 pt-2 border-t border-stone-800/60">
                          <span className="text-[10px] text-stone-500 uppercase font-semibold">Nhập nhanh:</span>
                          <div className="flex gap-1.5">
                            <button
                              onClick={() => handleQuickStock(product.id, 10)}
                              className="px-2 py-0.5 rounded bg-stone-800 hover:bg-stone-700 text-stone-300 text-[10px] font-bold border border-stone-700 transition"
                            >
                              +10
                            </button>
                            <button
                              onClick={() => handleQuickStock(product.id, 50)}
                              className="px-2 py-0.5 rounded bg-stone-800 hover:bg-stone-700 text-stone-300 text-[10px] font-bold border border-stone-700 transition"
                            >
                              +50
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Action Buttons */}
                    <div className="flex items-center gap-2 pt-3 border-t border-stone-800">
                      <button
                        onClick={() => {
                          setEditingProduct(product);
                          setProductForm({
                            name: product.name,
                            price: product.price,
                            imageUrl: product.imageUrl,
                            stock: product.stock,
                          });
                          setIsProductModalOpen(true);
                        }}
                        className="flex-1 py-1.5 rounded-lg bg-stone-800 hover:bg-stone-700 text-stone-200 text-xs font-bold border border-stone-700 transition"
                      >
                        ✏️ Chỉnh sửa
                      </button>
                      <button
                        onClick={() => handleDeleteProduct(product.id, product.name)}
                        className="p-1.5 px-3 rounded-lg bg-rose-950/40 hover:bg-rose-900 text-rose-300 text-xs font-bold border border-rose-800/60 transition"
                        title="Xóa món"
                      >
                        🗑️
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ============================================================== */}
        {/* TAB 4: QUẢN LÝ MÃ KHUYẾN MÃI (COUPONS & PROMOS) */}
        {/* ============================================================== */}
        {activeTab === 'coupons' && (
          <div className="space-y-6 animate-in fade-in duration-300">
            <div className="flex justify-between items-center bg-stone-900/60 p-4 rounded-2xl border border-stone-800">
              <div>
                <h3 className="text-sm font-bold text-stone-100">Chính sách ưu đãi & Voucher</h3>
                <p className="text-xs text-stone-400">Quản lý các mã giảm giá áp dụng khi khách hàng đặt món</p>
              </div>

              <button
                onClick={() => {
                  setCouponForm({
                    code: '',
                    discountPercent: 10,
                    discountAmount: 0,
                    minOrderValue: 0,
                    maxUses: 100,
                    expiresAt: new Date(Date.now() + 60 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10),
                  });
                  setIsCouponModalOpen(true);
                }}
                className="flex items-center gap-2 px-4 py-2 rounded-xl bg-gradient-to-r from-amber-600 to-amber-500 hover:from-amber-500 hover:to-amber-400 text-stone-950 font-bold text-xs shadow-md transition hover:scale-105"
              >
                <span>➕</span>
                <span>Tạo voucher mới</span>
              </button>
            </div>

            <div className="rounded-2xl border border-stone-800 bg-stone-900/40 overflow-hidden shadow-xl">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs text-stone-300">
                  <thead className="bg-stone-950/80 uppercase text-[10px] text-stone-400 font-bold border-b border-stone-800 tracking-wider">
                    <tr>
                      <th className="py-3.5 px-4">Mã Voucher</th>
                      <th className="py-3.5 px-4">Mức giảm</th>
                      <th className="py-3.5 px-4">Đơn tối thiểu</th>
                      <th className="py-3.5 px-4">Lượt sử dụng</th>
                      <th className="py-3.5 px-4">Hạn sử dụng</th>
                      <th className="py-3.5 px-4">Trạng thái</th>
                      <th className="py-3.5 px-4 text-right">Thao tác</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-stone-800/60 font-medium">
                    {coupons.map((coupon) => (
                      <tr key={coupon.code} className="hover:bg-stone-900/60 transition">
                        <td className="py-3.5 px-4 font-mono font-black text-amber-300 text-sm">
                          {coupon.code}
                        </td>
                        <td className="py-3.5 px-4 font-bold text-stone-100">
                          {coupon.discountPercent ? (
                            <span className="text-emerald-400 font-bold">Giảm {coupon.discountPercent}%</span>
                          ) : coupon.discountAmount ? (
                            <span className="text-emerald-400 font-bold">-{formatVND(coupon.discountAmount)}</span>
                          ) : (
                            <span>Tùy chỉnh</span>
                          )}
                        </td>
                        <td className="py-3.5 px-4 text-stone-400">{formatVND(coupon.minOrderValue || 0)}</td>
                        <td className="py-3.5 px-4 text-stone-300">
                          <span className="font-bold text-amber-400">{coupon.usedCount || 0}</span> /{' '}
                          {coupon.maxUses ?? '∞'} lượt
                        </td>
                        <td className="py-3.5 px-4 text-stone-400">
                          {new Date(coupon.expiresAt).toLocaleDateString('vi-VN')}
                        </td>
                        <td className="py-3.5 px-4">
                          <span
                            className={`inline-block px-2.5 py-1 rounded-full text-[10px] font-bold border ${
                              coupon.active
                                ? 'bg-emerald-950/60 text-emerald-300 border-emerald-800'
                                : 'bg-stone-800 text-stone-400 border-stone-700'
                            }`}
                          >
                            {coupon.active ? 'Đang kích hoạt' : 'Tạm dừng'}
                          </span>
                        </td>
                        <td className="py-3.5 px-4 text-right whitespace-nowrap">
                          <div className="flex items-center justify-end gap-2">
                            <button
                              onClick={() => handleToggleCoupon(coupon.code, coupon.active)}
                              className={`px-3 py-1 rounded text-[11px] font-bold transition border ${
                                coupon.active
                                  ? 'bg-amber-950/60 hover:bg-amber-900 text-amber-300 border-amber-800'
                                  : 'bg-emerald-950/60 hover:bg-emerald-900 text-emerald-300 border-emerald-800'
                              }`}
                            >
                              {coupon.active ? 'Tạm dừng' : 'Kích hoạt'}
                            </button>
                            <button
                              onClick={() => handleDeleteCoupon(coupon.code)}
                              className="px-2.5 py-1 rounded bg-rose-950/50 hover:bg-rose-900 text-rose-300 border border-rose-800 text-[11px] font-semibold transition"
                              title="Xóa voucher"
                            >
                              Xóa
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                    {coupons.length === 0 && (
                      <tr>
                        <td colSpan={7} className="py-10 text-center text-stone-500">
                          Chưa có mã khuyến mãi nào.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* ============================================================== */}
        {/* TAB 5: QUẢN LÝ KHÁCH HÀNG & ĐIỂM THƯỞNG (USERS & LOYALTY) */}
        {/* ============================================================== */}
        {activeTab === 'users' && (
          <div className="space-y-6 animate-in fade-in duration-300">
            <div className="bg-stone-900/60 p-4 rounded-2xl border border-stone-800 flex justify-between items-center">
              <div>
                <h3 className="text-sm font-bold text-stone-100">Danh sách Khách hàng & Hội viên</h3>
                <p className="text-xs text-stone-400">
                  Xem thông tin điểm thưởng tích lũy (Loyalty) và tri ân khách hàng thân thiết
                </p>
              </div>
              <span className="text-xs px-3 py-1 rounded-full bg-purple-950/60 border border-purple-800 text-purple-300 font-bold">
                Tổng: {users.length} tài khoản
              </span>
            </div>

            <div className="rounded-2xl border border-stone-800 bg-stone-900/40 overflow-hidden shadow-xl">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs text-stone-300">
                  <thead className="bg-stone-950/80 uppercase text-[10px] text-stone-400 font-bold border-b border-stone-800 tracking-wider">
                    <tr>
                      <th className="py-3.5 px-4">Mã KH</th>
                      <th className="py-3.5 px-4">Email đăng ký</th>
                      <th className="py-3.5 px-4">Số đơn đặt</th>
                      <th className="py-3.5 px-4">Đơn thành công</th>
                      <th className="py-3.5 px-4">Tổng chi tiêu</th>
                      <th className="py-3.5 px-4">Điểm tích lũy</th>
                      <th className="py-3.5 px-4 text-right">Thao tác</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-stone-800/60 font-medium">
                    {users.map((user) => (
                      <tr key={user.id} className="hover:bg-stone-900/60 transition">
                        <td className="py-3.5 px-4 font-bold text-stone-400">#{user.id}</td>
                        <td className="py-3.5 px-4 font-semibold text-stone-100">
                          {user.email}
                          {user.email === 'admin@brewlite.vn' && (
                            <span className="ml-2 text-[10px] px-1.5 py-0.2 rounded bg-amber-500/20 text-amber-300 border border-amber-500/40 font-bold">
                              ADMIN
                            </span>
                          )}
                        </td>
                        <td className="py-3.5 px-4 text-stone-300">{user.orderCount} đơn</td>
                        <td className="py-3.5 px-4 text-emerald-400 font-bold">{user.paidOrderCount} đơn</td>
                        <td className="py-3.5 px-4 font-bold text-amber-300">{formatVND(user.totalSpent)}</td>
                        <td className="py-3.5 px-4">
                          <span className="px-2.5 py-1 rounded-full bg-purple-950/80 border border-purple-800 text-purple-300 font-mono font-bold">
                            {user.loyaltyPoints} pts
                          </span>
                        </td>
                        <td className="py-3.5 px-4 text-right">
                          <button
                            onClick={() => {
                              setSelectedUserForPoints(user);
                              setPointsDelta(50);
                            }}
                            className="px-3 py-1 rounded-lg bg-purple-900/60 hover:bg-purple-800 text-purple-200 border border-purple-700 font-bold text-xs transition"
                          >
                            🎁 Tặng điểm
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ============================================================== */}
      {/* MODAL 1: CHI TIẾT HÓA ĐƠN ĐƠN HÀNG */}
      {/* ============================================================== */}
      {selectedOrder && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in">
          <div className="w-full max-w-xl rounded-2xl bg-stone-950 border border-amber-900/40 p-6 shadow-2xl relative max-h-[90vh] overflow-y-auto">
            <button
              onClick={() => setSelectedOrder(null)}
              className="absolute top-4 right-4 text-stone-400 hover:text-white text-lg font-bold w-8 h-8 rounded-full bg-stone-900 flex items-center justify-center"
            >
              ✕
            </button>

            <div className="flex items-center gap-3 mb-6">
              <div className="w-10 h-10 rounded-xl bg-amber-500/20 text-amber-400 flex items-center justify-center text-xl font-bold border border-amber-500/40">
                🧾
              </div>
              <div>
                <h3 className="text-lg font-bold text-amber-100">Chi tiết Hóa đơn #{selectedOrder.id}</h3>
                <p className="text-xs text-stone-400">
                  Khách: {selectedOrder.user?.email || `User #${selectedOrder.userId}`} •{' '}
                  {new Date(selectedOrder.createdAt).toLocaleString('vi-VN')}
                </p>
              </div>
            </div>

            {/* Trạng thái hiện tại */}
            <div className="p-3.5 rounded-xl bg-stone-900/80 border border-stone-800 flex items-center justify-between mb-5">
              <span className="text-xs text-stone-400">Trạng thái đơn hàng:</span>
              <span
                className={`px-3 py-1 rounded-full text-xs font-bold border ${
                  STATUS_LABELS[selectedOrder.status]?.bg || 'bg-stone-800'
                } ${STATUS_LABELS[selectedOrder.status]?.text || 'text-stone-300'} ${
                  STATUS_LABELS[selectedOrder.status]?.border || 'border-stone-700'
                }`}
              >
                {STATUS_LABELS[selectedOrder.status]?.label || selectedOrder.status}
              </span>
            </div>

            {/* Danh sách món */}
            <div className="mb-5 space-y-2.5">
              <h4 className="text-xs uppercase font-bold text-stone-400 tracking-wider">Danh sách món đặt:</h4>
              <div className="divide-y divide-stone-800/80 rounded-xl bg-stone-900/40 border border-stone-800 p-3">
                {selectedOrder.items?.map((item) => (
                  <div key={item.id} className="py-2.5 flex items-center justify-between text-xs">
                    <div>
                      <strong className="text-stone-100 text-sm">
                        {item.qty}x {item.product?.name}
                      </strong>
                      <div className="text-stone-400 text-[11px] mt-0.5">
                        Size: <strong className="text-amber-400">{item.size}</strong>
                        {item.toppings && item.toppings.length > 0 && (
                          <span> • Topping: {item.toppings.join(', ')}</span>
                        )}
                      </div>
                    </div>
                    <div className="text-right">
                      <span className="font-bold text-stone-200">{formatVND(item.lineTotal)}</span>
                      <p className="text-[10px] text-stone-500">{formatVND(item.unitPrice)} / ly</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Tóm tắt thanh toán */}
            <div className="p-4 rounded-xl bg-stone-900/80 border border-stone-800 space-y-2 text-xs mb-6">
              <div className="flex justify-between text-stone-400">
                <span>Tạm tính (Subtotal):</span>
                <span>{formatVND(selectedOrder.subtotal)}</span>
              </div>
              {selectedOrder.discountTotal > 0 && (
                <div className="flex justify-between text-emerald-400">
                  <span>Giảm giá voucher ({selectedOrder.couponCode}):</span>
                  <span>-{formatVND(selectedOrder.discountTotal)}</span>
                </div>
              )}
              {selectedOrder.pointsRedeemed > 0 && (
                <div className="flex justify-between text-purple-400">
                  <span>Đổi điểm tích lũy ({selectedOrder.pointsRedeemed} pts):</span>
                  <span>-{formatVND(selectedOrder.pointsRedeemed * 1000)}</span>
                </div>
              )}
              <div className="pt-2 border-t border-stone-800 flex justify-between text-sm font-black text-amber-300">
                <span>Tổng thực thanh toán:</span>
                <span className="text-base">{formatVND(selectedOrder.total)}</span>
              </div>
            </div>

            {/* Lịch sử giao dịch Mock Payment */}
            {selectedOrder.payments && selectedOrder.payments.length > 0 && (
              <div className="mb-6 p-3 rounded-xl bg-stone-900/40 border border-stone-800/80">
                <h5 className="text-[11px] font-bold text-stone-400 uppercase mb-2">Cổng thanh toán:</h5>
                {selectedOrder.payments.map((p) => (
                  <div key={p.id} className="flex justify-between items-center text-xs text-stone-300">
                    <span>
                      {p.method} • Mã GD: <span className="font-mono text-amber-400">{p.transactionId || 'Chưa có'}</span>
                    </span>
                    <span
                      className={`font-bold ${p.status === 'SUCCEEDED' ? 'text-emerald-400' : 'text-rose-400'}`}
                    >
                      {p.status}
                    </span>
                  </div>
                ))}
              </div>
            )}

            {/* Actions chuyển trạng thái ngay trong modal */}
            <div className="flex justify-end gap-2 pt-2 border-t border-stone-800">
              {selectedOrder.status === 'PAID' && (
                <button
                  onClick={() => handleUpdateOrderStatus(selectedOrder.id, 'PREPARING')}
                  className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs shadow transition"
                >
                  ☕ Chuyển sang: Đang pha chế
                </button>
              )}
              {selectedOrder.status === 'PREPARING' && (
                <button
                  onClick={() => handleUpdateOrderStatus(selectedOrder.id, 'READY')}
                  className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs shadow transition"
                >
                  🔔 Chuyển sang: Sẵn sàng lấy
                </button>
              )}
              {selectedOrder.status === 'READY' && (
                <button
                  onClick={() => handleUpdateOrderStatus(selectedOrder.id, 'COMPLETED')}
                  className="px-4 py-2 rounded-xl bg-teal-600 hover:bg-teal-500 text-white font-bold text-xs shadow transition"
                >
                  ✅ Hoàn tất & Giao khách
                </button>
              )}
              <button
                onClick={() => setSelectedOrder(null)}
                className="px-4 py-2 rounded-xl bg-stone-800 hover:bg-stone-700 text-stone-300 font-bold text-xs transition"
              >
                Đóng
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ============================================================== */}
      {/* MODAL 2: THÊM / CHỈNH SỬA SẢN PHẨM */}
      {/* ============================================================== */}
      {isProductModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in">
          <div className="w-full max-w-md rounded-2xl bg-stone-950 border border-amber-900/40 p-6 shadow-2xl relative">
            <button
              onClick={() => setIsProductModalOpen(false)}
              className="absolute top-4 right-4 text-stone-400 hover:text-white text-lg font-bold w-8 h-8 rounded-full bg-stone-900 flex items-center justify-center"
            >
              ✕
            </button>

            <h3 className="text-lg font-bold text-amber-100 mb-1">
              {editingProduct ? 'Chỉnh sửa sản phẩm' : 'Thêm món mới vào thực đơn'}
            </h3>
            <p className="text-xs text-stone-400 mb-5">
              Cập nhật thông tin chi tiết và số lượng tồn kho nguyên liệu
            </p>

            <form onSubmit={handleSaveProduct} className="space-y-4 text-xs">
              <div>
                <label className="block text-stone-300 font-semibold mb-1">Tên món đồ uống:</label>
                <input
                  type="text"
                  required
                  placeholder="Ví dụ: Cà Phê Muối Hoàng Gia"
                  value={productForm.name}
                  onChange={(e) => setProductForm({ ...productForm, name: e.target.value })}
                  className="w-full bg-stone-900 border border-stone-700 rounded-xl px-3.5 py-2 text-stone-100 focus:outline-none focus:border-amber-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-stone-300 font-semibold mb-1">Giá bán gốc (VND):</label>
                  <input
                    type="number"
                    required
                    min={0}
                    step={1000}
                    value={productForm.price}
                    onChange={(e) => setProductForm({ ...productForm, price: Number(e.target.value) })}
                    className="w-full bg-stone-900 border border-stone-700 rounded-xl px-3.5 py-2 text-stone-100 focus:outline-none focus:border-amber-500"
                  />
                </div>
                <div>
                  <label className="block text-stone-300 font-semibold mb-1">Số lượng tồn kho:</label>
                  <input
                    type="number"
                    required
                    min={0}
                    value={productForm.stock}
                    onChange={(e) => setProductForm({ ...productForm, stock: Number(e.target.value) })}
                    className="w-full bg-stone-900 border border-stone-700 rounded-xl px-3.5 py-2 text-stone-100 focus:outline-none focus:border-amber-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-stone-300 font-semibold mb-1">Đường dẫn ảnh sản phẩm (URL/Path):</label>
                <input
                  type="text"
                  required
                  placeholder="/img/caphesua.jpg"
                  value={productForm.imageUrl}
                  onChange={(e) => setProductForm({ ...productForm, imageUrl: e.target.value })}
                  className="w-full bg-stone-900 border border-stone-700 rounded-xl px-3.5 py-2 text-stone-100 focus:outline-none focus:border-amber-500 font-mono"
                />
                <div className="flex gap-2 mt-2">
                  {['/img/caphesua.jpg', '/img/americano.jpg', '/img/cappuccino.jpg', '/img/latte.jpg', '/img/tradao.jpg', '/img/matchalatte.jpg'].map((path) => (
                    <button
                      type="button"
                      key={path}
                      onClick={() => setProductForm({ ...productForm, imageUrl: path })}
                      className="text-[10px] px-2 py-0.5 rounded bg-stone-800 text-stone-300 hover:text-amber-300"
                    >
                      {path.split('/').pop()}
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-4 border-t border-stone-800">
                <button
                  type="button"
                  onClick={() => setIsProductModalOpen(false)}
                  className="px-4 py-2 rounded-xl bg-stone-800 hover:bg-stone-700 text-stone-300 font-bold"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-xl bg-gradient-to-r from-amber-600 to-amber-500 hover:from-amber-500 hover:to-amber-400 text-stone-950 font-bold shadow-lg"
                >
                  {editingProduct ? 'Cập nhật món' : 'Tạo sản phẩm'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ============================================================== */}
      {/* MODAL 3: TẠO VOUCHER KHUYẾN MÃI MỚI */}
      {/* ============================================================== */}
      {isCouponModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in">
          <div className="w-full max-w-md rounded-2xl bg-stone-950 border border-amber-900/40 p-6 shadow-2xl relative">
            <button
              onClick={() => setIsCouponModalOpen(false)}
              className="absolute top-4 right-4 text-stone-400 hover:text-white text-lg font-bold w-8 h-8 rounded-full bg-stone-900 flex items-center justify-center"
            >
              ✕
            </button>

            <h3 className="text-lg font-bold text-amber-100 mb-1">Tạo mã Voucher khuyến mãi</h3>
            <p className="text-xs text-stone-400 mb-5">Thiết lập chương trình ưu đãi tri ân khách hàng</p>

            <form onSubmit={handleSaveCoupon} className="space-y-4 text-xs">
              <div>
                <label className="block text-stone-300 font-semibold mb-1">Mã Voucher (Code):</label>
                <input
                  type="text"
                  required
                  placeholder="Ví dụ: BREWVIP20, GIAM20"
                  value={couponForm.code}
                  onChange={(e) => setCouponForm({ ...couponForm, code: e.target.value.toUpperCase() })}
                  className="w-full bg-stone-900 border border-stone-700 rounded-xl px-3.5 py-2 text-stone-100 focus:outline-none focus:border-amber-500 font-mono font-bold uppercase"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-stone-300 font-semibold mb-1">% Giảm giá (1-100):</label>
                  <input
                    type="number"
                    min={1}
                    max={100}
                    value={couponForm.discountPercent}
                    onChange={(e) => setCouponForm({ ...couponForm, discountPercent: Number(e.target.value) })}
                    className="w-full bg-stone-900 border border-stone-700 rounded-xl px-3.5 py-2 text-stone-100 focus:outline-none focus:border-amber-500 font-bold text-amber-400"
                  />
                </div>
                <div>
                  <label className="block text-stone-300 font-semibold mb-1">Lượt dùng tối đa:</label>
                  <input
                    type="number"
                    min={1}
                    value={couponForm.maxUses}
                    onChange={(e) => setCouponForm({ ...couponForm, maxUses: Number(e.target.value) })}
                    className="w-full bg-stone-900 border border-stone-700 rounded-xl px-3.5 py-2 text-stone-100 focus:outline-none focus:border-amber-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-stone-300 font-semibold mb-1">Đơn tối thiểu (VND):</label>
                  <input
                    type="number"
                    min={0}
                    step={10000}
                    value={couponForm.minOrderValue}
                    onChange={(e) => setCouponForm({ ...couponForm, minOrderValue: Number(e.target.value) })}
                    className="w-full bg-stone-900 border border-stone-700 rounded-xl px-3.5 py-2 text-stone-100 focus:outline-none focus:border-amber-500"
                  />
                </div>
                <div>
                  <label className="block text-stone-300 font-semibold mb-1">Ngày hết hạn:</label>
                  <input
                    type="date"
                    required
                    value={couponForm.expiresAt}
                    onChange={(e) => setCouponForm({ ...couponForm, expiresAt: e.target.value })}
                    className="w-full bg-stone-900 border border-stone-700 rounded-xl px-3.5 py-2 text-stone-100 focus:outline-none focus:border-amber-500"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-4 border-t border-stone-800">
                <button
                  type="button"
                  onClick={() => setIsCouponModalOpen(false)}
                  className="px-4 py-2 rounded-xl bg-stone-800 hover:bg-stone-700 text-stone-300 font-bold"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-xl bg-gradient-to-r from-amber-600 to-amber-500 hover:from-amber-500 hover:to-amber-400 text-stone-950 font-bold shadow-lg"
                >
                  Lưu Voucher
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ============================================================== */}
      {/* MODAL 4: TẶNG / ĐIỀU CHỈNH ĐIỂM THƯỞNG KHÁCH HÀNG */}
      {/* ============================================================== */}
      {selectedUserForPoints && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in">
          <div className="w-full max-w-sm rounded-2xl bg-stone-950 border border-purple-900/40 p-6 shadow-2xl relative">
            <button
              onClick={() => setSelectedUserForPoints(null)}
              className="absolute top-4 right-4 text-stone-400 hover:text-white text-lg font-bold w-8 h-8 rounded-full bg-stone-900 flex items-center justify-center"
            >
              ✕
            </button>

            <h3 className="text-base font-bold text-purple-200 mb-1">Tặng điểm thưởng hội viên</h3>
            <p className="text-xs text-stone-400 mb-4 truncate">
              Khách hàng: <strong className="text-stone-200">{selectedUserForPoints.email}</strong>
            </p>

            <form onSubmit={handleAdjustPoints} className="space-y-4 text-xs">
              <div className="p-3 rounded-xl bg-stone-900 border border-stone-800 flex justify-between items-center">
                <span className="text-stone-400">Điểm hiện có:</span>
                <span className="font-bold text-purple-400 font-mono text-sm">
                  {selectedUserForPoints.loyaltyPoints} pts
                </span>
              </div>

              <div>
                <label className="block text-stone-300 font-semibold mb-1">Số điểm cộng thêm:</label>
                <input
                  type="number"
                  required
                  value={pointsDelta}
                  onChange={(e) => setPointsDelta(Number(e.target.value))}
                  className="w-full bg-stone-900 border border-stone-700 rounded-xl px-3.5 py-2 text-stone-100 focus:outline-none focus:border-purple-500 font-bold text-base text-purple-300"
                />
              </div>

              <div className="flex gap-2">
                {[20, 50, 100, 200].map((pts) => (
                  <button
                    type="button"
                    key={pts}
                    onClick={() => setPointsDelta(pts)}
                    className="flex-1 py-1 rounded bg-stone-800 hover:bg-stone-700 text-stone-300 font-bold text-[11px] border border-stone-700"
                  >
                    +{pts}
                  </button>
                ))}
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-stone-800">
                <button
                  type="button"
                  onClick={() => setSelectedUserForPoints(null)}
                  className="px-4 py-2 rounded-xl bg-stone-800 hover:bg-stone-700 text-stone-300 font-bold"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-xl bg-gradient-to-r from-purple-600 to-purple-500 hover:from-purple-500 hover:to-purple-400 text-white font-bold shadow-lg"
                >
                  Xác nhận cộng điểm
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
