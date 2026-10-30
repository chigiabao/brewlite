import { Body, Controller, Post } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { AuthDto } from './auth.dto.js';
import { AuthService } from './auth.service.js';

// Người phụ trách: D (Task 7)
@Controller('auth')
@Throttle({ default: { limit: 10, ttl: 60_000 } })
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Post('register')
  register(@Body() dto: AuthDto) {
    return this.auth.register(dto);
  }

  @Post('login')
  login(@Body() dto: AuthDto) {
    return this.auth.login(dto);
  }
}
