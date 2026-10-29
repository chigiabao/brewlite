'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useSyncExternalStore } from 'react';

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
      // Decode base64url payload
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

export function AuthHeader() {
  const router = useRouter();
  const token = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const email = parseEmail(token);
  const isLoggedIn = Boolean(token);

  const handleLogout = () => {
    localStorage.removeItem('token');
    window.dispatchEvent(new Event('storage'));
    router.push('/login');
  };

  if (!isLoggedIn) {
    return (
      <Link
        href="/login"
        id="header-login-link"
        className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-amber-100 hover:text-white bg-amber-950/50 hover:bg-amber-900/60 rounded-full border border-amber-700/40 transition shadow-sm"
      >
        <span>👤 Đăng nhập</span>
      </Link>
    );
  }

  const initial = email ? email.charAt(0).toUpperCase() : 'U';

  return (
    <div className="flex items-center gap-2.5" id="header-user-section">
      <Link
        href="/login"
        id="header-user-avatar"
        title={`Tài khoản: ${email ?? 'Người dùng'}`}
        className="flex items-center gap-2 hover:opacity-90 transition group"
      >
        <div className="w-8 h-8 rounded-full bg-amber-500 text-amber-950 font-bold flex items-center justify-center text-sm ring-2 ring-amber-300 shadow">
          {initial}
        </div>
        {email && (
          <span className="text-xs text-amber-100 max-w-[130px] truncate hidden md:inline font-medium">
            {email}
          </span>
        )}
      </Link>
      <button
        onClick={handleLogout}
        id="header-logout-btn"
        className="text-xs bg-amber-900/60 hover:bg-amber-900 text-amber-100 px-2.5 py-1 rounded transition border border-amber-700/60 font-medium"
      >
        Đăng xuất
      </button>
    </div>
  );
}
