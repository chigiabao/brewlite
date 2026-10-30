import { JwtStrategy, getJwtSecret } from './jwt.strategy.js';

describe('JwtStrategy', () => {
  beforeEach(() => {
    process.env.JWT_SECRET = 'unit-test-secret';
  });

  it('maps the verified JWT payload to the public auth principal', () => {
    const strategy = new JwtStrategy();

    expect(strategy.validate({ sub: 42, email: 'user@example.com' })).toEqual({
      userId: 42,
      email: 'user@example.com',
    });
  });

  it('rejects JWTs with invalid subjects or no valid email', () => {
    const strategy = new JwtStrategy();
    for (const sub of [0, -1, NaN, '42', null]) {
      expect(() => strategy.validate({ sub, email: 'user@example.com' } as never)).toThrow();
    }
    expect(() => strategy.validate({ sub: 42, email: '' })).toThrow();
  });

  it('throws error in production when JWT_SECRET is missing', () => {
    delete process.env.JWT_SECRET;
    const oldEnv = process.env.NODE_ENV;
    try {
      process.env.NODE_ENV = 'production';
      expect(() => getJwtSecret()).toThrow('JWT_SECRET phải được cấu hình');
    } finally {
      process.env.NODE_ENV = oldEnv;
    }
  });
});
