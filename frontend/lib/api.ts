// API client dùng chung. Người phụ trách: A (API client dùng chung); B/C/D/E/F/G chỉ gọi qua hàm public.
const BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';

export class ApiError extends Error {
  readonly status: number;
  readonly code?: string;
  constructor(message: string, status: number, code?: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
  }
}

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
    const message = typeof body?.message === 'string'
      ? body.message
      : Array.isArray(body?.message) ? body.message.join(', ') : `Lỗi ${res.status}`;
    throw new ApiError(message, res.status, typeof body?.code === 'string' ? body.code : undefined);
  }
  return res.json();
}
