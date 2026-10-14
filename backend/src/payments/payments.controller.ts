import { BadRequestException, Body, Controller, Headers, Post } from '@nestjs/common';
import { PayDto } from './payments.dto.js';
import { PaymentsService } from './payments.service.js';

// TODO(D – Task 7): khi JwtStrategy xong, thêm @UseGuards(JwtAuthGuard) và @CurrentUser().
const TEMP_USER_ID = 1;

@Controller('payments')
export class PaymentsController {
  constructor(private readonly payments: PaymentsService) {}

  // Người phụ trách: F (Task 8 và Task 10.2 idempotency)
  @Post()
  pay(
    @Headers('idempotency-key') key: string,
    @Body() dto: PayDto,
  ) {
    if (!key) throw new BadRequestException('Thiếu header Idempotency-Key');
    return this.payments.pay(TEMP_USER_ID, dto, key);
  }
}
