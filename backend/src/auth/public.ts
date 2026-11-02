// D – API công khai cho E/F: chỉ import từ file này, không import file auth nội bộ.
export { JwtAuthGuard } from './jwt-auth.guard.js';
export { CurrentUser } from './current-user.decorator.js';
export type { AuthUser } from './current-user.decorator.js';

// Module export for consumers that need to register the Passport JWT strategy.
export { AuthModule } from './auth.module.js';
