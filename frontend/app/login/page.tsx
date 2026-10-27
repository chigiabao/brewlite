'use client';
import { useState, useSyncExternalStore } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '../../lib/api';

function subscribe(callback: () => void) {
  window.addEventListener('storage', callback);
  return () => window.removeEventListener('storage', callback);
}

function getSnapshot(): string | null {
  return typeof window !== 'undefined' ? localStorage.getItem('token') : null;
}

function getServerSnapshot(): null {
  return null;
}

function parseEmail(token: string | null): string | null {
  if (!token) return null;
  try {
    const parts = token.split('.');
    if (parts.length === 3) {
      const base64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
      const jsonPayload = decodeURIComponent(
        atob(base64)
          .split('')
          .map((c) => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
          .join(''),
      );
      const parsed = JSON.parse(jsonPayload) as { email?: string };
      return parsed.email || null;
    }
  } catch {
    return null;
  }
  return null;
}

export default function LoginPage() {
  const router = useRouter();
  const token = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const emailFromToken = parseEmail(token);
  const hasExistingToken = Boolean(token);

  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleLogout = () => {
    localStorage.removeItem('token');
    window.dispatchEvent(new Event('storage'));
    setSuccess('Đã đăng xuất tài khoản thành công');
    setError('');
  };

  const handleSwitchMode = (newMode: 'login' | 'register') => {
    setMode(newMode);
    setError('');
    setSuccess('');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    setIsSubmitting(true);

    const trimmedEmail = email.trim();
    if (!trimmedEmail) {
      setError('Vui lòng nhập email hợp lệ');
      setIsSubmitting(false);
      return;
    }
    if (password.length < 6) {
      setError('Mật khẩu phải có tối thiểu 6 ký tự');
      setIsSubmitting(false);
      return;
    }
    if (password.length > 72) {
      setError('Mật khẩu không được vượt quá 72 ký tự');
      setIsSubmitting(false);
      return;
    }

    try {
      if (mode === 'register') {
        await api<{ id: number; email: string }>('/auth/register', {
          method: 'POST',
          body: JSON.stringify({ email: trimmedEmail, password }),
        });
        setSuccess('Đăng ký thành công! Đang tự động đăng nhập...');
      }

      const result = await api<{ accessToken: string }>('/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email: trimmedEmail, password }),
      });

      // Ghi chú bảo mật (Guide D): Lưu JWT trong localStorage theo yêu cầu của bài lab.
      // Lưu ý rủi ro XSS: mã độc JavaScript có thể đọc token từ localStorage nếu có lỗ hổng XSS.
      // Giải pháp khuyến nghị cho production là sử dụng HttpOnly Secure Cookie.
      localStorage.setItem('token', result.accessToken);
      window.dispatchEvent(new Event('storage'));
      router.push('/');
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : 'Không thể xác thực tài khoản');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (hasExistingToken) {
    const initial = emailFromToken ? emailFromToken.charAt(0).toUpperCase() : 'U';
    return (
      <div className="max-w-sm mx-auto bg-white p-6 rounded-lg shadow space-y-4 text-center border border-gray-100">
        <div className="w-16 h-16 bg-amber-500 text-amber-950 font-extrabold text-2xl rounded-full flex items-center justify-center mx-auto shadow-md ring-4 ring-amber-200">
          {initial}
        </div>
        <div>
          <h1 className="text-xl font-bold text-gray-800">Bạn đã đăng nhập</h1>
          {emailFromToken && (
            <p className="text-sm font-semibold text-amber-700 mt-1">{emailFromToken}</p>
          )}
        </div>
        <p className="text-sm text-gray-600">
          Tài khoản của bạn đã được xác thực qua JWT. Bạn có thể tiếp tục mua sắm hoặc đăng xuất.
        </p>
        {success && <p className="text-sm text-green-600 font-medium bg-green-50 p-2 rounded">{success}</p>}
        <div className="space-y-2 pt-2">
          <button
            onClick={() => router.push('/')}
            className="w-full bg-amber-600 text-white py-2 rounded font-medium hover:bg-amber-700 transition shadow-sm"
          >
            Về trang chủ mua hàng
          </button>
          <button
            onClick={handleLogout}
            className="w-full border border-gray-300 text-gray-700 py-2 rounded font-medium hover:bg-gray-50 transition"
          >
            Đăng xuất tài khoản
          </button>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="max-w-sm mx-auto bg-white p-6 rounded-lg shadow space-y-3.5 border border-gray-100">
      <h1 className="text-xl font-bold text-gray-900">{mode === 'login' ? 'Đăng nhập' : 'Đăng ký'}</h1>
      <p className="text-xs text-gray-600">
        {mode === 'login'
          ? 'Đăng nhập để đặt đơn và thanh toán an toàn'
          : 'Tạo tài khoản mới để lưu lịch sử và tích điểm'}
      </p>

      {success && <p className="text-sm text-green-700 bg-green-50 p-2 rounded border border-green-200 font-medium">{success}</p>}
      {error && <p className="text-sm text-red-700 bg-red-50 p-2 rounded border border-red-200 font-medium">{error}</p>}

      <div>
        <label className="block text-xs font-semibold text-gray-800 mb-1">Email</label>
        <input
          type="email"
          placeholder="user@example.com"
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="w-full border border-gray-300 bg-white text-gray-900 placeholder:text-gray-400 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-amber-500"
        />
      </div>

      <div>
        <label className="block text-xs font-semibold text-gray-800 mb-1">Mật khẩu (6 - 72 ký tự)</label>
        <input
          type="password"
          placeholder="••••••••"
          autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="w-full border border-gray-300 bg-white text-gray-900 placeholder:text-gray-400 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-amber-500"
        />
      </div>

      <button
        disabled={isSubmitting}
        className="w-full bg-amber-600 text-white py-2.5 rounded font-medium hover:bg-amber-700 disabled:opacity-50 transition shadow-sm"
      >
        {isSubmitting ? 'Đang xử lý...' : mode === 'login' ? 'Đăng nhập' : 'Đăng ký tài khoản'}
      </button>

      <button
        type="button"
        onClick={() => handleSwitchMode(mode === 'login' ? 'register' : 'login')}
        className="w-full text-sm text-amber-700 hover:underline pt-1 text-center block"
      >
        {mode === 'login' ? 'Chưa có tài khoản? Đăng ký ngay' : 'Đã có tài khoản? Đăng nhập'}
      </button>

      <div className="pt-2 border-t border-gray-100">
        <p className="text-xs text-gray-500 mb-1.5 font-medium">Chọn nhanh tài khoản mẫu:</p>
        <div className="flex flex-wrap gap-1.5">
          <button
            type="button"
            onClick={() => {
              setEmail('customer@brewlite.vn');
              setPassword('password123');
              setError('');
            }}
            className="text-xs bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-200 px-2.5 py-1 rounded transition font-medium"
          >
            customer@brewlite.vn
          </button>
          <button
            type="button"
            onClick={() => {
              setEmail('admin@brewlite.vn');
              setPassword('password123');
              setError('');
            }}
            className="text-xs bg-gray-100 hover:bg-gray-200 text-gray-700 border border-gray-300 px-2.5 py-1 rounded transition font-medium"
          >
            admin@brewlite.vn
          </button>
        </div>
      </div>
    </form>
  );
}
