// Trang đăng nhập / đăng ký. Người phụ trách: D (Task 7), C hỗ trợ giao diện.
'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api';

export default function LoginPage() {
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  // D/G-03: tạo tài khoản rồi đăng nhập, lưu JWT để Orders/Payments đọc user thật.
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      if (mode === 'register') {
        await api('/auth/register', { method: 'POST', body: JSON.stringify({ email, password }) });
      }
      const response = await api<{ accessToken: string }>('/auth/login', {
        method: 'POST', body: JSON.stringify({ email, password }),
      });
      localStorage.setItem('token', response.accessToken);
      router.push('/cart');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Không thể đăng nhập');
    } finally { setLoading(false); }
  };

  return (
    <form onSubmit={handleSubmit} className="max-w-sm mx-auto bg-white p-6 rounded-lg shadow space-y-3">
      <h1 className="text-xl font-bold">{mode === 'login' ? 'Đăng nhập' : 'Đăng ký'}</h1>
      <input
        type="email"
        placeholder="Email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        className="w-full border rounded px-3 py-2"
      />
      <input
        type="password"
        placeholder="Mật khẩu (tối thiểu 6 ký tự)"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        className="w-full border rounded px-3 py-2"
      />
      {error && <p role="alert" className="text-red-700 text-sm">{error}</p>}
      <button disabled={loading} className="w-full bg-amber-600 text-white py-2 rounded hover:bg-amber-700">
        {mode === 'login' ? 'Đăng nhập' : 'Đăng ký'}
      </button>
      <button
        type="button"
        onClick={() => setMode(mode === 'login' ? 'register' : 'login')}
        className="w-full text-sm text-amber-700 underline"
      >
        {mode === 'login' ? 'Chưa có tài khoản? Đăng ký' : 'Đã có tài khoản? Đăng nhập'}
      </button>
    </form>
  );
}
