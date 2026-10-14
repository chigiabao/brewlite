import { Injectable } from '@nestjs/common';

// Cổng thanh toán giả lập (Task 8 – F).
// Quy ước: ref (số thẻ/ví) kết thúc bằng 0000 thì lỗi (để demo PAYMENT_FAILED).
@Injectable()
export class MockGatewayService {
  async charge(amount: number, method: string, ref?: string) {
    await new Promise((r) => setTimeout(r, 300)); // giả lập độ trễ
    const ok = !(ref ?? '').endsWith('0000');
    return { ok, transactionId: ok ? `TX-${Date.now()}` : null };
  }
}
