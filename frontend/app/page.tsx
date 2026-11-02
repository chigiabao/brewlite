'use client';

import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { useState, useMemo } from 'react';
import { getProducts } from '@/lib/products-api';

const PLACEHOLDER_IMG =
  "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='400' height='300' viewBox='0 0 400 300' fill='%23F3F4F6'><rect width='400' height='300' fill='%23F3F4F6'/><path d='M160 110h80v70a40 40 0 0 1-40 40 40 40 0 0 1-40-40v-70Z' stroke='%239CA3AF' stroke-width='6' fill='%23E5E7EB'/><path d='M240 130h16a16 16 0 0 1 16 16v8a16 16 0 0 1-16 16h-16' stroke='%239CA3AF' stroke-width='6' fill='none'/><path d='M175 85c0-10 10-15 10-25M200 85c0-10 10-15 10-25M225 85c0-10 10-15 10-25' stroke='%23D1D5DB' stroke-width='4' stroke-linecap='round'/><text x='50%25' y='260' text-anchor='middle' font-family='sans-serif' font-size='14' fill='%239CA3AF' font-weight='600'>BrewLite Coffee</text></svg>";

const CATEGORIES = [
  { id: 'all', label: 'Tất cả món', icon: '✨' },
  { id: 'vietnamese', label: 'Cà phê Việt', icon: '☕' },
  { id: 'espresso', label: 'Espresso & Latte', icon: '🥛' },
  { id: 'tea', label: 'Trà trái cây', icon: '🍃' },
  { id: 'specialty', label: 'Specialty & Cold Brew', icon: '🧊' },
] as const;

export default function MenuPage() {
  const { data: rawProducts, isPending, isError, refetch } = useQuery({
    queryKey: ['products'],
    queryFn: getProducts,
  });

  const [activeCategory, setActiveCategory] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [sortBy, setSortBy] = useState<'popular' | 'price-asc' | 'price-desc'>('popular');

  // Chỉ chọn món thực sự lấy từ backend cho ô nổi bật, không ghim ID/giá giả.
  const featuredProduct = rawProducts?.find((product) => product.stock > 0);

  // Lọc và sắp xếp menu từ dữ liệu API
  const products = useMemo(() => {
    if (!rawProducts) return [];

    let list = [...rawProducts];

    // Filter by Category
    if (activeCategory !== 'all') {
      list = list.filter((p) => p.category === activeCategory);
    }

    // Filter by Search Query
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      list = list.filter(
        (p) =>
          p.name.toLowerCase().includes(q) ||
          (p.description && p.description.toLowerCase().includes(q)),
      );
    }

    // Sort
    if (sortBy === 'price-asc') {
      list.sort((a, b) => a.price - b.price);
    } else if (sortBy === 'price-desc') {
      list.sort((a, b) => b.price - a.price);
    } else {
      // popular
      list.sort((a, b) => (b.rating ?? -1) - (a.rating ?? -1));
    }

    return list;
  }, [rawProducts, activeCategory, searchQuery, sortBy]);

  return (
    <div className="space-y-16 pb-16">
      {/* 1. HERO SECTION */}
      <section className="relative overflow-hidden bg-gradient-to-br from-stone-950 via-amber-950/90 to-stone-900 text-white rounded-3xl mx-4 sm:mx-6 lg:mx-8 mt-4 shadow-2xl border border-amber-900/30">
        {/* Glow ambient effects */}
        <div className="absolute top-0 right-0 w-96 h-96 bg-amber-500/10 rounded-full blur-3xl pointer-events-none"></div>
        <div className="absolute bottom-0 left-0 w-80 h-80 bg-amber-700/10 rounded-full blur-3xl pointer-events-none"></div>

        <div className="relative max-w-7xl mx-auto px-6 sm:px-10 lg:px-12 py-16 lg:py-24 grid grid-cols-1 lg:grid-cols-12 gap-12 items-center">
          {/* Left Column: Headlines & CTA */}
          <div className="lg:col-span-7 space-y-6 text-center lg:text-left">
            <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-amber-900/50 border border-amber-500/30 text-amber-300 text-xs font-bold tracking-wide uppercase shadow-sm">
              <span className="w-2 h-2 rounded-full bg-amber-400 animate-ping"></span>
              <span>100% Cà Phê Rang Mộc Thượng Hạng</span>
            </div>

            <h1 className="text-3xl sm:text-5xl lg:text-6xl font-black tracking-tight leading-tight text-stone-100">
              Đánh Thức Ngày Mới Bằng{' '}
              <span className="bg-gradient-to-r from-amber-200 via-amber-400 to-amber-200 bg-clip-text text-transparent">
                Hương Vị Cà Phê Đích Thực
              </span>
            </h1>

            <p className="text-stone-300 text-base sm:text-lg leading-relaxed max-w-2xl mx-auto lg:mx-0">
              Tuyển chọn từ những hạt Arabica Cầu Đất &amp; Robusta Buôn Ma Thuột hảo hạng nhất. Rang mộc thủ công, giữ trọn hương hoa quả mộc mạc và hậu vị ngọt sâu lắng.
            </p>

            <div className="pt-2 flex flex-col sm:flex-row items-center justify-center lg:justify-start gap-4">
              <a
                href="#menu"
                className="w-full sm:w-auto px-8 py-4 rounded-xl font-extrabold text-base bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-600 hover:to-amber-700 text-stone-950 shadow-lg shadow-amber-900/40 hover:scale-[1.02] active:scale-[0.98] transition-all flex items-center justify-center gap-2"
              >
                <span>Khám Phá Menu</span>
                <span>☕</span>
              </a>

              <a
                href="#story"
                className="w-full sm:w-auto px-6 py-4 rounded-xl font-bold text-base text-amber-200/90 hover:text-white bg-white/5 hover:bg-white/10 border border-white/10 transition-all flex items-center justify-center gap-2"
              >
                <span>Câu Chuyện Cà Phê</span>
                <span>↓</span>
              </a>
            </div>

            {/* Social Proof Stats */}
            <div className="pt-8 border-t border-stone-800 grid grid-cols-3 gap-6 text-center lg:text-left">
              <div>
                <p className="text-2xl sm:text-3xl font-black text-amber-400">S / M / L</p>
                <p className="text-xs text-stone-400 font-medium">Ba kích cỡ đồ uống</p>
              </div>
              <div>
                <p className="text-2xl sm:text-3xl font-black text-amber-400">2</p>
                <p className="text-xs text-stone-400 font-medium">Lựa chọn topping</p>
              </div>
              <div>
                <p className="text-2xl sm:text-3xl font-black text-amber-400">Ví / Thẻ</p>
                <p className="text-xs text-stone-400 font-medium">Thanh toán mô phỏng</p>
              </div>
            </div>
          </div>

          {/* Right Column: Hero Visual Card */}
          <div className="lg:col-span-5 flex justify-center">
            <div className="relative w-full max-w-sm rounded-2xl p-4 bg-gradient-to-b from-stone-900/90 to-stone-950/90 border border-amber-600/30 shadow-2xl backdrop-blur-md group">
              <div className="relative h-72 w-full rounded-xl overflow-hidden mb-4 bg-stone-900">
                <img
                  src="https://images.unsplash.com/photo-1541167760496-1628856ab772?w=800&auto=format&fit=crop&q=80"
                  alt="Hình minh họa cà phê BrewLite"
                  className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                />
              </div>

              <div className="space-y-2">
                {featuredProduct ? (
                  <>
                    <div className="flex items-center justify-between gap-3">
                      <h3 className="text-lg font-bold text-stone-100">{featuredProduct.name}</h3>
                      <span className="text-amber-400 font-extrabold text-lg whitespace-nowrap">
                        {featuredProduct.price.toLocaleString('vi-VN')}đ
                      </span>
                    </div>
                    <p className="text-xs text-stone-400 line-clamp-2">
                      {featuredProduct.description || 'Khám phá món đang có trong thực đơn BrewLite.'}
                    </p>
                    <Link
                      href={`/products/${featuredProduct.id}`}
                      className="mt-3 block w-full py-2.5 rounded-lg text-center font-bold text-xs bg-amber-700/80 hover:bg-amber-600 text-white transition shadow"
                    >
                      Xem món nổi bật →
                    </Link>
                  </>
                ) : (
                  <p className="text-xs text-stone-400">
                    Thực đơn đang được tải hoặc chưa có món khả dụng. Xem trạng thái ở phần Menu bên dưới.
                  </p>
                )}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* 2. TRUST & VALUE PERKS BAR */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 sm:gap-6">
          <div className="bg-white p-5 rounded-2xl border border-stone-200/80 shadow-sm hover:shadow-md transition flex items-start gap-4">
            <div className="w-11 h-11 rounded-xl bg-amber-100 text-amber-800 flex items-center justify-center text-xl shrink-0">
              🚀
            </div>
            <div>
              <h4 className="font-bold text-stone-900 text-sm">Giao trong 30 phút</h4>
              <p className="text-xs text-stone-500 mt-0.5">Đá nguyên vẹn, giữ trọn độ lạnh thơm ngon.</p>
            </div>
          </div>

          <div className="bg-white p-5 rounded-2xl border border-stone-200/80 shadow-sm hover:shadow-md transition flex items-start gap-4">
            <div className="w-11 h-11 rounded-xl bg-amber-100 text-amber-800 flex items-center justify-center text-xl shrink-0">
              🌿
            </div>
            <div>
              <h4 className="font-bold text-stone-900 text-sm">Hạt rang mộc 100%</h4>
              <p className="text-xs text-stone-500 mt-0.5">Không phẩm màu, không bắp đậu hay phụ gia.</p>
            </div>
          </div>

          <div className="bg-white p-5 rounded-2xl border border-stone-200/80 shadow-sm hover:shadow-md transition flex items-start gap-4">
            <div className="w-11 h-11 rounded-xl bg-amber-100 text-amber-800 flex items-center justify-center text-xl shrink-0">
              💳
            </div>
            <div>
              <h4 className="font-bold text-stone-900 text-sm">Thanh toán không chạm</h4>
              <p className="text-xs text-stone-500 mt-0.5">Tiện lợi, an toàn qua Ví điện tử và Thẻ.</p>
            </div>
          </div>

          <div className="bg-white p-5 rounded-2xl border border-stone-200/80 shadow-sm hover:shadow-md transition flex items-start gap-4">
            <div className="w-11 h-11 rounded-xl bg-amber-100 text-amber-800 flex items-center justify-center text-xl shrink-0">
              🎁
            </div>
            <div>
              <h4 className="font-bold text-stone-900 text-sm">Tích điểm đổi quà</h4>
              <p className="text-xs text-stone-500 mt-0.5">Tích lũy đến 15% cho mỗi đơn hàng thành công.</p>
            </div>
          </div>
        </div>
      </section>

      {/* 3. MENU SECTION */}
      <section id="menu" className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 scroll-mt-24">
        {/* Section Header */}
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 mb-8">
          <div>
            <div className="inline-flex items-center gap-1.5 text-xs font-bold text-amber-700 uppercase tracking-widest mb-1.5">
              <span>☕</span>
              <span>Menu Tuyển Chọn</span>
            </div>
            <h2 className="text-3xl font-extrabold text-stone-900 tracking-tight">
              Thực Đơn Đồ Uống Đặc Sắc
            </h2>
            <p className="text-sm text-stone-500 mt-1">
              Thưởng thức những ly cà phê nguyên chất và thức uống giải nhiệt tươi ngon mỗi ngày.
            </p>
          </div>

          {/* Search Input */}
          <div className="relative w-full md:w-72">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Tìm món đồ uống..."
              className="w-full pl-9 pr-8 py-2.5 bg-white border border-stone-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-amber-600 focus:border-transparent transition shadow-sm"
            />
            <span className="absolute left-3 top-3 text-stone-400 text-sm">🔍</span>
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-2.5 top-2.5 text-stone-400 hover:text-stone-600 text-sm"
              >
                ✕
              </button>
            )}
          </div>
        </div>

        {/* Categories Bar & Sort Options */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-6 border-b border-stone-200">
          {/* Category Tabs */}
          <div className="flex items-center gap-2 overflow-x-auto pb-2 sm:pb-0 scrollbar-none">
            {CATEGORIES.map((cat) => {
              const active = activeCategory === cat.id;
              return (
                <button
                  key={cat.id}
                  onClick={() => setActiveCategory(cat.id)}
                  className={`px-4 py-2 rounded-xl text-xs sm:text-sm font-bold whitespace-nowrap transition-all flex items-center gap-1.5 ${
                    active
                      ? 'bg-amber-800 text-white shadow-md shadow-amber-900/20 scale-[1.02]'
                      : 'bg-white text-stone-600 hover:bg-stone-100 border border-stone-200'
                  }`}
                >
                  <span>{cat.icon}</span>
                  <span>{cat.label}</span>
                </button>
              );
            })}
          </div>

          {/* Sort Selector */}
          <div className="flex items-center gap-2 text-xs font-semibold text-stone-500 self-end sm:self-auto">
            <span>Sắp xếp:</span>
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as 'popular' | 'price-asc' | 'price-desc')}
              className="bg-white border border-stone-300 rounded-lg px-2.5 py-1.5 text-xs text-stone-800 font-medium focus:outline-none focus:ring-1 focus:ring-amber-600"
            >
              <option value="popular">Được yêu thích nhất</option>
              <option value="price-asc">Giá: Thấp đến Cao</option>
              <option value="price-desc">Giá: Cao đến Thấp</option>
            </select>
          </div>
        </div>

        {/* Loading / Error States */}
        {isPending && (
          <div className="py-24 flex flex-col items-center justify-center text-amber-800">
            <div className="w-10 h-10 border-4 border-amber-800/20 border-t-amber-800 rounded-full animate-spin mb-3"></div>
            <p className="text-sm font-semibold">Đang chuẩn bị thực đơn tươi ngon...</p>
          </div>
        )}

        {isError && (
          <div className="py-16 text-center bg-white rounded-2xl border border-red-200 p-8 my-8 shadow-sm">
            <p className="text-red-600 font-bold text-base mb-2">Không thể tải dữ liệu thực đơn</p>
            <p className="text-xs text-stone-500 mb-4">Vui lòng kiểm tra kết nối mạng và thử lại.</p>
            <button
              onClick={() => refetch()}
              className="px-5 py-2.5 bg-amber-700 hover:bg-amber-800 text-white font-bold text-xs rounded-lg transition"
            >
              Tải lại thực đơn
            </button>
          </div>
        )}

        {/* API trả []: cửa hàng chưa có sản phẩm. Không hiển thị dữ liệu giả. */}
        {!isPending && !isError && (rawProducts?.length ?? 0) === 0 && (
          <div className="py-16 text-center bg-white rounded-2xl border border-stone-200 p-8 my-8">
            <p className="text-stone-700 font-bold">Cửa hàng chưa có sản phẩm trên hệ thống</p>
            <p className="text-xs text-stone-500 mt-2">Hãy kiểm tra dữ liệu seed hoặc tải lại danh sách.</p>
            <button type="button" onClick={() => refetch()} className="mt-4 px-4 py-2 bg-amber-800 text-white rounded-lg text-xs font-bold">
              Tải lại thực đơn
            </button>
          </div>
        )}

        {/* Danh sách có món, nhưng bộ lọc/từ khóa không tìm ra kết quả. */}
        {!isPending && !isError && (rawProducts?.length ?? 0) > 0 && products.length === 0 && (
          <div className="py-20 text-center bg-white rounded-2xl border border-stone-200 p-8 my-8">
            <span className="text-4xl">🔍</span>
            <p className="text-stone-700 font-bold mt-3">Không tìm thấy món đồ uống phù hợp</p>
            <p className="text-xs text-stone-400 mt-1">
              Thử tìm kiếm với từ khóa khác hoặc bấm xem tất cả món.
            </p>
            <button
              onClick={() => {
                setActiveCategory('all');
                setSearchQuery('');
              }}
              className="mt-4 px-4 py-2 bg-stone-100 hover:bg-stone-200 text-stone-800 rounded-lg text-xs font-bold transition"
            >
              Xem tất cả đồ uống
            </button>
          </div>
        )}

        {/* Products Grid */}
        {!isPending && !isError && products.length > 0 && (
          <div className="grid grid-cols-2 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-5 sm:gap-6 mt-8">
            {products.map((product) => (
              <div
                key={product.id}
                className="group bg-white rounded-2xl border border-stone-200/90 hover:border-amber-500/40 p-3 sm:p-4 hover:shadow-xl transition-all duration-300 flex flex-col justify-between"
              >
                <div>
                  {/* Image container */}
                  <Link href={`/products/${product.id}`} className="block relative overflow-hidden rounded-xl bg-stone-100 aspect-4/3 mb-3">
                    <img
                      src={product.imageUrl}
                      alt={product.name}
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                      onError={(e) => {
                        e.currentTarget.onerror = null;
                        e.currentTarget.src = PLACEHOLDER_IMG;
                      }}
                    />

                    {/* Badge */}
                    {product.badge && (
                      <span className="absolute top-2.5 left-2.5 bg-amber-500 text-stone-950 text-[10px] sm:text-xs font-black px-2.5 py-0.5 rounded-full shadow">
                        {product.badge}
                      </span>
                    )}

                    {/* Rating */}
                    {product.rating && (
                      <span className="absolute bottom-2.5 left-2.5 bg-stone-950/75 backdrop-blur-md text-amber-300 text-[10px] font-bold px-2 py-0.5 rounded-md border border-white/10">
                        ⭐ {product.rating}
                      </span>
                    )}

                    {/* Out of Stock overlay */}
                    {product.stock <= 0 && (
                      <div className="absolute inset-0 bg-stone-950/60 backdrop-blur-[2px] flex items-center justify-center">
                        <span className="bg-red-600 text-white text-xs font-extrabold px-3 py-1 rounded-full shadow">
                          Tạm hết hàng
                        </span>
                      </div>
                    )}
                  </Link>

                  {/* Title & Description */}
                  <Link href={`/products/${product.id}`}>
                    <h3 className="font-bold text-stone-900 text-sm sm:text-base group-hover:text-amber-800 transition line-clamp-1">
                      {product.name}
                    </h3>
                  </Link>

                  {product.description && (
                    <p className="text-xs text-stone-500 mt-1 line-clamp-2 leading-relaxed">
                      {product.description}
                    </p>
                  )}
                </div>

                {/* Price & Action */}
                <div className="mt-4 pt-3 border-t border-stone-100 flex items-center justify-between">
                  <div>
                    <div className="text-amber-800 font-extrabold text-base sm:text-lg">
                      {product.price.toLocaleString('vi-VN')}đ
                    </div>
                    {product.originalPrice && (
                      <div className="text-[11px] text-stone-400 line-through">
                        {product.originalPrice.toLocaleString('vi-VN')}đ
                      </div>
                    )}
                  </div>

                  <Link
                    href={`/products/${product.id}`}
                    className="px-3 py-2 bg-amber-50 hover:bg-amber-800 text-amber-900 hover:text-white rounded-xl text-xs font-bold transition flex items-center gap-1 shadow-sm"
                  >
                    <span>Chọn</span>
                    <span>+</span>
                  </Link>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* 4. BRAND STORY SECTION */}
      <section id="story" className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="bg-gradient-to-r from-stone-900 to-amber-950 text-white rounded-3xl p-8 sm:p-12 lg:p-16 border border-amber-800/40 grid grid-cols-1 lg:grid-cols-2 gap-10 items-center">
          <div className="space-y-4">
            <span className="text-amber-400 text-xs font-bold uppercase tracking-widest">
              Câu Chuyện Thương Hiệu
            </span>
            <h2 className="text-2xl sm:text-4xl font-extrabold leading-tight">
              Từ Nông Trại Cao Nguyên Đến Tách Cà Phê Của Bạn
            </h2>
            <p className="text-stone-300 text-sm sm:text-base leading-relaxed">
              BrewLite ra đời với khát khao đưa ly cà phê Việt Nam lên tầm cao mới: sạch tinh khiết, rang mộc chuẩn gu và tiện lợi tối đa. Chúng tôi liên kết trực tiếp cùng nông hộ tại Cầu Đất (Đà Lạt) và Cư M&apos;gar (Đắk Lắk), kiểm soát nghiêm ngặt từng công đoạn thu hái quả chín đỏ 100%.
            </p>
            <div className="pt-2 flex items-center gap-6 text-sm text-amber-200">
              <div>
                <p className="font-bold text-white text-lg">Độ cao 1.500m</p>
                <p className="text-xs text-stone-400">Thổ nhưỡng bazan màu mỡ</p>
              </div>
              <div className="h-8 w-px bg-stone-700"></div>
              <div>
                <p className="font-bold text-white text-lg">Rang Mộc Chậm</p>
                <p className="text-xs text-stone-400">Giữ nguyên tinh dầu quý</p>
              </div>
            </div>
          </div>

          <div className="rounded-2xl overflow-hidden shadow-2xl border border-white/10 aspect-16/10">
            <img
              src="https://images.unsplash.com/photo-1447933601403-0c6688de566e?w=800&auto=format&fit=crop&q=80"
              alt="Hạt cà phê rang mộc"
              className="w-full h-full object-cover hover:scale-105 transition duration-700"
            />
          </div>
        </div>
      </section>

      {/* 5. CUSTOMER REVIEWS */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center max-w-xl mx-auto mb-10">
          <span className="text-amber-700 text-xs font-bold uppercase tracking-widest">
            Khách Hàng Nói Về BrewLite
          </span>
          <h2 className="text-2xl sm:text-3xl font-extrabold text-stone-900 mt-1">
            Hơn 15.000 Tách Cà Phê Mỗi Ngày
          </h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="bg-white p-6 rounded-2xl border border-stone-200 shadow-sm space-y-3">
            <div className="text-amber-500 text-sm">★★★★★</div>
            <p className="text-stone-600 text-sm italic leading-relaxed">
              &quot;Cà phê muối ở đây ngon vượt kỳ vọng! Kem mặn mượt mà, cà phê thơm lừng không bị gắt cổ. Đặt giao hàng chỉ 20 phút là tới tay còn nguyên bọt kem.&quot;
            </p>
            <div className="pt-2 border-t border-stone-100 flex items-center gap-3">
              <div className="w-8 h-8 rounded-full bg-amber-200 text-amber-900 font-bold flex items-center justify-center text-xs">
                MA
              </div>
              <div>
                <p className="font-bold text-stone-900 text-xs">Minh Anh</p>
                <p className="text-[10px] text-stone-400">Khách hàng thân thiết • Q.1</p>
              </div>
            </div>
          </div>

          <div className="bg-white p-6 rounded-2xl border border-stone-200 shadow-sm space-y-3">
            <div className="text-amber-500 text-sm">★★★★★</div>
            <p className="text-stone-600 text-sm italic leading-relaxed">
              &quot;Web đặt hàng mượt mà ghê, chọn size chọn topping rõ ràng. Mình thích nhất Cold Brew Cam Vàng, uống thanh mát mà tỉnh táo cả buổi chiều làm việc.&quot;
            </p>
            <div className="pt-2 border-t border-stone-100 flex items-center gap-3">
              <div className="w-8 h-8 rounded-full bg-amber-200 text-amber-900 font-bold flex items-center justify-center text-xs">
                TH
              </div>
              <div>
                <p className="font-bold text-stone-900 text-xs">Tuấn Hưng</p>
                <p className="text-[10px] text-stone-400">Lập trình viên • Bình Thạnh</p>
              </div>
            </div>
          </div>

          <div className="bg-white p-6 rounded-2xl border border-stone-200 shadow-sm space-y-3">
            <div className="text-amber-500 text-sm">★★★★★</div>
            <p className="text-stone-600 text-sm italic leading-relaxed">
              &quot;Giao diện web nhìn sang trọng, cà phê pha chuẩn vị rang mộc không bị ngọt lịm kiểu hương liệu. Xứng đáng 10 sao cho dịch vụ và chất lượng!&quot;
            </p>
            <div className="pt-2 border-t border-stone-100 flex items-center gap-3">
              <div className="w-8 h-8 rounded-full bg-amber-200 text-amber-900 font-bold flex items-center justify-center text-xs">
                HL
              </div>
              <div>
                <p className="font-bold text-stone-900 text-xs">Hương Lan</p>
                <p className="text-[10px] text-stone-400">Nhân viên văn phòng • Q.3</p>
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
