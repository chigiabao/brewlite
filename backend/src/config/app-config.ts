const DEFAULT_FRONTEND_URL = 'http://localhost:3000';
const DEFAULT_ORDER_EXPIRY_MINUTES = 30;
const DEFAULT_CHECKOUT_TTL_MINUTES = 31;

function positiveInteger(value: string | undefined, fallback: number, name: string): number {
  if (value === undefined || value.trim() === '') return fallback;
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) {
    throw new Error(`${name} must be a positive integer`);
  }
  return parsed;
}

export function isProduction(): boolean {
  return process.env.NODE_ENV === 'production';
}

/** FRONTEND_URL supports a comma-separated list for preview/staging origins. */
export function getAllowedOrigins(): string[] {
  const raw = process.env.FRONTEND_URL?.trim() || DEFAULT_FRONTEND_URL;
  const origins = raw
    .split(',')
    .map((origin) => origin.trim().replace(/^["']|["']$/g, '').replace(/\/$/, ''))
    .filter(Boolean);

  if (origins.length === 0) return [DEFAULT_FRONTEND_URL];

  for (const origin of origins) {
    let url: URL;
    try {
      url = new URL(origin);
    } catch {
      throw new Error(`FRONTEND_URL contains an invalid origin: ${origin}`);
    }
    if (!['http:', 'https:'].includes(url.protocol)) {
      throw new Error(`FRONTEND_URL must use http/https: ${origin}`);
    }
  }

  return origins;
}

export function getFrontendUrl(): string {
  const origins = getAllowedOrigins();
  const httpsOrigin = origins.find((origin) => origin.startsWith('https://'));
  return httpsOrigin ?? origins[0];
}

export function isAutoCancelEnabled(): boolean {
  return process.env.ENABLE_ORDER_AUTO_CANCEL !== 'false';
}

export function isRefundEnabled(): boolean {
  return process.env.ENABLE_STRIPE_REFUND !== 'false';
}

/** Grace period after a Stripe Checkout session expires before releasing resources. */
export function getOrderExpiryMs(): number {
  return (
    positiveInteger(
      process.env.ORDER_PAYMENT_EXPIRY_MINUTES,
      DEFAULT_ORDER_EXPIRY_MINUTES,
      'ORDER_PAYMENT_EXPIRY_MINUTES',
    ) * 60_000
  );
}

/** Stripe requires expires_at to be between 30 minutes and 24 hours from creation. */
export function getCheckoutSessionTtlSeconds(): number {
  const minutes = positiveInteger(
    process.env.CHECKOUT_SESSION_TTL_MINUTES,
    DEFAULT_CHECKOUT_TTL_MINUTES,
    'CHECKOUT_SESSION_TTL_MINUTES',
  );
  if (minutes < 30 || minutes > 24 * 60) {
    throw new Error('CHECKOUT_SESSION_TTL_MINUTES must be between 30 and 1440');
  }
  return minutes * 60;
}

export function getRateLimitPerMinute(): number {
  const limit = positiveInteger(process.env.RATE_LIMIT_PER_MINUTE, 120, 'RATE_LIMIT_PER_MINUTE');
  return Math.max(10, Math.min(limit, 10_000));
}

export function validateEnvironment(): void {
  const errors: string[] = [];
  const required = [
    'DATABASE_URL',
    'JWT_SECRET',
    'STRIPE_SECRET_KEY',
    'STRIPE_WEBHOOK_SECRET',
  ] as const;

  for (const key of required) {
    if (!process.env[key]?.trim()) errors.push(`${key} is required`);
  }

  try {
    getAllowedOrigins();
    getOrderExpiryMs();
    getCheckoutSessionTtlSeconds();
    getRateLimitPerMinute();
  } catch (error) {
    errors.push((error as Error).message);
  }

  const port = process.env.PORT ?? '3001';
  if (!/^\d+$/.test(port) || Number(port) <= 0 || Number(port) > 65535) {
    errors.push('PORT must be a valid TCP port');
  }

  if (isProduction()) {
    const jwtSecret = process.env.JWT_SECRET ?? '';
    if (jwtSecret.length < 32) {
      errors.push('JWT_SECRET must be at least 32 characters in production');
    }
    if (jwtSecret.includes('change-me') || jwtSecret.includes('doi-thanh')) {
      errors.push('JWT_SECRET still uses an example value');
    }

    const databaseUrl = process.env.DATABASE_URL ?? '';
    if (databaseUrl.includes('brew:brew@')) {
      errors.push('DATABASE_URL still uses the default database password');
    }

    for (const origin of getAllowedOrigins()) {
      if (!origin.startsWith('https://')) {
        errors.push(`FRONTEND_URL must use https in production: ${origin}`);
      }
    }

    if (!(process.env.STRIPE_SECRET_KEY ?? '').startsWith('sk_live_')) {
      errors.push('STRIPE_SECRET_KEY must be a live key (sk_live_...) in production');
    }
  }

  if (errors.length > 0) {
    throw new Error(`Invalid environment configuration:\n- ${errors.join('\n- ')}`);
  }
}
