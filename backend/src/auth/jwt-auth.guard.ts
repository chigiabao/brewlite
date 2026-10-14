import { Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

// Dùng @UseGuards(JwtAuthGuard) cho các route cần đăng nhập.
// Chỉ chạy được sau khi D đăng ký JwtStrategy (Task 7).
@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {}
