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
  REFUNDED: { label: 'Đã hoàn tiền', bg: 'bg-purple-950/60', text: 'text-purple-300', border: 'border-purple-700/50' },
  PAYMENT_FAILED: { label: 'Thanh toán lỗi', bg: 'bg-rose-950/60', text: 'text-rose-400', border: 'border-rose-700/50' },
};

function parseJwtEmail(token: string | null): string | null {
  if (!token) return null;
  try {
    const parts = token.split('.');
    if (parts.length === 3) {
      const base64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
      const json = decodeURIComponent(
        atob(base64)
          .split('')
          .map((c) => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
          .join(''),
      );
      const parsed = JSON.parse(json);
      return parsed.email || null;
    }
  } catch {
    return null;
  }
  return null;
}

export default function AdminPage() {
  const [activeTab, setActiveTab] = useState<'overview' | 'orders' | 'products' | 'coupons' | 'users'>('overview');
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  // Authentication State
  const [currentUserEmail, setCurrentUserEmail] = useState<string | null>(null);

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
  const [stockFilter, setStockFilter] = useState<'ALL' | 'LOW' | 'NORMAL'>('ALL');

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

  // Kiểm tra tài khoản đăng nhập hiện tại
  useEffect(() => {
    const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null;
    const email = parseJwtEmail(token);
    setCurrentUserEmail(email);
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

  // Đăng nhập nhanh tài khoản Admin demo
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
      setCurrentUserEmail('admin@brewlite.vn');
      showToast('Đã cấp quyền Quản trị viên (admin@brewlite.vn)', 'success');
      refreshAll();
    } catch {
      showToast('Đăng nhập thất bại. Vui lòng kiểm tra backend', 'error');
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('token');
    window.dispatchEvent(new Event('storage'));
    setCurrentUserEmail(null);
    showToast('Đã đăng xuất tài khoản quản trị');
  };

  // Cập nhật trạng thái đơn hàng (State machine)
  const handleUpdateOrderStatus = async (orderId: number, nextStatus: string) => {
    try {
      await adminApi.updateOrderStatus(orderId, nextStatus);
      showToast(`Đơn hàng #${orderId} ➔ ${STATUS_LABELS[nextStatus]?.label || nextStatus}`);
      refreshAll();
      if (selectedOrder?.id === orderId) {
        setSelectedOrder((prev) => (prev ? { ...prev, status: nextStatus } : null));
      }
    } catch (err: unknown) {
      showToast(err instanceof Error ? err.message : 'Lỗi cập nhật trạng thái', 'error');
    }
  };

  // Cập nhật tồn kho nhanh
  const handleQuickStock = async (productId: number, delta: number) => {
    try {
      await adminApi.updateStock(productId, { delta });
      showToast(`Đã ${delta > 0 ? 'nhập thêm' : 'xuất'} ${Math.abs(delta)} món vào kho`);
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
        showToast(`Đã cập nhật món "${productForm.name}" thành công!`);
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

  // Xóa sản phẩm (An toàn dữ liệu)
  const handleDeleteProduct = async (id: number, name: string) => {
    if (!confirm(`Bạn có chắc muốn xóa sản phẩm "${name}"?`)) return;
    try {
      await adminApi.deleteProduct(id);
      showToast(`Đã cập nhật sản phẩm "${name}"`);
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
      showToast(`Đã tạo mã ưu đãi "${couponForm.code.toUpperCase()}" thành công!`);
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

  // Xóa voucher an toàn
  const handleDeleteCoupon = async (code: string) => {
    if (!confirm(`Xác nhận xóa hoặc tạm dừng mã khuyến mãi ${code}?`)) return;
    try {
      await adminApi.deleteCoupon(code);
      showToast(`Đã xử lý mã ${code}`);
      refreshAll();
    } catch (err: unknown) {
      showToast(err instanceof Error ? err.message : 'Lỗi xóa voucher', 'error');
    }
  };

  // Tặng/trừ điểm thưởng
  const handleAdjustPoints = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedUserForPoints) return;
    try {
      await adminApi.adjustUserPoints(selectedUserForPoints.id, pointsDelta);
      showToast(
        `Đã ${pointsDelta >= 0 ? 'cộng' : 'trừ'} ${Math.abs(pointsDelta)} điểm cho ${selectedUserForPoints.email}`,
      );
      setSelectedUserForPoints(null);
      refreshAll();
    } catch (err: unknown) {
      showToast(err instanceof Error ? err.message : 'Lỗi điều chỉnh điểm', 'error');
    }
  };

  // Lọc danh sách đơn hàng
  const filteredOrders = useMemo(() => {
    return orders.filter((o) => {
      let matchStatus = true;
      if (orderStatusFilter === 'NEED_ACTION') {
        matchStatus = o.status === 'PAID' || o.status === 'PREPARING';
      } else if (orderStatusFilter !== 'ALL') {
        matchStatus = o.status === orderStatusFilter;
      }

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
    return products.filter((p) => {
      const matchSearch = !productSearch || p.name.toLowerCase().includes(productSearch.toLowerCase().trim());
      const matchStock =
        stockFilter === 'ALL' ||
        (stockFilter === 'LOW' && p.stock < 20) ||
        (stockFilter === 'NORMAL' && p.stock >= 20);
      return matchSearch && matchStock;
    });
  }, [products, productSearch, stockFilter]);

  // Đơn hàng cần pha chế gấp
  const pendingActionOrders = useMemo(() => {
    return orders.filter((o) => o.status === 'PAID' || o.status === 'PREPARING');
  }, [orders]);

  // Tính toán biểu đồ doanh thu
  const maxChartRevenue = useMemo(() => {
    const values = (stats?.revenueChart || []).map((d) => d.revenue);
    return Math.max(...values, 500000);
  }, [stats]);

  return (
    <div className="min-h-screen bg-[#0a0908] text-stone-100 font-sans selection:bg-amber-700 selection:text-white pb-24">
      {/* Toast Notification */}
      {toast && (
        <div
          className={`fixed top-6 right-6 z-50 flex items-center gap-3 px-5 py-3.5 rounded-xl shadow-2xl border backdrop-blur-md transition-all duration-300 animate-in fade-in slide-in-from-top-4 ${
            toast.type === 'success'
              ? 'bg-emerald-950/95 text-emerald-200 border-emerald-500/60 shadow-emerald-950/60'
              : 'bg-rose-950/95 text-rose-200 border-rose-500/60 shadow-rose-950/60'
          }`}
        >
          <span className="text-xl">{toast.type === 'success' ? '✨' : '⚠️'}</span>
          <p className="text-sm font-semibold">{toast.message}</p>
        </div>
      )}

      {/* ============================================================== */}
      {/* EXECUTIVE TOP BAR (Single Unified Admin Header) */}
      {/* ============================================================== */}
      <header className="border-b border-amber-900/30 bg-stone-950/95 backdrop-blur-md sticky top-0 z-40 shadow-xl shadow-black/40">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-20 flex items-center justify-between gap-4">
          {/* Logo & System Brand */}
          <div className="flex items-center gap-3.5">
            <div className="w-11 h-11 rounded-2xl bg-gradient-to-tr from-amber-600 via-amber-400 to-amber-200 p-0.5 shadow-lg shadow-amber-950/60">
              <div className="w-full h-full bg-stone-950 rounded-[14px] flex items-center justify-center">
                <span className="text-2xl">☕</span>
              </div>
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xl font-black tracking-tight bg-gradient-to-r from-amber-100 via-amber-300 to-amber-100 bg-clip-text text-transparent">
                  BrewLite Executive Suite
                </span>
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/40 uppercase tracking-widest">
                  ADMIN PRO
                </span>
              </div>
              <p className="text-xs text-stone-400 flex items-center gap-2 mt-0.5">
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
                Hệ thống trực tuyến • PostgreSQL 16 • Đồng bộ thời gian thực
              </p>
            </div>
          </div>

          {/* User Session & Quick Tools */}
          <div className="flex items-center gap-3">
            {/* User status */}
            {currentUserEmail === 'admin@brewlite.vn' ? (
              <div className="hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-xl bg-stone-900/90 border border-amber-700/40 text-xs">
                <span className="w-2 h-2 rounded-full bg-amber-400"></span>
                <span className="text-stone-300 font-medium">Quản trị viên:</span>
                <strong className="text-amber-300 font-mono">admin@brewlite.vn</strong>
                <button
                  onClick={handleLogout}
                  className="ml-1 text-[11px] text-stone-400 hover:text-rose-400 transition"
                  title="Đăng xuất"
                >
                  [Thoát]
                </button>
              </div>
            ) : currentUserEmail ? (
              <div className="hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-xl bg-amber-950/40 border border-amber-800 text-xs">
                <span className="text-stone-300">Tài khoản:</span>
                <strong className="text-amber-300 truncate max-w-[120px]">{currentUserEmail}</strong>
                <button
                  onClick={handleQuickAdminLogin}
                  className="ml-1 text-[11px] text-amber-400 hover:text-amber-200 underline font-semibold"
                >
                  Đổi sang Admin
                </button>
              </div>
            ) : (
              <button
                onClick={handleQuickAdminLogin}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-amber-950/60 hover:bg-amber-900/80 text-amber-300 text-xs font-bold border border-amber-700/60 transition shadow-sm"
              >
                <span>🔑</span>
                <span>Đăng nhập Admin</span>
              </button>
            )}

            {/* Refresh Button */}
            <button
              onClick={refreshAll}
              disabled={loading}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-stone-900 hover:bg-stone-800 text-stone-300 text-xs font-semibold border border-stone-800 transition shadow"
              title="Tải lại toàn bộ dữ liệu CSDL"
            >
              <span className={loading ? 'animate-spin' : ''}>🔄</span>
              <span className="hidden md:inline">{loading ? 'Đang tải…' : 'Làm mới'}</span>
            </button>

            {/* Storefront Link */}
            <Link
              href="/"
              className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-gradient-to-r from-amber-600 via-amber-500 to-amber-600 hover:brightness-110 text-stone-950 text-xs font-black shadow-lg shadow-amber-950/50 transition hover:scale-105"
            >
              <span>🏪</span>
              <span>Cửa hàng (Storefront)</span>
            </Link>
          </div>
        </div>

        {/* Executive Tab Navigation Bar */}
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex space-x-1 sm:space-x-2 overflow-x-auto border-t border-stone-800/80 scrollbar-none">
          {[
            { id: 'overview', label: '📊 Tổng quan', badge: null },
            {
              id: 'orders',
              label: '📦 Đơn hàng',
              badge: pendingActionOrders.length > 0 ? `${pendingActionOrders.length} cần làm` : orders.length,
              badgeColor:
                pendingActionOrders.length > 0
                  ? 'bg-amber-500/20 text-amber-300 border-amber-500/40 animate-pulse font-black'
                  : 'bg-stone-800 text-stone-400 border-stone-700',
            },
            {
              id: 'products',
              label: '☕ Thực đơn & Kho',
              badge: stats?.lowStockCount ? `⚠️ ${stats.lowStockCount} sắp hết` : `${products.length} món`,
              badgeColor:
                stats?.lowStockCount && stats.lowStockCount > 0
                  ? 'bg-rose-500/20 text-rose-300 border-rose-500/40 animate-pulse'
                  : 'bg-stone-800 text-stone-400 border-stone-700',
            },
            { id: 'coupons', label: '🎟️ Mã khuyến mãi', badge: `${coupons.length} mã` },
            { id: 'users', label: '👥 Khách hàng', badge: `${users.length} khách` },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={`flex items-center gap-2 py-3.5 px-4 text-xs sm:text-sm font-bold whitespace-nowrap transition-all border-b-2 ${
                activeTab === tab.id
                  ? 'border-amber-400 text-amber-300 bg-amber-950/30'
                  : 'border-transparent text-stone-400 hover:text-stone-200 hover:bg-stone-900/40'
              }`}
            >
              <span>{tab.label}</span>
              {tab.badge !== null && tab.badge !== undefined && (
                <span
                  className={`text-[10px] px-2 py-0.5 rounded-full border ${
                    tab.badgeColor || 'bg-stone-800 text-stone-400 border-stone-700'
                  }`}
                >
                  {tab.badge}
                </span>
              )}
            </button>
          ))}
        </div>
      </header>

      {/* Main Container */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 mt-8">
        {/* ============================================================== */}
        {/* TAB 1: EXECUTIVE DASHBOARD OVERVIEW */}
        {/* ============================================================== */}
        {activeTab === 'overview' && (
          <div className="space-y-8 animate-in fade-in duration-300">
            {/* Top 4 Hero KPI Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
              {/* Card 1: Doanh thu */}
              <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-stone-900/90 via-stone-900/60 to-stone-950 p-6 border border-amber-900/40 shadow-xl shadow-black/40 group hover:border-amber-500/50 transition">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-xs font-bold uppercase tracking-wider text-amber-400/90">
                    Doanh thu tích lũy
                  </span>
                  <div className="w-10 h-10 rounded-xl bg-amber-500/10 text-amber-400 flex items-center justify-center text-lg border border-amber-500/20 shadow">
                    💰
                  </div>
                </div>
                <div className="text-2xl sm:text-3xl font-black text-amber-100 tracking-tight">
                  {formatVND(stats?.totalRevenue || 0)}
                </div>
                <div className="mt-4 flex items-center justify-between text-xs text-stone-400 pt-3 border-t border-stone-800/80">
                  <span>Hôm nay:</span>
                  <strong className={stats?.revenueToday ? 'text-emerald-400' : 'text-stone-400'}>
                    +{formatVND(stats?.revenueToday || 0)}
                  </strong>
                </div>
              </div>

              {/* Card 2: Đơn hàng */}
              <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-stone-900/90 via-stone-900/60 to-stone-950 p-6 border border-stone-800 shadow-xl shadow-black/40 group hover:border-sky-500/50 transition">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-xs font-bold uppercase tracking-wider text-sky-400/90">
                    Tổng đơn hàng
                  </span>
                  <div className="w-10 h-10 rounded-xl bg-sky-500/10 text-sky-400 flex items-center justify-center text-lg border border-sky-500/20 shadow">
                    📦
                  </div>
                </div>
                <div className="text-2xl sm:text-3xl font-black text-stone-100 tracking-tight">
                  {stats?.totalOrders || 0} <span className="text-sm font-normal text-stone-400">đơn</span>
                </div>
                <div className="mt-4 flex items-center justify-between text-xs text-stone-400 pt-3 border-t border-stone-800/80">
                  <span>Cần xử lý pha chế:</span>
                  <strong className="text-sky-400 font-bold">
                    {stats?.ordersByStatus?.PAID || 0} đơn chờ pha
                  </strong>
                </div>
              </div>

              {/* Card 3: Sản phẩm & Tồn kho */}
              <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-stone-900/90 via-stone-900/60 to-stone-950 p-6 border border-stone-800 shadow-xl shadow-black/40 group hover:border-emerald-500/50 transition">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-xs font-bold uppercase tracking-wider text-emerald-400/90">
                    Thực đơn & Tồn kho
                  </span>
                  <div className="w-10 h-10 rounded-xl bg-emerald-500/10 text-emerald-400 flex items-center justify-center text-lg border border-emerald-500/20 shadow">
                    ☕
                  </div>
                </div>
                <div className="text-2xl sm:text-3xl font-black text-stone-100 tracking-tight">
                  {stats?.totalProducts || 0} <span className="text-sm font-normal text-stone-400">món</span>
                </div>
                <div className="mt-4 flex items-center justify-between text-xs text-stone-400 pt-3 border-t border-stone-800/80">
                  <span>Cảnh báo kho:</span>
                  {(stats?.lowStockCount || 0) > 0 ? (
                    <strong className="text-rose-400 animate-pulse font-bold">
                      {stats?.lowStockCount} món sắp hết (&lt;20)
                    </strong>
                  ) : (
                    <strong className="text-emerald-400">Tồn kho dồi dào</strong>
                  )}
                </div>
              </div>

              {/* Card 4: Khách hàng */}
              <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-stone-900/90 via-stone-900/60 to-stone-950 p-6 border border-stone-800 shadow-xl shadow-black/40 group hover:border-purple-500/50 transition">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-xs font-bold uppercase tracking-wider text-purple-400/90">
                    Khách hàng & Hội viên
                  </span>
                  <div className="w-10 h-10 rounded-xl bg-purple-500/10 text-purple-400 flex items-center justify-center text-lg border border-purple-500/20 shadow">
                    👥
                  </div>
                </div>
                <div className="text-2xl sm:text-3xl font-black text-stone-100 tracking-tight">
                  {stats?.totalCustomers || 0} <span className="text-sm font-normal text-stone-400">khách</span>
                </div>
                <div className="mt-4 flex items-center justify-between text-xs text-stone-400 pt-3 border-t border-stone-800/80">
                  <span>Điểm thưởng lưu hành:</span>
                  <strong className="text-amber-400 font-mono">{stats?.totalLoyaltyPoints || 0} pts</strong>
                </div>
              </div>
            </div>

            {/* Middle Section: Enhanced 7-day Revenue Chart + Order State Machine Funnel */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* 7-day Revenue Chart */}
              <div className="lg:col-span-2 rounded-2xl bg-stone-900/70 border border-stone-800 p-6 shadow-xl flex flex-col justify-between">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h3 className="text-base font-bold text-stone-100 flex items-center gap-2">
                      <span>📈 Doanh thu 7 ngày gần nhất</span>
                    </h3>
                    <p className="text-xs text-stone-400">Xu hướng ghi nhận doanh thu theo ngày giao dịch</p>
                  </div>
                  <span className="text-xs px-2.5 py-1 rounded-lg bg-stone-800 border border-stone-700 text-amber-300 font-medium">
                    Cập nhật tự động
                  </span>
                </div>

                {/* Modern Visual Chart with Gridlines & Y-Axis */}
                <div className="relative pt-6 pb-2">
                  {/* Dotted Grid lines */}
                  <div className="absolute inset-0 flex flex-col justify-between pointer-events-none opacity-20 pb-8 pt-6">
                    <div className="border-b border-dashed border-stone-400 w-full"></div>
                    <div className="border-b border-dashed border-stone-400 w-full"></div>
                    <div className="border-b border-dashed border-stone-400 w-full"></div>
                  </div>

                  {/* Columns */}
                  <div className="h-52 flex items-end justify-between gap-3 px-2 z-10 relative">
                    {(stats?.revenueChart || []).map((day, idx) => {
                      const heightPercent =
                        day.revenue > 0 ? Math.min(100, Math.max(15, Math.round((day.revenue / maxChartRevenue) * 100))) : 4;

                      return (
                        <div key={idx} className="flex-1 flex flex-col items-center gap-2 group h-full justify-end">
                          {/* Value tag on top */}
                          {day.revenue > 0 ? (
                            <span className="text-[10px] font-bold text-amber-300 bg-amber-950/90 px-1.5 py-0.5 rounded border border-amber-700/60 shadow group-hover:scale-110 transition whitespace-nowrap">
                              {formatVND(day.revenue)}
                            </span>
                          ) : (
                            <span className="text-[10px] text-stone-600 opacity-0 group-hover:opacity-100 transition">
                              0 đ
                            </span>
                          )}

                          {/* Bar */}
                          <div
                            style={{ height: `${heightPercent}%` }}
                            className={`w-full max-w-[46px] rounded-t-xl transition-all duration-300 relative ${
                              day.revenue > 0
                                ? 'bg-gradient-to-t from-amber-700 via-amber-500 to-amber-300 shadow-lg shadow-amber-950/60 group-hover:brightness-125'
                                : 'bg-stone-800/80 rounded-full'
                            }`}
                          ></div>

                          {/* Day label */}
                          <span className="text-[11px] font-bold text-stone-400 group-hover:text-amber-300 transition whitespace-nowrap">
                            {day.label}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>

                <div className="mt-4 pt-3 border-t border-stone-800/80 flex items-center justify-between text-xs text-stone-400">
                  <span>
                    Tổng tuần: <strong>{formatVND(stats?.totalRevenue || 0)}</strong>
                  </span>
                  <span>
                    Đơn hàng cao nhất: <strong>{formatVND(maxChartRevenue)}</strong>
                  </span>
                </div>
              </div>

              {/* Order Status Funnel & Breakdown */}
              <div className="rounded-2xl bg-stone-900/70 border border-stone-800 p-6 shadow-xl flex flex-col justify-between">
                <div>
                  <h3 className="text-base font-bold text-stone-100 mb-1">Quy trình đơn hàng</h3>
                  <p className="text-xs text-stone-400 mb-5">Phân bổ trạng thái theo máy trạng thái</p>
                </div>

                <div className="space-y-3.5 my-auto">
                  {Object.entries(stats?.ordersByStatus || {}).map(([st, count]) => {
                    const meta = STATUS_LABELS[st] || { label: st, bg: 'bg-stone-800', text: 'text-stone-300' };
                    const total = stats?.totalOrders || 1;
                    const percent = Math.round((count / total) * 100);
                    return (
                      <div key={st} className="space-y-1">
                        <div className="flex items-center justify-between text-xs">
                          <span className={`font-bold flex items-center gap-1.5 ${meta.text}`}>
                            <span className="w-1.5 h-1.5 rounded-full bg-current"></span>
                            {meta.label}
                          </span>
                          <span className="text-stone-400 font-mono text-xs">
                            <strong className="text-stone-200">{count}</strong> ({percent}%)
                          </span>
                        </div>
                        <div className="h-2 w-full bg-stone-950 rounded-full overflow-hidden border border-stone-800/60">
                          <div
                            className={`h-full rounded-full transition-all duration-500 ${
                              st === 'PAID'
                                ? 'bg-sky-400'
                                : st === 'PREPARING'
                                ? 'bg-indigo-400'
                                : st === 'READY'
                                ? 'bg-emerald-400'
                                : st === 'COMPLETED'
                                ? 'bg-teal-400'
                                : st === 'REFUNDED'
                                ? 'bg-purple-400'
                                : st === 'CANCELLED'
                                ? 'bg-rose-500'
                                : 'bg-amber-400'
                            }`}
                            style={{ width: `${Math.max(count > 0 ? 8 : 0, percent)}%` }}
                          ></div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* Bottom Section: Top Products & Quick Orders Stream */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* Top Selling Products */}
              <div className="rounded-2xl bg-stone-900/70 border border-stone-800 p-6 shadow-xl">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h3 className="text-base font-bold text-stone-100">Top món bán chạy</h3>
                    <p className="text-xs text-stone-400">Xếp hạng theo tổng số lượng ly phục vụ</p>
                  </div>
                  <button
                    onClick={() => setActiveTab('products')}
                    className="text-xs text-amber-400 hover:text-amber-300 font-semibold transition"
                  >
                    Kho món →
                  </button>
                </div>

                <div className="space-y-3">
                  {(stats?.topSellingProducts || []).map((p, idx) => (
                    <div
                      key={p.id}
                      className="flex items-center justify-between p-3 rounded-xl bg-stone-950/70 border border-stone-800/80 hover:border-amber-700/50 transition group"
                    >
                      <div className="flex items-center gap-3">
                        <div
                          className={`w-7 h-7 rounded-lg text-xs font-black flex items-center justify-center border shadow ${
                            idx === 0
                              ? 'bg-amber-500 text-stone-950 border-amber-400'
                              : idx === 1
                              ? 'bg-stone-300 text-stone-950 border-stone-200'
                              : idx === 2
                              ? 'bg-amber-800 text-amber-100 border-amber-700'
                              : 'bg-stone-800 text-stone-400 border-stone-700'
                          }`}
                        >
                          #{idx + 1}
                        </div>
                        <div className="w-11 h-11 rounded-lg overflow-hidden relative bg-stone-800 flex-shrink-0">
                          <Image
                            src={p.imageUrl || '/img/caphesua.jpg'}
                            alt={p.name}
                            fill
                            className="object-cover group-hover:scale-105 transition"
                            unoptimized
                          />
                        </div>
                        <div>
                          <h4 className="text-xs font-bold text-stone-200 group-hover:text-amber-300 transition line-clamp-1">
                            {p.name}
                          </h4>
                          <p className="text-[11px] text-amber-400 font-semibold">{formatVND(p.price)}</p>
                        </div>
                      </div>
                      <div className="text-right">
                        <span className="text-xs font-black text-stone-100">{p.totalSold} ly</span>
                        <p className="text-[10px] text-stone-400 font-mono">{formatVND(p.totalRevenue)}</p>
                      </div>
                    </div>
                  ))}
                  {(!stats?.topSellingProducts || stats.topSellingProducts.length === 0) && (
                    <p className="text-xs text-stone-500 py-8 text-center">Chưa có dữ liệu bán hàng</p>
                  )}
                </div>
              </div>

              {/* Recent Orders Needs Action */}
              <div className="lg:col-span-2 rounded-2xl bg-stone-900/70 border border-stone-800 p-6 shadow-xl">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h3 className="text-base font-bold text-stone-100">Đơn hàng cần pha chế & bàn giao</h3>
                    <p className="text-xs text-stone-400">Thao tác nhanh chuyển đổi trạng thái phục vụ khách</p>
                  </div>
                  <button
                    onClick={() => setActiveTab('orders')}
                    className="text-xs text-amber-400 hover:text-amber-300 font-semibold transition"
                  >
                    Tất cả đơn ({orders.length}) →
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
                        className="py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:bg-stone-950/50 px-2.5 rounded-xl transition"
                      >
                        <div className="flex items-start gap-3">
                          <div className="w-10 h-10 rounded-xl bg-stone-800 flex items-center justify-center font-black text-xs text-amber-300 border border-stone-700 flex-shrink-0">
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
                              {order.items?.map((it) => `${it.qty}x ${it.product?.name} (${it.size})`).join(', ')}
                            </p>
                          </div>
                        </div>

                        <div className="flex items-center justify-between sm:justify-end gap-2.5">
                          <span className="text-sm font-black text-amber-300 whitespace-nowrap">
                            {formatVND(order.total)}
                          </span>

                          {/* Quick Actions */}
                          {order.status === 'PAID' && (
                            <button
                              onClick={() => handleUpdateOrderStatus(order.id, 'PREPARING')}
                              className="px-3 py-1.5 text-xs font-bold rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white transition shadow"
                            >
                              ☕ Pha chế
                            </button>
                          )}
                          {order.status === 'PREPARING' && (
                            <button
                              onClick={() => handleUpdateOrderStatus(order.id, 'READY')}
                              className="px-3 py-1.5 text-xs font-bold rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white transition shadow"
                            >
                              🔔 Sẵn sàng
                            </button>
                          )}
                          {order.status === 'READY' && (
                            <button
                              onClick={() => handleUpdateOrderStatus(order.id, 'COMPLETED')}
                              className="px-3 py-1.5 text-xs font-bold rounded-lg bg-teal-600 hover:bg-teal-500 text-white transition shadow"
                            >
                              ✅ Hoàn tất
                            </button>
                          )}
                          <button
                            onClick={() => setSelectedOrder(order)}
                            className="text-xs px-2.5 py-1.5 rounded-lg bg-stone-800 hover:bg-stone-700 text-stone-300 border border-stone-700 font-semibold transition"
                          >
                            Hóa đơn
                          </button>
                        </div>
                      </div>
                    );
                  })}
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
            <div className="flex flex-col lg:flex-row gap-4 justify-between items-stretch lg:items-center bg-stone-900/70 p-4 rounded-2xl border border-stone-800 shadow-xl">
              {/* Status filter pills with counts */}
              <div className="flex items-center gap-1.5 overflow-x-auto scrollbar-none pb-2 lg:pb-0">
                {[
                  { id: 'ALL', label: `Tất cả (${orders.length})` },
                  { id: 'NEED_ACTION', label: `⚡ Cần pha (${pendingActionOrders.length})` },
                  { id: 'PAID', label: `Đã thanh toán (${orders.filter((o) => o.status === 'PAID').length})` },
                  { id: 'PREPARING', label: `Đang pha (${orders.filter((o) => o.status === 'PREPARING').length})` },
                  { id: 'READY', label: `Sẵn sàng (${orders.filter((o) => o.status === 'READY').length})` },
                  { id: 'COMPLETED', label: `Hoàn tất (${orders.filter((o) => o.status === 'COMPLETED').length})` },
                  { id: 'CANCELLED', label: `Đã hủy (${orders.filter((o) => o.status === 'CANCELLED').length})` },
                  { id: 'REFUNDED', label: `Hoàn tiền (${orders.filter((o) => o.status === 'REFUNDED').length})` },
                ].map((pill) => (
                  <button
                    key={pill.id}
                    onClick={() => setOrderStatusFilter(pill.id)}
                    className={`px-3 py-1.5 rounded-xl text-xs font-bold transition whitespace-nowrap ${
                      orderStatusFilter === pill.id
                        ? 'bg-amber-500 text-stone-950 shadow-md shadow-amber-950/50'
                        : 'bg-stone-800/80 text-stone-400 hover:text-stone-200 hover:bg-stone-700/80'
                    }`}
                  >
                    {pill.label}
                  </button>
                ))}
              </div>

              {/* Search input */}
              <div className="relative min-w-[280px]">
                <input
                  type="text"
                  placeholder="Tìm theo Mã đơn, Email, Mã voucher..."
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
            <div className="rounded-2xl border border-stone-800 bg-stone-900/50 overflow-hidden shadow-2xl">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs text-stone-300">
                  <thead className="bg-stone-950/90 uppercase text-[10px] text-stone-400 font-bold border-b border-stone-800 tracking-wider">
                    <tr>
                      <th className="py-4 px-4">Mã đơn</th>
                      <th className="py-4 px-4">Thời gian</th>
                      <th className="py-4 px-4">Khách hàng</th>
                      <th className="py-4 px-4">Món đặt & Tùy chọn</th>
                      <th className="py-4 px-4">Khuyến mãi / Đổi điểm</th>
                      <th className="py-4 px-4">Tổng thanh toán</th>
                      <th className="py-4 px-4">Trạng thái</th>
                      <th className="py-4 px-4 text-right">Chuyển trạng thái</th>
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
                          <td className="py-3.5 px-4 font-black text-amber-400">#{order.id}</td>
                          <td className="py-3.5 px-4 text-stone-400 whitespace-nowrap">
                            {new Date(order.createdAt).toLocaleString('vi-VN', {
                              hour: '2-digit',
                              minute: '2-digit',
                              day: '2-digit',
                              month: '2-digit',
                            })}
                          </td>
                          <td className="py-3.5 px-4">
                            <span className="font-bold text-stone-200 block max-w-[160px] truncate">
                              {order.user?.email || `User #${order.userId}`}
                            </span>
                            <span className="text-[10px] text-stone-500 font-mono">ID: {order.userId}</span>
                          </td>
                          <td className="py-3.5 px-4">
                            <div className="max-w-[240px] space-y-0.5">
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
                              <span className="px-2 py-0.5 rounded bg-amber-950/80 text-amber-300 border border-amber-800/60 text-[10px] font-bold">
                                {order.couponCode} (-{formatVND(order.discountTotal)})
                              </span>
                            ) : order.pointsRedeemed > 0 ? (
                              <span className="text-[10px] text-purple-300">
                                -{order.pointsRedeemed} pts (-{formatVND(order.pointsRedeemed * 1000)})
                              </span>
                            ) : (
                              <span className="text-stone-600">—</span>
                            )}
                          </td>
                          <td className="py-3.5 px-4 font-black text-stone-100 whitespace-nowrap text-sm">
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
                              {/* Workflow Actions */}
                              {order.status === 'PAID' && (
                                <>
                                  <button
                                    onClick={() => handleUpdateOrderStatus(order.id, 'PREPARING')}
                                    className="px-2.5 py-1 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-[11px] font-bold transition shadow"
                                  >
                                    ☕ Bắt đầu pha
                                  </button>
                                  <button
                                    onClick={() => {
                                      if (confirm(`Xác nhận HỦY đơn hàng #${order.id}? Tồn kho sẽ được hoàn lại.`)) {
                                        handleUpdateOrderStatus(order.id, 'CANCELLED');
                                      }
                                    }}
                                    className="px-2 py-1 rounded-lg bg-rose-950/60 hover:bg-rose-900 text-rose-300 border border-rose-800 text-[11px] font-semibold transition"
                                  >
                                    Hủy
                                  </button>
                                </>
                              )}
                              {order.status === 'PREPARING' && (
                                <button
                                  onClick={() => handleUpdateOrderStatus(order.id, 'READY')}
                                  className="px-2.5 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-[11px] font-bold transition shadow"
                                >
                                  🔔 Sẵn sàng lấy
                                </button>
                              )}
                              {order.status === 'READY' && (
                                <button
                                  onClick={() => handleUpdateOrderStatus(order.id, 'COMPLETED')}
                                  className="px-2.5 py-1 rounded-lg bg-teal-600 hover:bg-teal-500 text-white text-[11px] font-bold transition shadow"
                                >
                                  ✅ Hoàn tất
                                </button>
                              )}

                              {/* Refund Action */}
                              {(order.status === 'PAID' ||
                                order.status === 'PREPARING' ||
                                order.status === 'READY' ||
                                order.status === 'COMPLETED') && (
                                <button
                                  onClick={() => {
                                    if (
                                      confirm(
                                        `Xác nhận HOÀN TIỀN (REFUND) cho đơn hàng #${order.id}? Tồn kho và điểm sẽ được hoàn lại an toàn.`,
                                      )
                                    ) {
                                      handleUpdateOrderStatus(order.id, 'REFUNDED');
                                    }
                                  }}
                                  className="px-2 py-1 rounded-lg bg-purple-950/60 hover:bg-purple-900 text-purple-300 border border-purple-800 text-[11px] font-semibold transition"
                                  title="Hoàn tiền đơn hàng"
                                >
                                  ↩️ Hoàn tiền
                                </button>
                              )}

                              <button
                                onClick={() => setSelectedOrder(order)}
                                className="px-2.5 py-1 rounded-lg bg-stone-800 hover:bg-stone-700 text-stone-200 text-[11px] font-semibold border border-stone-700 transition"
                                title="Xem hóa đơn chi tiết"
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
                        <td colSpan={8} className="py-12 text-center text-stone-500 font-medium">
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
            <div className="flex flex-col sm:flex-row justify-between items-stretch sm:items-center gap-4 bg-stone-900/70 p-4 rounded-2xl border border-stone-800 shadow-xl">
              <div className="flex items-center gap-3 flex-1 max-w-lg">
                <input
                  type="text"
                  placeholder="Tìm kiếm món theo tên..."
                  value={productSearch}
                  onChange={(e) => setProductSearch(e.target.value)}
                  className="w-full bg-stone-950 border border-stone-700/80 rounded-xl px-3.5 py-2 text-xs text-stone-200 placeholder-stone-500 focus:outline-none focus:border-amber-500 transition"
                />
                <select
                  value={stockFilter}
                  onChange={(e) => setStockFilter(e.target.value as any)}
                  className="bg-stone-950 border border-stone-700/80 rounded-xl px-3 py-2 text-xs text-stone-300 focus:outline-none focus:border-amber-500"
                >
                  <option value="ALL">Mọi mức tồn kho</option>
                  <option value="LOW">⚠️ Sắp hết (&lt;20)</option>
                  <option value="NORMAL">Còn nhiều (&ge;20)</option>
                </select>
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

                        {/* Quick Restock / Adjust Buttons */}
                        <div className="flex items-center justify-between gap-2 pt-2 border-t border-stone-800/60">
                          <span className="text-[10px] text-stone-500 uppercase font-semibold">Nhập / Xuất:</span>
                          <div className="flex gap-1.5">
                            <button
                              onClick={() => handleQuickStock(product.id, -10)}
                              disabled={product.stock < 10}
                              className="px-2 py-0.5 rounded bg-stone-800 hover:bg-stone-700 text-stone-400 text-[10px] font-bold border border-stone-700 transition disabled:opacity-40"
                              title="Giảm 10 món"
                            >
                              -10
                            </button>
                            <button
                              onClick={() => handleQuickStock(product.id, 10)}
                              className="px-2 py-0.5 rounded bg-stone-800 hover:bg-stone-700 text-stone-300 text-[10px] font-bold border border-stone-700 transition"
                              title="Thêm 10 món"
                            >
                              +10
                            </button>
                            <button
                              onClick={() => handleQuickStock(product.id, 50)}
                              className="px-2 py-0.5 rounded bg-stone-800 hover:bg-stone-700 text-stone-300 text-[10px] font-bold border border-stone-700 transition"
                              title="Thêm 50 món"
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
                        className="flex-1 py-1.5 rounded-xl bg-stone-800 hover:bg-stone-700 text-stone-200 text-xs font-bold border border-stone-700 transition"
                      >
                        ✏️ Chỉnh sửa
                      </button>
                      <button
                        onClick={() => handleDeleteProduct(product.id, product.name)}
                        className="p-1.5 px-3 rounded-xl bg-rose-950/40 hover:bg-rose-900 text-rose-300 text-xs font-bold border border-rose-800/60 transition"
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
            <div className="flex justify-between items-center bg-stone-900/70 p-4 rounded-2xl border border-stone-800 shadow-xl">
              <div>
                <h3 className="text-sm font-bold text-stone-100">Chính sách ưu đãi & Mã Voucher</h3>
                <p className="text-xs text-stone-400">Thiết lập chiết khấu và kích hoạt mã giảm giá cho khách hàng</p>
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

            <div className="rounded-2xl border border-stone-800 bg-stone-900/50 overflow-hidden shadow-2xl">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs text-stone-300">
                  <thead className="bg-stone-950/90 uppercase text-[10px] text-stone-400 font-bold border-b border-stone-800 tracking-wider">
                    <tr>
                      <th className="py-4 px-4">Mã Voucher</th>
                      <th className="py-4 px-4">Mức giảm</th>
                      <th className="py-4 px-4">Đơn tối thiểu</th>
                      <th className="py-4 px-4">Lượt sử dụng</th>
                      <th className="py-4 px-4">Hạn sử dụng</th>
                      <th className="py-4 px-4">Trạng thái</th>
                      <th className="py-4 px-4 text-right">Thao tác</th>
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
                              className={`px-3 py-1 rounded-lg text-[11px] font-bold transition border ${
                                coupon.active
                                  ? 'bg-amber-950/60 hover:bg-amber-900 text-amber-300 border-amber-800'
                                  : 'bg-emerald-950/60 hover:bg-emerald-900 text-emerald-300 border-emerald-800'
                              }`}
                            >
                              {coupon.active ? 'Tạm dừng' : 'Kích hoạt'}
                            </button>
                            <button
                              onClick={() => handleDeleteCoupon(coupon.code)}
                              className="px-2.5 py-1 rounded-lg bg-rose-950/50 hover:bg-rose-900 text-rose-300 border border-rose-800 text-[11px] font-semibold transition"
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
                        <td colSpan={7} className="py-12 text-center text-stone-500">
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
            <div className="bg-stone-900/70 p-4 rounded-2xl border border-stone-800 shadow-xl flex justify-between items-center">
              <div>
                <h3 className="text-sm font-bold text-stone-100">Danh sách Khách hàng & Hội viên</h3>
                <p className="text-xs text-stone-400">
                  Theo dõi lịch sử mua hàng, hạng thành viên và điều chỉnh điểm tích lũy
                </p>
              </div>
              <span className="text-xs px-3 py-1 rounded-full bg-purple-950/80 border border-purple-800 text-purple-300 font-bold">
                Tổng: {users.length} tài khoản
              </span>
            </div>

            <div className="rounded-2xl border border-stone-800 bg-stone-900/50 overflow-hidden shadow-2xl">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs text-stone-300">
                  <thead className="bg-stone-950/90 uppercase text-[10px] text-stone-400 font-bold border-b border-stone-800 tracking-wider">
                    <tr>
                      <th className="py-4 px-4">Mã KH</th>
                      <th className="py-4 px-4">Email đăng ký</th>
                      <th className="py-4 px-4">Hạng thành viên</th>
                      <th className="py-4 px-4">Số đơn đặt</th>
                      <th className="py-4 px-4">Đơn thành công</th>
                      <th className="py-4 px-4">Tổng chi tiêu</th>
                      <th className="py-4 px-4">Điểm tích lũy</th>
                      <th className="py-4 px-4 text-right">Thao tác</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-stone-800/60 font-medium">
                    {users.map((user) => {
                      const tier =
                        user.totalSpent >= 500000
                          ? { name: 'VIP Kim Cương', color: 'text-amber-300 bg-amber-950/60 border-amber-700' }
                          : user.totalSpent >= 200000
                          ? { name: 'VIP Vàng', color: 'text-yellow-300 bg-yellow-950/60 border-yellow-700' }
                          : user.totalSpent >= 50000
                          ? { name: 'VIP Bạc', color: 'text-stone-300 bg-stone-800 border-stone-600' }
                          : { name: 'Thành viên mới', color: 'text-stone-400 bg-stone-900 border-stone-800' };

                      return (
                        <tr key={user.id} className="hover:bg-stone-900/60 transition">
                          <td className="py-3.5 px-4 font-bold text-stone-400">#{user.id}</td>
                          <td className="py-3.5 px-4 font-bold text-stone-100">
                            {user.email}
                            {user.email === 'admin@brewlite.vn' && (
                              <span className="ml-2 text-[10px] px-1.5 py-0.2 rounded bg-amber-500/20 text-amber-300 border border-amber-500/40 font-bold">
                                ADMIN
                              </span>
                            )}
                          </td>
                          <td className="py-3.5 px-4">
                            <span
                              className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${tier.color}`}
                            >
                              {tier.name}
                            </span>
                          </td>
                          <td className="py-3.5 px-4 text-stone-300">{user.orderCount} đơn</td>
                          <td className="py-3.5 px-4 text-emerald-400 font-bold">{user.paidOrderCount} đơn</td>
                          <td className="py-3.5 px-4 font-black text-amber-300">{formatVND(user.totalSpent)}</td>
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
                              className="px-3 py-1.5 rounded-xl bg-purple-900/60 hover:bg-purple-800 text-purple-200 border border-purple-700 font-bold text-xs transition"
                            >
                              🎁 Điều chỉnh điểm
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}
      </main>

      {/* ============================================================== */}
      {/* MODAL 1: CHI TIẾT HÓA ĐƠN ĐƠN HÀNG */}
      {/* ============================================================== */}
      {selectedOrder && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-md animate-in fade-in">
          <div className="w-full max-w-xl rounded-2xl bg-stone-950 border border-amber-900/50 p-6 shadow-2xl relative max-h-[90vh] overflow-y-auto">
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
                <h3 className="text-lg font-bold text-amber-100">Hóa đơn điện tử #{selectedOrder.id}</h3>
                <p className="text-xs text-stone-400">
                  Khách: {selectedOrder.user?.email || `User #${selectedOrder.userId}`} •{' '}
                  {new Date(selectedOrder.createdAt).toLocaleString('vi-VN')}
                </p>
              </div>
            </div>

            {/* Trạng thái hiện tại */}
            <div className="p-3.5 rounded-xl bg-stone-900/80 border border-stone-800 flex items-center justify-between mb-5">
              <span className="text-xs text-stone-400 font-medium">Trạng thái đơn hàng:</span>
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

            {/* Cổng thanh toán */}
            {selectedOrder.payments && selectedOrder.payments.length > 0 && (
              <div className="mb-6 p-3 rounded-xl bg-stone-900/40 border border-stone-800/80">
                <h5 className="text-[11px] font-bold text-stone-400 uppercase mb-2">Cổng thanh toán:</h5>
                {selectedOrder.payments.map((p) => (
                  <div key={p.id} className="flex justify-between items-center text-xs text-stone-300">
                    <span>
                      {p.method} • Mã GD: <span className="font-mono text-amber-400">{p.transactionId || 'Chưa có'}</span>
                    </span>
                    <span
                      className={`font-bold ${
                        p.status === 'SUCCEEDED'
                          ? 'text-emerald-400'
                          : p.status === 'REFUNDED'
                          ? 'text-purple-400'
                          : 'text-rose-400'
                      }`}
                    >
                      {p.status}
                    </span>
                  </div>
                ))}
              </div>
            )}

            {/* Actions chuyển trạng thái ngay trong modal */}
            <div className="flex flex-wrap justify-end gap-2 pt-2 border-t border-stone-800">
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
              {(selectedOrder.status === 'PAID' ||
                selectedOrder.status === 'PREPARING' ||
                selectedOrder.status === 'READY' ||
                selectedOrder.status === 'COMPLETED') && (
                <button
                  onClick={() => {
                    if (confirm(`Xác nhận hoàn tiền cho đơn hàng #${selectedOrder.id}?`)) {
                      handleUpdateOrderStatus(selectedOrder.id, 'REFUNDED');
                    }
                  }}
                  className="px-4 py-2 rounded-xl bg-purple-950/80 hover:bg-purple-900 text-purple-200 border border-purple-800 font-bold text-xs transition"
                >
                  ↩️ Hoàn tiền (Refund)
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
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-md animate-in fade-in">
          <div className="w-full max-w-md rounded-2xl bg-stone-950 border border-amber-900/50 p-6 shadow-2xl relative">
            <button
              onClick={() => setIsProductModalOpen(false)}
              className="absolute top-4 right-4 text-stone-400 hover:text-white text-lg font-bold w-8 h-8 rounded-full bg-stone-900 flex items-center justify-center"
            >
              ✕
            </button>

            <h3 className="text-lg font-bold text-amber-100 mb-1">
              {editingProduct ? 'Chỉnh sửa sản phẩm' : 'Thêm món mới vào thực đơn'}
            </h3>
            <p className="text-xs text-stone-400 mb-5">Cập nhật thông tin chi tiết và số lượng tồn kho nguyên liệu</p>

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
                    className="w-full bg-stone-900 border border-stone-700 rounded-xl px-3.5 py-2 text-stone-100 focus:outline-none focus:border-amber-500 font-mono font-bold text-amber-300"
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
                    className="w-full bg-stone-900 border border-stone-700 rounded-xl px-3.5 py-2 text-stone-100 focus:outline-none focus:border-amber-500 font-mono"
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

                {/* Preset image selector buttons */}
                <div className="flex flex-wrap gap-1.5 mt-2">
                  {[
                    { label: 'Cà phê sữa', path: '/img/caphesua.jpg' },
                    { label: 'Americano', path: '/img/americano.jpg' },
                    { label: 'Cappuccino', path: '/img/cappuccino.jpg' },
                    { label: 'Latte', path: '/img/latte.jpg' },
                    { label: 'Trà đào', path: '/img/tradao.jpg' },
                    { label: 'Matcha Latte', path: '/img/matchalatte.jpg' },
                  ].map((preset) => (
                    <button
                      type="button"
                      key={preset.path}
                      onClick={() => setProductForm({ ...productForm, imageUrl: preset.path })}
                      className={`text-[10px] px-2 py-1 rounded-lg border transition ${
                        productForm.imageUrl === preset.path
                          ? 'bg-amber-500 text-stone-950 border-amber-400 font-bold'
                          : 'bg-stone-900 text-stone-300 border-stone-700 hover:text-amber-300'
                      }`}
                    >
                      {preset.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Live Preview Box */}
              {productForm.imageUrl && (
                <div className="p-3 rounded-xl bg-stone-900/60 border border-stone-800 flex items-center gap-3">
                  <div className="w-12 h-12 rounded-lg overflow-hidden relative bg-stone-800 flex-shrink-0">
                    <Image src={productForm.imageUrl} alt="Preview" fill className="object-cover" unoptimized />
                  </div>
                  <div>
                    <span className="text-[10px] uppercase font-bold text-stone-400">Xem trước hiển thị:</span>
                    <p className="text-xs font-bold text-stone-200">{productForm.name || 'Tên món'}</p>
                    <p className="text-[11px] text-amber-400 font-bold">{formatVND(productForm.price || 0)}</p>
                  </div>
                </div>
              )}

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
      {/* MODAL 3: TẠO VOUCHER KHUYẾN MÃI */}
      {/* ============================================================== */}
      {isCouponModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-md animate-in fade-in">
          <div className="w-full max-w-md rounded-2xl bg-stone-950 border border-amber-900/50 p-6 shadow-2xl relative">
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
                    className="w-full bg-stone-900 border border-stone-700 rounded-xl px-3.5 py-2 text-stone-100 focus:outline-none focus:border-amber-500 font-bold text-amber-400 font-mono"
                  />
                </div>
                <div>
                  <label className="block text-stone-300 font-semibold mb-1">Lượt dùng tối đa:</label>
                  <input
                    type="number"
                    min={1}
                    value={couponForm.maxUses}
                    onChange={(e) => setCouponForm({ ...couponForm, maxUses: Number(e.target.value) })}
                    className="w-full bg-stone-900 border border-stone-700 rounded-xl px-3.5 py-2 text-stone-100 focus:outline-none focus:border-amber-500 font-mono"
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
                    className="w-full bg-stone-900 border border-stone-700 rounded-xl px-3.5 py-2 text-stone-100 focus:outline-none focus:border-amber-500 font-mono"
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
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-md animate-in fade-in">
          <div className="w-full max-w-sm rounded-2xl bg-stone-950 border border-purple-900/50 p-6 shadow-2xl relative">
            <button
              onClick={() => setSelectedUserForPoints(null)}
              className="absolute top-4 right-4 text-stone-400 hover:text-white text-lg font-bold w-8 h-8 rounded-full bg-stone-900 flex items-center justify-center"
            >
              ✕
            </button>

            <h3 className="text-base font-bold text-purple-200 mb-1">Điều chỉnh điểm thưởng hội viên</h3>
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
                <label className="block text-stone-300 font-semibold mb-1">
                  Số điểm thay đổi (+ để cộng, - để trừ):
                </label>
                <input
                  type="number"
                  required
                  value={pointsDelta}
                  onChange={(e) => setPointsDelta(Number(e.target.value))}
                  className="w-full bg-stone-900 border border-stone-700 rounded-xl px-3.5 py-2 text-stone-100 focus:outline-none focus:border-purple-500 font-bold text-base text-purple-300 font-mono"
                />
              </div>

              <div className="flex gap-2">
                {[-50, 20, 50, 100].map((pts) => (
                  <button
                    type="button"
                    key={pts}
                    onClick={() => setPointsDelta(pts)}
                    className="flex-1 py-1 rounded-lg bg-stone-800 hover:bg-stone-700 text-stone-300 font-bold text-[11px] border border-stone-700 font-mono"
                  >
                    {pts > 0 ? `+${pts}` : pts}
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
                  Xác nhận lưu
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
