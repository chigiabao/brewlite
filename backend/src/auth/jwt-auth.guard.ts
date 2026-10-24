import { Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

// Dùng @UseGuards(JwtAuthGuard) cho các route cần đăng nhập.
// Passport resolves the registered JwtStrategy for this guard.
@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {}
