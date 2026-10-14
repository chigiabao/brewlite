// API client dùng chung. Người phụ trách: A (API client dùng chung); B/C/D/E/F/G chỉ gọi qua hàm public.
const BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';

export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null;
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...init?.headers,
    },
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.message ?? `Lỗi ${res.status}`);
  }
  return res.json();
}
