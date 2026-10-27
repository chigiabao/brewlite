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
