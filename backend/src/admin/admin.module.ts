import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { PrismaModule } from '../prisma/prisma.module.js';
import { OrdersModule } from '../orders/public.js';
import { AdminRoleGuard } from './admin-role.guard.js';
import { AdminController } from './admin.controller.js';
import { AdminService } from './admin.service.js';
import { BomService } from './bom/bom.service.js';

@Module({
  imports: [PrismaModule, AuthModule, OrdersModule],
  controllers: [AdminController],
  providers: [AdminService, AdminRoleGuard, BomService],
  exports: [AdminService, BomService],
})
export class AdminModule {}
