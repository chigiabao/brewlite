import { JwtStrategy } from './jwt.strategy.js';

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
});
